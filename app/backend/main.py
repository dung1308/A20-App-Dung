from dotenv import load_dotenv
load_dotenv()  # This must be called before importing pipeline or database

import uvicorn
import os
import io
import tempfile
import time
import jwt
import re
import uuid
from datetime import datetime, timedelta
import logging
from fastapi import FastAPI, HTTPException, Depends, Request
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from typing import List, Dict, Any, Optional
from fastapi.security import OAuth2PasswordBearer

from orchestrator.pipeline import Pipeline
from utils.logger import get_logger
from fastapi import UploadFile, File
from database import init_database, SessionLocal, get_database_info
from services.pdf_loader import extract_text_from_pdf
from services.metric_service import MetricService
from guards.rate_limiter import RateLimiter
from guards.admin_audit import AdminAuditMiddleware

# Suppress noisy font warnings from pdfminer/pdfplumber
logging.getLogger("pdfminer").setLevel(logging.ERROR)

# Google Auth imports
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com")
SECRET_KEY = os.getenv("SECRET_KEY", "your-super-secret-key-change-in-production")
ALGORITHM = "HS256"

# Define where to get the token (header: Authorization: Bearer <token>)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

# --- Permission Mapping ---
ROLE_PERMISSIONS = {
    "admin": ["system:all", "db:manage", "tokens:view", "profile:edit"],
    "editor": ["tokens:view", "profile:edit"],
    "user": ["profile:edit", "match:run"]
}

logger = get_logger(__name__)

app = FastAPI(
    title="VinUni Admission Assistant API",
    description="Backend API for major matching and admission chat support.",
    version="0.1.0"
)

# --- Helper Security Functions ---
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=1440)  # 24h
    
    role = data.get("role", "user")
    base_permissions = ROLE_PERMISSIONS.get(role, [])
    # Merge role-based permissions with custom database-persisted permissions
    custom_permissions = data.get("permissions") or []
    all_permissions = list(set(base_permissions + custom_permissions))
    
    to_encode.update({"exp": expire, "permissions": all_permissions})
    
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme)):
    """Dependency to validate JWT and return current user info."""
    credentials_exception = HTTPException(
        status_code=401,
        detail="Không thể xác thực thông tin đăng nhập",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        # Decode JWT
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            logger.warning("JWT payload missing 'sub' claim")
            raise credentials_exception
        return {
            "email": email, 
            "role": payload.get("role"), 
            "permissions": payload.get("permissions", [])
        }
    except jwt.ExpiredSignatureError:
        logger.warning("JWT token has expired")
        raise HTTPException(
            status_code=401,
            detail="Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError as e:
        logger.error(f"JWT verification error: {e}")
        raise credentials_exception
    except Exception as e:
        logger.error(f"Auth error: {e}")
        raise credentials_exception

class RoleChecker:
    """Class-based dependency to check for various user roles."""
    def __init__(self, allowed_roles: List[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, current_user: dict = Depends(get_current_user)):
        if current_user.get("role") not in self.allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Quyền truy cập bị từ chối. Yêu cầu một trong các vai trò: {', '.join(self.allowed_roles)}"
            )
        return current_user

# Define reusable instances for common permission sets
admin_required = RoleChecker(["admin"])
staff_required = RoleChecker(["admin", "editor"])
user_required = RoleChecker(["admin", "user", "editor"])

def sanitize_id(raw_id: str) -> str:
    """Sanitizes strings to be used as database identifiers (namespaces/collection names)."""
    if raw_id is None or not str(raw_id).strip():
        return "anonymous"
        
    # Replace anything not alpha-numeric, dot, underscore, or dash with underscore
    sanitized = re.sub(r'[^a-zA-Z0-9._-]', '_', str(raw_id))
    # Ensure it starts and ends with alpha-numeric (stripping leading/trailing symbols)
    return sanitized.strip('._-')

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize the Orchestrator Pipeline
pipeline = Pipeline()

# Register the Admin Audit Middleware
app.add_middleware(AdminAuditMiddleware, pipeline=pipeline)

# Initialize database on startup
@app.on_event("startup")
def startup_event():
    """Initialize database when the application starts."""
    try:
        init_database()
        logger.info("Database initialized on startup")
        
        # Chạy migration để cập nhật schema (thêm cột title nếu cần)
        pipeline.db_service.migrate_db()
        
    except Exception as e:
        logger.critical(f"CRITICAL: Failed to initialize database on startup: {e}")
        # Stop the application if the database is unreachable to avoid inconsistent states
        raise SystemExit(1)

# Initialize global rate limiter for sensitive endpoints
metrics_limiter = RateLimiter()

class ChatRequest(BaseModel):
    user_id: Optional[str] = Field("anonymous", alias="userId")
    session_id: Optional[str] = Field(None, alias="sessionId")
    message: str = Field(..., alias="text")
    history: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    persona_summary: Optional[str] = None

    model_config = {
        "populate_by_name": True
    }

class SignupRequest(BaseModel):
    full_name: str
    email: str
    password: str
    admin_key: Optional[str] = None

    @field_validator('password')
    @classmethod
    def password_complexity(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError('Mật khẩu phải có ít nhất 8 ký tự.')
        if len(v) > 128:
            raise ValueError('Mật khẩu không được dài quá 128 ký tự.')
        if not re.search(r'[A-Z]', v):
            raise ValueError('Mật khẩu phải chứa ít nhất một chữ cái in hoa.')
        if not re.search(r'[a-z]', v):
            raise ValueError('Mật khẩu phải chứa ít nhất một chữ cái thường.')
        if not re.search(r'\d', v):
            raise ValueError('Mật khẩu phải chứa ít nhất một chữ số.')
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
            raise ValueError('Mật khẩu phải chứa ít nhất một ký tự đặc biệt.')
        return v

class LoginRequest(BaseModel):
    email: str
    password: str

class RenameSessionRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)

class GoogleLoginRequest(BaseModel):
    token: str

class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    dob: Optional[str] = None
    phone: Optional[str] = None
    gpa: Optional[float] = None
    test_scores: Optional[Dict[str, Any]] = None
    preferred_majors: Optional[List[str]] = None

class EmailLogRequest(BaseModel):
    user_id: str

class MatchRequest(BaseModel):
    user_id: str
    answers: Dict[str, Any]
    cv_text: Optional[str] = None
    cv_signals: Optional[Dict[str, Any]] = None

@app.get("/health")
async def health_check():
    """Confirm the service is live and reachable."""
    return {"status": "ok", "service": "vinuni-assistant-backend"}

@app.post("/api/chat")
async def chat(request: ChatRequest, current_user: dict = Depends(get_current_user)):
    """Route free-form chat messages through the pipeline."""
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message text cannot be empty")

    # Security: Override user_id from payload with the authenticated user's email
    user_id = current_user["email"]

    # Handle new session initialization
    session_id = request.session_id
    if not session_id or session_id == "new":
        session_id = str(uuid.uuid4())

    # Ensure the orchestrator result is wrapped in the structure 
    # expected by ConsultantPage.jsx (response.response)
    chat_response = pipeline.run_chat(
        user_id, 
        request.message, 
        request.history, 
        session_id=session_id,
        persona_summary=request.persona_summary
    )

    if isinstance(chat_response, str):
        return {"response": chat_response}
    return chat_response

@app.get("/api/chat/sessions/{user_id}")
async def get_chat_sessions(user_id: str, current_user: dict = Depends(get_current_user)):
    """Retrieve all chat sessions for a specific user."""
    # Security check: Users can only see their own sessions unless they are an admin
    if current_user.get("role") != "admin" and current_user.get("email") != user_id:
        raise HTTPException(status_code=403, detail="Bạn không có quyền xem phiên chat của người dùng khác")

    sessions = pipeline.db_service.get_user_sessions(user_id)
    return {"status": "success", "sessions": sessions}

@app.get("/api/chat/sessions/{session_id}/messages")
async def get_session_messages(session_id: str, current_user: dict = Depends(get_current_user)):
    """Retrieve message history for a specific session."""
    # 1. Verify session existence and ownership
    session = pipeline.db_service.get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Phiên hội thoại không tồn tại")

    # 2. Security check
    is_admin = current_user.get("role") == "admin"
    is_owner = current_user.get("email") == session["user_id"]
    
    if not is_admin and not is_owner:
        raise HTTPException(status_code=403, detail="Bạn không có quyền truy cập dữ liệu này")

    messages = pipeline.db_service.get_history(session["user_id"], session_id=session_id)
    return {"status": "success", "messages": messages}

@app.get("/api/chat/sessions/{session_id}/download")
async def download_chat_history(session_id: str, current_user: dict = Depends(get_current_user)):
    """Generate and stream a text file containing the chat history."""
    # 1. Verify session existence and ownership
    session = pipeline.db_service.get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Phiên hội thoại không tồn tại")

    if current_user.get("role") != "admin" and current_user.get("email") != session["user_id"]:
        raise HTTPException(status_code=403, detail="Bạn không có quyền tải dữ liệu này")

    # 2. Fetch all messages for the session
    messages = pipeline.db_service.get_history(session["user_id"], session_id=session_id, limit=200)
    
    # 3. Format history as text
    output = io.StringIO()
    output.write(f"LỊCH SỬ TRÒ CHUYỆN - VINUNI ADMISSION ASSISTANT\n")
    output.write(f"Phiên: {session.get('title', 'Hội thoại mới')}\n")
    output.write(f"Ngày tạo: {session.get('created_at')}\n")
    output.write("="*50 + "\n\n")

    for msg in messages:
        role_label = "Học sinh" if msg["role"] == "user" else "Trợ lý VinUni"
        timestamp = f" [{msg['timestamp']}]" if msg.get("timestamp") else ""
        output.write(f"{role_label}{timestamp}:\n{msg['content']}\n")
        output.write("-" * 20 + "\n")

    # 4. Stream as file
    stream = io.BytesIO(output.getvalue().encode("utf-8"))
    filename = f"chat_history_{session_id[:8]}.txt"
    return StreamingResponse(stream, media_type="text/plain", headers={"Content-Disposition": f"attachment; filename={filename}"})

@app.delete("/api/chat/sessions/{session_id}")
async def delete_chat_session(session_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a specific chat session and its history."""
    # 1. Check if session exists and get owner info
    session = pipeline.db_service.get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Phiên hội thoại không tồn tại")

    # 2. Security check: Only owner or admin can delete
    is_admin = current_user.get("role") == "admin"
    is_owner = current_user.get("email") == session["user_id"]
    
    if not is_admin and not is_owner:
        raise HTTPException(status_code=403, detail="Bạn không có quyền xóa phiên hội thoại này")

    pipeline.db_service.delete_session(session_id)
    return {"status": "success", "message": f"Đã xóa phiên hội thoại {session_id} thành công"}

@app.patch("/api/chat/sessions/{session_id}/rename")
async def rename_chat_session(
    session_id: str, 
    request: RenameSessionRequest, 
    current_user: dict = Depends(get_current_user)
):
    """Allow a user to manually rename a specific chat session."""
    # 1. Check if session exists
    session = pipeline.db_service.get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Phiên hội thoại không tồn tại")

    # 2. Security check: Only owner or admin can rename
    if current_user.get("role") != "admin" and current_user.get("email") != session["user_id"]:
        raise HTTPException(status_code=403, detail="Bạn không có quyền đổi tên phiên hội thoại này")

    if pipeline.db_service.update_session_title(session_id, request.title):
        return {"status": "success", "message": "Đã đổi tên phiên hội thoại thành công"}
    raise HTTPException(status_code=500, detail="Không thể cập nhật tên phiên hội thoại")

@app.get("/api/handoff-summary")
async def get_handoff_summary(user_id: str, current_user: dict = Depends(staff_required)):
    """Retrieve a summary of the student profile and chat context for human handoff."""
    # Implementation fix: Building the handoff summary directly using CRM and DB services
    # as a fallback for the missing method in the Pipeline class.
    profile = pipeline.crm.get_profile(user_id) or {}
    history = pipeline.db_service.get_history(user_id, limit=6)
    
    if not profile and not history:
        raise HTTPException(status_code=404, detail="Không tìm thấy dữ liệu bàn giao cho học sinh này")

    summary_parts = [
        f"=== BÁO CÁO BÀN GIAO NHÂN VIÊN TƯ VẤN ===",
        f"Học sinh: {user_id}",
        f"Ngày tạo: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC",
        "\n[1. THÔNG TIN HỒ SƠ]",
        f"- Họ tên: {profile.get('full_name', 'Chưa cập nhật')}",
        f"- Số điện thoại: {profile.get('phone', 'N/A')}",
        f"- GPA: {profile.get('gpa', 'Chưa có')}",
        f"- IELTS: {(profile.get('test_scores') or {}).get('ielts', 'N/A')}",
        f"- Ngành quan tâm: {', '.join(profile.get('preferred_majors') or []) if profile.get('preferred_majors') else 'Chưa xác định'}",
        "\n[2. DIỄN BIẾN HỘI THOẠI GẦN NHẤT]"
    ]

    if history:
        # Chronological order for context
        for msg in reversed(history):
            role = "Học sinh" if msg['role'] == 'user' else "AI Assistant"
            content = msg['content'][:300] + ("..." if len(msg['content']) > 300 else "")
            summary_parts.append(f"\n[{role}]:\n{content}")
    else:
        summary_parts.append("\n(Không có lịch sử trò chuyện được ghi lại)")

    return {"user_id": user_id, "handoff_summary": "\n".join(summary_parts)}

@app.get("/api/metrics")
async def get_metrics(hours: int = 336, current_user: dict = Depends(admin_required)):
    """Retrieve PMF-focused metrics over a requested time window."""
    # Rate limiting check to prevent abuse of compute-intensive metric aggregation
    if not metrics_limiter.allow(current_user["email"]):
        raise HTTPException(
            status_code=429, 
            detail="Yêu cầu quá thường xuyên. Vui lòng thử lại sau giây lát."
        )

    try:
        metric_service = MetricService(pipeline.db_service)
        return metric_service.get_pmf_metrics(hours_back=hours)
    except Exception as e:
        logger.error(f"Error fetching metrics: {e}")
        raise HTTPException(status_code=500, detail="Không thể tải dữ liệu thống kê")

@app.get("/api/admin/audit-logs")
async def get_audit_logs(user_id: Optional[str] = None, only_fallback: bool = False, limit: int = 100, current_user: dict = Depends(staff_required)):
    """Retrieve the most recent system activity logs for administrative review."""
    from models.schemas import AuditLog
    from sqlalchemy import or_
    try:
        with SessionLocal() as session:
            query = session.query(AuditLog)
            if user_id:
                query = query.filter(AuditLog.user_id.ilike(f"%{user_id}%"))
            if only_fallback:
                query = query.filter(or_(AuditLog.ai_resolved == False, AuditLog.fallback == True))
            logs = query.order_by(AuditLog.timestamp.desc()).limit(limit).all()
            return [{
                "id": log.id,
                "user_id": log.user_id,
                "timestamp": log.timestamp.isoformat() if log.timestamp else None,
                "route": log.route,
                "input": log.input_data,
                "output": log.output_data,
                "latency": log.response_time_ms,
                "judge_result": log.judge_result,
                "ai_resolved": log.ai_resolved,
                "fallback": log.fallback
            } for log in logs]
    except Exception as e:
        logger.error(f"Error fetching audit logs: {e}")
        raise HTTPException(status_code=500, detail="Không thể tải nhật ký hệ thống")

@app.post("/api/audit/email-sent")
async def log_email_action(request: EmailLogRequest, current_user: dict = Depends(staff_required)):
    """Explicitly logs when a counselor/staff initiates an email to a student."""
    try:
        pipeline.db_service.save_audit_log(
            user_id=current_user["email"],
            input_data=f"STAFF_ACTION: Opened email client for student {request.user_id}",
            output_data="Action: mailto client triggered",
            judge_result={"action": "email_initiated", "target_student": request.user_id},
            route="staff_action",
            ai_resolved=True,
            fallback=False
        )
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Failed to log email action: {e}")
        raise HTTPException(status_code=500, detail="Lỗi khi ghi nhật ký hoạt động")

@app.post("/api/auth/signup")
async def signup(request: SignupRequest):
    """Handle student registration."""
    # 1. Kiểm tra người dùng tồn tại
    existing_user = pipeline.db_service.get_student_profile(request.email)
    if existing_user:
        raise HTTPException(status_code=400, detail="Email này đã được đăng ký.")

    try:
        # Determine role based on email domain or provided secret admin key
        admin_signup_key = os.getenv("ADMIN_SIGNUP_KEY", "dev-admin-key")
        is_admin_key_valid = request.admin_key == admin_signup_key if request.admin_key else False
        
        role = "admin" if (request.email.endswith("@vinuni.edu.vn") or is_admin_key_valid) else "user"

        user_data = {
            "full_name": request.full_name,
            "email": request.email,
            "password": request.password,
            "role": role
        }
        # Use email as the internal user_id for consistency across login/signup
        pipeline.db_service.upsert_student_profile(request.email, user_data)
        
        return {"status": "success", "message": "Đăng ký thành công!"}
    except Exception as e:
        logger.error(f"Signup error: {e}")
        raise HTTPException(status_code=500, detail="Lỗi khi tạo tài khoản.")

@app.post("/api/auth/login")
async def login(request: LoginRequest):
    """Verify credentials and return access token."""
    # Offload verification to Database SQL functions
    user = pipeline.db_service.authenticate_user(request.email, request.password)

    if not user:
        raise HTTPException(status_code=401, detail="Email hoặc mật khẩu không đúng")

    # 2. Tạo JWT token thực tế
    role = user.get("role", "user")
    db_permissions = user.get("permissions") or []
    token = create_access_token({"sub": request.email, "role": role, "permissions": db_permissions})
    
    all_permissions = list(set(ROLE_PERMISSIONS.get(role, []) + db_permissions))

    return {
        "status": "success", 
        "token": token, 
        "user_email": request.email, 
        "role": role,
        "permissions": all_permissions
    }

@app.post("/api/auth/google")
async def google_auth(request: GoogleLoginRequest):
    """Verify Google ID Token and return application session."""
    try:
        # Verify the token against Google's servers
        id_info = id_token.verify_oauth2_token(
            request.token, 
            google_requests.Request(), 
            GOOGLE_CLIENT_ID
        )

        # Extract user info
        email = id_info.get('email')
        full_name = id_info.get('name')
        picture = id_info.get('picture') # URL ảnh đại diện từ Google
        
        if not email:
            raise HTTPException(status_code=400, detail="Token không chứa email")

        # Fetch existing user to include persisted permissions
        user = pipeline.db_service.get_student_profile(email)
        db_permissions = user.get("permissions") or [] if user else []

        # Logic phân quyền tương tự login thường
        role = user.get("role") if user else ("admin" if email.endswith("@vinuni.edu.vn") else "user")
        
        app_token = create_access_token({"sub": email, "role": role, "permissions": db_permissions})
        
        all_permissions = list(set(ROLE_PERMISSIONS.get(role, []) + db_permissions))

        return {
            "status": "success", 
            "token": app_token, 
            "user_email": email, 
            "role": role, 
            "permissions": all_permissions,
            "full_name": full_name,
            "picture": picture
        }

    except ValueError as e:
        logger.error(f"Google Token validation failed: {e}")
        raise HTTPException(status_code=401, detail="Token Google không hợp lệ")

@app.post("/api/match")
async def match(request: MatchRequest, current_user: dict = Depends(get_current_user)):
    """Submit wizard answers for major matching recommendations."""
    # Security hardening: Use the authenticated user's ID from the token
    authenticated_user_id = current_user["email"]

    # 1. Generate the major matching results via Advisor Agent
    results = pipeline.run_match(authenticated_user_id, request.answers, request.cv_text, request.cv_signals)
    
    # 2. Persist to SQL DB for CRM Agent and Profile Page
    try:
        # We pass a copy of answers to upsert_student_profile
        # db_service handles the extraction of GPA, test scores, etc.
        pipeline.db_service.upsert_student_profile(authenticated_user_id, request.answers.copy())
        logger.info(f"Student profile persisted to SQL for: {authenticated_user_id}")
    except Exception as e:
        logger.error(f"Failed to persist student profile to SQL: {e}")

    # 3. Store the survey answers as context for the RAG service (Vector DB)
    try:
        summary_parts = ["Student Profile and Preferences:"]
        for category, selection in request.answers.items():
            if selection:
                # Format list values (like interests) or strings (like work style)
                val_str = ", ".join(selection) if isinstance(selection, list) else str(selection)
                summary_parts.append(f"- {category.replace('_', ' ').capitalize()}: {val_str}")
        
        context_text = "\n".join(summary_parts)
        pipeline.rag.rag_service.ingest_cv(sanitize_id(authenticated_user_id), context_text)
        logger.info(f"Wizard answers indexed for user context: {authenticated_user_id}")
    except Exception as e:
        logger.error(f"Failed to ingest wizard answers for user {authenticated_user_id}: {e}")
        
    return results

@app.get("/api/profile/{user_id}")
async def get_profile(user_id: str, current_user: dict = Depends(get_current_user)):
    """Retrieve the structured student profile as managed by the CRM agent."""
    # Bảo mật: Cho phép staff xem mọi profile, hoặc user tự xem profile của chính mình
    if current_user.get("role") not in ["admin", "editor"] and current_user.get("email") != user_id:
        raise HTTPException(status_code=403, detail="Bạn không có quyền xem hồ sơ này")

    profile = pipeline.crm.get_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile

@app.post("/api/profile/{user_id}")
async def update_profile(user_id: str, request: ProfileUpdateRequest, current_user: dict = Depends(get_current_user)):
    """Update student profile information."""
    # Bảo mật: Cho phép staff cập nhật mọi profile, hoặc user tự cập nhật profile của chính mình
    if current_user.get("role") not in ["admin", "editor"] and current_user.get("email") != user_id:
        raise HTTPException(status_code=403, detail="Bạn không có quyền cập nhật hồ sơ này")

    try:
        # Chuyển đổi dữ liệu request thành dict để cập nhật vào DB
        update_data = request.model_dump(exclude_unset=True)
        
        # Sử dụng db_service để cập nhật thông tin (giả định upsert hỗ trợ các trường này)
        pipeline.db_service.upsert_student_profile(user_id, update_data)
        
        logger.info(f"Profile updated for user: {user_id}")
        return {"status": "success", "message": "Thông tin hồ sơ đã được cập nhật"}
    except Exception as e:
        logger.error(f"Failed to update profile: {e}")
        raise HTTPException(status_code=500, detail="Không thể cập nhật hồ sơ")

@app.get("/api/system/db-status")
async def get_db_status(admin: dict = Depends(admin_required)):
    """Admin-only endpoint to check database statistics."""
    db_info = get_database_info()
    return {
        "status": "connected" if db_info["connected"] else "disconnected",
        "database": db_info["name"],
        "type": db_info["type"],
        "tables": ["users", "students", "chat_messages", "majors"],
        "accessed_by": admin["email"]
    }

@app.get("/api/test-db/users")
async def get_all_users_test(admin: dict = Depends(admin_required)):
    """Admin-only test endpoint to verify registered users."""
    users = pipeline.db_service.get_all_users()
    return {"status": "success", "count": len(users), "users": users}

@app.post("/api/upload-cv")
async def upload_cv(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """Upload and index a PDF CV."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận tệp tin định dạng PDF.")

    try:
        user_id = current_user["email"] # Use the email from the authenticated user
        # Create a temporary file that is automatically deleted
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        try:
            text = extract_text_from_pdf(tmp_path)
            
            # EXTRACT CV SIGNALS: Extract structured attributes (majors, confidence, GPA)
            # to provide immediate feedback to the student and aid prompt context.
            cv_signals = {}
            if hasattr(pipeline, 'cv_agent') and pipeline.cv_agent:
                cv_signals = pipeline.cv_agent.analyze(text)

            pipeline.rag.rag_service.ingest_cv(sanitize_id(user_id), text)
        except Exception as e:
            logger.error(f"Failed to process PDF: {e}")
            raise HTTPException(status_code=400, detail="Tệp tin PDF không hợp lệ hoặc bị lỗi cấu trúc.")
        
        return {
            "status": "CV indexed successfully", 
            "filename": file.filename,
            "cv_signals": cv_signals,
            "cv_text": text
        }
    finally:
        # Clean up the temp file after indexing
        if 'tmp_path' in locals() and os.path.exists(tmp_path):
            os.remove(tmp_path)

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)