from pathlib import Path
from dotenv import load_dotenv

# Load backend-local settings first, then fill missing shared settings from repo root.
# This keeps local runs stable regardless of where uvicorn is launched from.
BACKEND_DIR = Path(__file__).resolve().parent
REPO_ROOT = BACKEND_DIR.parent.parent
load_dotenv(BACKEND_DIR / ".env")
load_dotenv(REPO_ROOT / ".env")

import uvicorn
import os
import io
import tempfile
import time
import jwt
import re
import uuid
import threading
import json
import ast
import secrets
from collections import Counter, defaultdict
from datetime import datetime, timedelta
import logging
from fastapi import FastAPI, HTTPException, Depends, Request
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from typing import List, Dict, Any, Optional
from fastapi.security import OAuth2PasswordBearer
from fastapi.exceptions import RequestValidationError

from orchestrator.pipeline import Pipeline
from utils.logger import get_logger
from fastapi import UploadFile, File
import database
from services.pdf_loader import extract_text_from_pdf
from services.cv_parser import parse_cv_with_llm
from services.metric_service import MetricService
from config import CORS_ORIGINS, ALLOW_PROMPT_DELETION
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

# Global RAG Configuration (In-memory for now, could be in DB)
rag_config = {
    "sync_interval_hours": 24
}

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
        try:
            profile = pipeline.db_service.get_student_profile(email)
            if profile and profile.get("blacklisted"):
                raise HTTPException(status_code=403, detail="TÃ i khoáº£n nÃ y Ä‘Ã£ bá»‹ khá»‘a trong há»‡ thá»‘ng.")
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"Could not verify blacklist status for {email}: {e}")
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

def is_human_handoff_request(text: str) -> bool:
    """Detect explicit student requests for a human counselor/advisor."""
    normalized = (text or "").lower()
    human_terms = [
        "human",
        "counsellor",
        "counselor",
        "advisor",
        "staff",
        "consultant",
        "tu van vien",
        "tư vấn viên",
        "chuyen vien",
        "chuyên viên",
        "nguoi that",
        "người thật",
    ]
    request_terms = ["call", "connect", "contact", "request", "need", "want", "gap", "gặp", "ket noi", "kết nối", "goi", "gọi"]
    return any(term in normalized for term in human_terms) and any(term in normalized for term in request_terms)

def _get_handoff_log(trace_id: str):
    """Fetch a handoff audit log row by trace_id."""
    from models.schemas import AuditLog

    if database.SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database is not available")
    with database.SessionLocal() as session:
        log = session.query(AuditLog).filter(AuditLog.trace_id == trace_id).first()
        if not log:
            raise HTTPException(status_code=404, detail="Human handoff request not found")
        return {
            "trace_id": log.trace_id,
            "user_id": log.user_id,
            "handoff_status": log.handoff_status,
            "escalation_reason": log.escalation_reason,
            "timestamp": log.timestamp.isoformat() if log.timestamp else None,
        }

def _assert_handoff_access(trace_id: str, current_user: dict) -> Dict[str, Any]:
    """Allow staff or the owning student to access a human handoff transcript."""
    handoff = _get_handoff_log(trace_id)
    profile = pipeline.db_service.get_student_profile(current_user.get("email")) or {}
    allowed_user_ids = {current_user.get("email"), profile.get("user_id")}
    if current_user.get("role") in {"admin", "editor"} or handoff["user_id"] in allowed_user_ids:
        return handoff
    raise HTTPException(status_code=403, detail="You do not have access to this handoff")

def create_student_handoff_job(user_id: str, session_id: Optional[str], message: Optional[str]) -> Dict[str, Any]:
    """Create a pending human fallback job visible to admin/editor staff."""
    from models.schemas import AuditLog, User
    from sqlalchemy import func

    clean_message = (message or "Student requested human counselor support.").strip()
    ack = (
        "Your human counsellor request has been created. "
        "A staff member can accept it from the Staff page and continue in a separate human-only chat window."
    )
    trace_id = f"handoff-{uuid.uuid4().hex[:16]}"
    resolved_user_id = user_id

    try:
        if database.SessionLocal is None:
            raise RuntimeError("database.SessionLocal is not initialized")
        with database.SessionLocal() as session:
            existing_user = session.query(User).filter(
                (User.user_id == user_id) | (func.lower(User.email) == func.lower(user_id))
            ).first()
            if not existing_user:
                existing_user = User(user_id=user_id, email=user_id, role="user")
                session.add(existing_user)
                session.flush()
            resolved_user_id = existing_user.user_id
            session.add(AuditLog(
                user_id=resolved_user_id,
                trace_id=trace_id,
                input_data=f"STUDENT_HANDOFF_REQUEST: {clean_message}",
                output_data=ack,
                input_text=clean_message,
                output_text=ack,
                judge_result={
                    "action": "student_handoff_request",
                    "escalation_level": "MEDIUM",
                    "escalation_reason": "Student explicitly requested a human counselor.",
                    "session_id": session_id,
                },
                escalation_level="MEDIUM",
                escalation_reason="Student explicitly requested a human counselor.",
                handoff_status="pending",
                route="fallback",
                ai_resolved=False,
                fallback=True,
                timestamp=datetime.utcnow(),
            ))
            session.commit()
    except Exception as e:
        logger.error(f"Could not create handoff audit job: {e}")
        raise HTTPException(status_code=500, detail="Could not create human handoff job")

    student_name = pipeline.db_service.display_name_for_user(resolved_user_id, "Student")
    pipeline.db_service.save_handoff_message(
        trace_id=trace_id,
        user_id=resolved_user_id,
        sender_id=resolved_user_id,
        sender_name=student_name,
        sender_role="student",
        role="student",
        content=clean_message,
    )
    return {
        "response": ack,
        "answer": ack,
        "intent": "fallback",
        "status": "escalated",
        "fallback": True,
        "sessionId": session_id,
        "session_id": session_id,
        "trace_id": trace_id,
        "handoff_status": "pending",
        "sources": [],
        "recommendations": [],
        "major": [],
        "top3": [],
        "fallback_card": {
            "reason_code": "student_requested_human",
            "reason": "Student explicitly requested a human counselor.",
            "next_action": "wait_for_staff",
            "cta": {"label": "Open human chat", "action": "handoff_status"},
        },
        "recovery_actions": [
            {"id": "continue_chat", "label": "Continue Chat"},
            {"id": "open_resources", "label": "Open Resources"},
        ],
        "decision_trace": {
            "flow": "chat",
            "route": "fallback",
            "status": "escalated",
            "handoff_status": "pending",
            "trace_id": trace_id,
        },
    }

    clean_message = (message or "Student requested human counselor support.").strip()
    if session_id:
        pipeline.db_service.save_message(
            user_id=user_id,
            role="user",
            content=clean_message,
            agent_type="handoff_request",
            session_id=session_id,
            sources=[],
        )

    ack = (
        "Mình đã gửi yêu cầu tới tư vấn viên. "
        "Admin/editor sẽ thấy job này trong trang Staff và có thể nhận phiên để hỗ trợ bạn."
    )
    if session_id:
        pipeline.db_service.save_message(
            user_id=user_id,
            role="assistant",
            content=ack,
            agent_type="fallback",
            session_id=session_id,
            sources=[],
        )

    pipeline.db_service.save_audit_log(
        user_id=user_id,
        input_data=f"STUDENT_HANDOFF_REQUEST: {clean_message}",
        output_data=ack,
        judge_result={
            "action": "student_handoff_request",
            "escalation_level": "MEDIUM",
            "escalation_reason": "Student explicitly requested a human counselor.",
        },
        route="fallback",
        ai_resolved=False,
        fallback=True,
        handoff_status="pending",
    )
    return {
        "response": ack,
        "answer": ack,
        "intent": "fallback",
        "status": "escalated",
        "fallback": True,
        "sessionId": session_id,
        "session_id": session_id,
        "sources": [],
        "recommendations": [],
        "major": [],
        "top3": [],
        "fallback_card": {
            "reason_code": "student_requested_human",
            "reason": "Student explicitly requested a human counselor.",
            "next_action": "wait_for_staff",
            "cta": {"label": "Waiting for advisor", "action": "handoff_status"},
        },
        "recovery_actions": [
            {"id": "continue_chat", "label": "Continue Chat"},
            {"id": "open_resources", "label": "Open Resources"},
        ],
        "decision_trace": {
            "flow": "chat",
            "route": "fallback",
            "status": "escalated",
            "handoff_status": "pending",
        },
    }

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Database & Pipeline Initialization ---
# We initialize the database at the global level to ensure SessionLocal is available 
# when the Pipeline (and its nested agents) are instantiated below.
try:
    database.init_database()
    logger.info("Database initialized at module level.")
    
    # Run migrations immediately after DB init so tables (like 'prompts') 
    # exist before the Pipeline/Agents are created below.
    database.get_database_info() # Warm up connection
except Exception as e:
    logger.critical(f"CRITICAL: Failed to initialize database: {e}")
    raise SystemExit(1)

# Initialize the Orchestrator Pipeline
pipeline = Pipeline()

def run_periodic_ingestion(interval_hours: int = 12):
    """Background thread to refresh RAG data periodically."""
    interval_seconds = interval_hours * 3600
    logger.info(f"Background sync thread started. Interval: {interval_hours}h")
    while True:
        time.sleep(interval_seconds)
        try:
            logger.info("Starting periodic RAG data sync...")
            pipeline.rag.rag_service.sync_all()
            logger.info("Periodic RAG data sync completed successfully.")
        except Exception as e:
            logger.error(f"Periodic RAG sync failed: {e}")

# Register the Admin Audit Middleware
app.add_middleware(AdminAuditMiddleware, pipeline=pipeline)

# Initialize database on startup
@app.on_event("startup")
def startup_event():
    """Initialize database when the application starts."""
    # Note: database.init_database() is now called at module level to support Agent init.
    try:
        # Run migrations and start background tasks
        # We call it again here just to be safe, but it's now primarily 
        # for background thread orchestration.
        logger.info("Running background task synchronization...")
        
        pipeline.db_service.migrate_db()
        
        # Start periodic ingestion in a background thread
        # This ensures it doesn't block the main API service
        # Thay đổi args=(24,) cho mỗi ngày, hoặc args=(48,) cho mỗi 2 ngày
        sync_thread = threading.Thread(target=run_periodic_ingestion, args=(24,), daemon=True)
        sync_thread.start()
        
    except Exception as e:
        logger.error(f"Error during startup_event tasks: {e}")
        # We don't necessarily exit here as the core DB connection was verified above.

# Initialize global rate limiter for sensitive endpoints
metrics_limiter = RateLimiter()

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    print("VALIDATION ERROR:", exc.errors())

    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
    )

class ChatRequest(BaseModel):
    user_id: Optional[str] = Field("anonymous", alias="userId")
    session_id: Optional[str] = Field(None, alias="sessionId")
    message: str = Field(..., alias="text")
    history: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    persona_summary: Optional[str] = Field(None, alias="personaSummary")
    context: Optional[Dict[str, Any]] = None

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

class HandoffActionRequest(BaseModel):
    status: str # 'accepted' or 'busy'

class HandoffReplyRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000)

class StudentHandoffRequest(BaseModel):
    session_id: Optional[str] = None
    message: Optional[str] = None

class RagConfigRequest(BaseModel):
    interval_hours: int

class IngestRequest(BaseModel):
    source_type: str = Field("internal", pattern="^(internal|external)$")
    params: Dict[str, Any] = Field(default_factory=dict)

class PromptCreateRequest(BaseModel):
    agent_name: str
    version: str
    content: str

class PromptCompareRequest(BaseModel):
    agent_name: str
    version_a: str
    version_b: str
    test_input: Optional[str] = ""

class PromptSelectRequest(BaseModel):
    agent_name: str
    version: str

class PromptResponse(BaseModel):
    agent_name: str
    version: str
    content: str
    created_at: Optional[datetime] = None

class GoogleLoginRequest(BaseModel):
    token: str

class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    dob: Optional[str] = None
    phone: Optional[str] = None
    gpa: Optional[float] = None
    test_scores: Optional[Dict[str, Any]] = None
    preferred_majors: Optional[List[str]] = None
    summary: Optional[str] = None
    career_goals: Optional[str] = None
    skills: Optional[List[str]] = None
    education: Optional[List[Any]] = None
    experience: Optional[List[Any]] = None

class CVConfirmRequest(BaseModel):
    structured_data: Optional[Dict[str, Any]] = None

class ResourceContextRequest(BaseModel):
    surface: Optional[str] = None
    intent: Optional[str] = None
    major_id: Optional[str] = None

class EmailLogRequest(BaseModel):
    user_id: str

class ConsultationClickRequest(BaseModel):
    user_id: Optional[str] = None
    source: Optional[str] = "report"

class AdminUserCreateRequest(BaseModel):
    email: str
    password: str = Field(..., min_length=8)
    full_name: Optional[str] = None
    role: str = "user"
    permissions: Optional[List[str]] = None

class AdminRoleUpdateRequest(BaseModel):
    role: str

class AdminPermissionUpdateRequest(BaseModel):
    permission: str

class AdminBlacklistRequest(BaseModel):
    blacklisted: bool

class MatchRequest(BaseModel):
    user_id: str
    answers: Dict[str, Any]
    cv_text: Optional[str] = None
    cv_signals: Optional[Dict[str, Any]] = None
    cv_document_id: Optional[str] = None

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

    if is_human_handoff_request(request.message):
        return create_student_handoff_job(user_id, session_id, request.message)

    # Ensure the orchestrator result is wrapped in the structure 
    # expected by ConsultantPage.jsx (response.response)
    chat_response = pipeline.run_chat(
        user_id, 
        request.message, 
        request.history, 
        session_id=session_id,
        persona_summary=request.persona_summary,
        context=request.context,
    )
    logger.info(f"Chat response {chat_response}")

    if isinstance(chat_response, dict):
        return {
            **chat_response,
            "sources": chat_response.get("sources", []),
            "session_id": session_id,
        }

    return {
        "response": chat_response,
        "sources": [],
        "session_id": session_id
    }

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
    is_admin = current_user.get("role") in ["admin", "editor"]
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

@app.delete("/api/chat/messages/{message_id}")
async def delete_chat_message(message_id: int, current_user: dict = Depends(get_current_user)):
    """Delete one chat message from a session history."""
    deleted = pipeline.db_service.delete_message(
        message_id=message_id,
        requester_email=current_user["email"],
        requester_role=current_user.get("role") or "user",
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Message not found or not permitted")
    return {"status": "success", "message_id": message_id}

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

def _coerce_audit_payload(payload: Any) -> Dict[str, Any]:
    """Parse audit payloads persisted as dicts, JSON strings, or Python repr strings."""
    if isinstance(payload, dict):
        return payload
    if not payload or not isinstance(payload, str):
        return {}

    try:
        parsed = json.loads(payload)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        pass

    try:
        parsed = ast.literal_eval(payload)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}

def _extract_top3_from_audit(log: Any) -> List[Dict[str, Any]]:
    payload = _coerce_audit_payload(log.output_data or log.output_text)
    top3 = payload.get("top3") or []
    return top3 if isinstance(top3, list) else []

@app.get("/api/admin/board")
async def get_admin_board(hours: int = 336, limit: int = 25, current_user: dict = Depends(admin_required)):
    """PRD-focused admin board: major demand, wizard completion, and consultation CTA clicks."""
    from models.schemas import AuditLog
    try:
        since_date = datetime.utcnow() - timedelta(hours=hours)
        with database.SessionLocal() as session:
            logs = session.query(AuditLog)\
                .filter(AuditLog.timestamp >= since_date)\
                .order_by(AuditLog.timestamp.desc())\
                .all()

            match_logs = [
                log for log in logs
                if log.route == "advisor" and _extract_top3_from_audit(log)
            ]
            fallback_logs = [
                log for log in logs
                if log.route in ("advisor", "fallback") and bool(log.fallback)
            ]
            consultation_logs = [log for log in logs if log.route == "consultation_cta"]

            major_counts = Counter()
            score_totals = defaultdict(float)
            appearances = Counter()
            major_names = {}

            for log in match_logs:
                for rank, major in enumerate(_extract_top3_from_audit(log), start=1):
                    major_id = major.get("major_id")
                    if not major_id:
                        continue
                    major_counts[major_id] += 4 - rank
                    appearances[major_id] += 1
                    score_totals[major_id] += float(major.get("match_score") or 0)
                    major_names[major_id] = major.get("major_name") or major_id

            top_majors = [{
                "major_id": major_id,
                "major_name": major_names.get(major_id, major_id),
                "weighted_count": int(weighted_count),
                "appearances": int(appearances[major_id]),
                "avg_score": round(score_totals[major_id] / appearances[major_id], 1) if appearances[major_id] else 0,
            } for major_id, weighted_count in major_counts.most_common()]

            recent_leads = [{
                "id": log.id,
                "user_id": log.user_id,
                "timestamp": log.timestamp.isoformat() if log.timestamp else None,
                "source": (_coerce_audit_payload(log.judge_result).get("source") if log.judge_result else None) or "report",
                "trace_id": log.trace_id,
            } for log in consultation_logs[:limit]]

            total_wizard_sessions = len(match_logs) + len(fallback_logs)
            return {
                "period_hours": hours,
                "total_wizard_sessions": total_wizard_sessions,
                "completed_matches": len(match_logs),
                "fallback_sessions": len(fallback_logs),
                "fallback_rate": round(len(fallback_logs) / total_wizard_sessions, 3) if total_wizard_sessions else 0,
                "consultation_clicks": len(consultation_logs),
                "top_majors": top_majors,
                "recent_consultation_leads": recent_leads,
                "generated_at": datetime.utcnow().isoformat()
            }
    except Exception as e:
        logger.error(f"Error fetching admin board: {e}")
        raise HTTPException(status_code=500, detail="KhÃ´ng thá»ƒ táº£i dá»¯ liá»‡u admin board")

@app.get("/api/admin/audit-logs")
async def get_audit_logs(
    user_id: Optional[str] = None,
    only_fallback: bool = False,
    limit: int = 100,
    offset: int = 0,
    hours: int = 336,
    current_user: dict = Depends(staff_required)
):
    """Retrieve the most recent system activity logs for administrative review."""
    from models.schemas import AuditLog
    from sqlalchemy import or_
    try:
        session_factory = getattr(database, "SessionLocal", None)
        if session_factory is None:
            raise RuntimeError("Database session factory is not initialized.")
            
        with session_factory() as session:
            query = session.query(AuditLog).filter(AuditLog.timestamp >= datetime.utcnow() - timedelta(hours=hours))
            if user_id:
                query = query.filter(or_(
                    AuditLog.user_id.ilike(f"%{user_id}%"),
                    AuditLog.trace_id.ilike(f"%{user_id}%")
                ))
            if only_fallback:
                query = query.filter(or_(AuditLog.ai_resolved == False, AuditLog.fallback == True))
            total = query.count()
            logs = query.order_by(AuditLog.timestamp.desc()).offset(offset).limit(limit).all()
            return {"logs": [{
                "id": log.id,
                "user_id": log.user_id,
                "timestamp": log.timestamp.isoformat() if log.timestamp else None,
                "route": log.route,
                "input": log.input_data,
                "output": log.output_data,
                "latency": log.response_time_ms,
                "judge_result": log.judge_result,
                "trace_id": log.trace_id,
                "escalation_level": log.escalation_level,
                "escalation_reason": log.escalation_reason,
                "handoff_status": log.handoff_status,
                "ai_resolved": log.ai_resolved,
                "fallback": log.fallback
            } for log in logs], "total": total, "limit": limit, "offset": offset}
    except Exception as e:
        logger.error(f"Error fetching audit logs: {e}")
        raise HTTPException(status_code=500, detail="Không thể tải nhật ký hệ thống")

@app.get("/api/admin/pending-handoffs")
async def get_pending_handoffs(current_user: dict = Depends(staff_required)):
    """Lấy danh sách các yêu cầu đang chờ người tư vấn chấp nhận."""
    from models.schemas import AuditLog, ChatSession
    try:
        with database.SessionLocal() as session:
            logs = session.query(AuditLog).filter(
                AuditLog.handoff_status.in_(["pending", "accepted"])
            ).order_by(AuditLog.timestamp.desc()).all()
            latest_sessions = {}
            for log in logs:
                if log.user_id and log.user_id not in latest_sessions:
                    chat_session = session.query(ChatSession)\
                        .filter(ChatSession.user_id == log.user_id)\
                        .order_by(ChatSession.created_at.desc())\
                        .first()
                    latest_sessions[log.user_id] = chat_session.id if chat_session else None

            return [{
                "trace_id": log.trace_id,
                "user_id": log.user_id,
                "student_name": pipeline.db_service.display_name_for_user(log.user_id, "Student"),
                "session_id": latest_sessions.get(log.user_id),
                "input": log.input_data,
                "escalation_level": log.escalation_level,
                "escalation_reason": log.escalation_reason,
                "handoff_status": log.handoff_status,
                "timestamp": log.timestamp.isoformat() if log.timestamp else None
            } for log in logs]
    except Exception as e:
        logger.error(f"Error fetching pending handoffs: {e}")
        return []

@app.post("/api/admin/handoff/{trace_id}")
async def handle_handoff(trace_id: str, request: HandoffActionRequest, current_user: dict = Depends(staff_required)):
    """Chấp nhận hoặc từ chối yêu cầu tư vấn dựa trên trace_id."""
    from models.schemas import AuditLog, ChatSession
    try:
        with database.SessionLocal() as session:
            log = session.query(AuditLog).filter(AuditLog.trace_id == trace_id).first()
            if not log:
                raise HTTPException(status_code=404, detail="Không tìm thấy yêu cầu")
            
            log.handoff_status = request.status
            chat_session = session.query(ChatSession)\
                .filter(ChatSession.user_id == log.user_id)\
                .order_by(ChatSession.created_at.desc())\
                .first()
            session.commit()
            return {
                "status": "success",
                "handoff_status": request.status,
                "trace_id": trace_id,
                "user_id": log.user_id,
                "session_id": chat_session.id if chat_session else None,
            }
    except HTTPException: raise
    except Exception as e:
        logger.error(f"Error updating handoff status: {e}")
        raise HTTPException(status_code=500, detail="Lỗi khi cập nhật trạng thái")

@app.post("/api/admin/handoff/{trace_id}/message")
async def send_handoff_reply(trace_id: str, request: HandoffReplyRequest, current_user: dict = Depends(staff_required)):
    """Persist a human staff reply into the student's latest chat session."""
    handoff = _assert_handoff_access(trace_id, current_user)
    staff_name = pipeline.db_service.display_name_for_user(current_user["email"], "VinUni counsellor")
    message = pipeline.db_service.save_handoff_message(
        trace_id=trace_id,
        user_id=handoff["user_id"],
        sender_id=current_user["email"],
        sender_name=staff_name,
        sender_role=current_user.get("role") or "staff",
        role="staff",
        content=request.message.strip(),
    )
    try:
        from models.schemas import AuditLog
        with database.SessionLocal() as session:
            log = session.query(AuditLog).filter(AuditLog.trace_id == trace_id).first()
            if log:
                log.handoff_status = "accepted"
                session.commit()
    except Exception as e:
        logger.warning(f"Could not mark handoff accepted after staff message: {e}")
    return {
        "status": "success",
        "trace_id": trace_id,
        "user_id": handoff["user_id"],
        "message": message,
    }

    from models.schemas import AuditLog, ChatSession
    try:
        with database.SessionLocal() as session:
            log = session.query(AuditLog).filter(AuditLog.trace_id == trace_id).first()
            if not log:
                raise HTTPException(status_code=404, detail="KhÃ´ng tÃ¬m tháº¥y yÃªu cáº§u")
            chat_session = session.query(ChatSession)\
                .filter(ChatSession.user_id == log.user_id)\
                .order_by(ChatSession.created_at.desc())\
                .first()
            if not chat_session:
                raise HTTPException(status_code=404, detail="KhÃ´ng tÃ¬m tháº¥y phiÃªn chat cá»§a há»c sinh")
            target_user_id = log.user_id
            target_session_id = chat_session.id
            log.handoff_status = "accepted"
            session.commit()

        content = f"ChuyÃªn viÃªn tÆ° váº¥n ({current_user['email']}): {request.message.strip()}"
        pipeline.db_service.save_message(
            user_id=target_user_id,
            role="assistant",
            content=content,
            agent_type="human_staff",
            session_id=target_session_id,
            sources=[],
        )
        pipeline.db_service.save_audit_log(
            user_id=current_user["email"],
            input_data=f"HUMAN_HANDOFF_REPLY: {trace_id}",
            output_data=content,
            judge_result={"action": "human_handoff_reply", "target_user": target_user_id, "trace_id": trace_id},
            route="human_staff",
            ai_resolved=False,
            fallback=False,
            handoff_status="accepted",
        )
        return {
            "status": "success",
            "trace_id": trace_id,
            "user_id": target_user_id,
            "session_id": target_session_id,
            "message": {
                "role": "assistant",
                "content": content,
                "agent_type": "human_staff",
                "timestamp": datetime.utcnow().isoformat(),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending handoff reply: {e}")
        raise HTTPException(status_code=500, detail="KhÃ´ng thá»ƒ gá»­i pháº£n há»“i tÆ° váº¥n")

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

@app.post("/api/audit/consultation-click")
async def log_consultation_click(request: ConsultationClickRequest, current_user: dict = Depends(get_current_user)):
    """Log the PRD consultation CTA so Admin Board can show interested students."""
    try:
        pipeline.db_service.save_audit_log(
            user_id=current_user["email"],
            input_data=f"USER_ACTION: Consultation CTA clicked from {request.source or 'report'}",
            output_data="Action: consultation request intent captured",
            judge_result={"action": "consultation_click", "source": request.source or "report"},
            route="consultation_cta",
            ai_resolved=True,
            fallback=False
        )
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Failed to log consultation click: {e}")
        raise HTTPException(status_code=500, detail="Lá»—i khi ghi nháº­t kÃ½ yÃªu cáº§u tÆ° váº¥n")

@app.post("/api/auth/signup")
async def signup(request: SignupRequest):
    """Handle student registration."""
    # 1. Kiểm tra người dùng tồn tại
    existing_user = pipeline.db_service.get_student_profile(request.email)
    if existing_user:
        raise HTTPException(status_code=400, detail="Email này đã được đăng ký.")

    try:
        user_data = {
            "full_name": request.full_name,
            "email": request.email,
            "password": request.password,
            "role": "user"
        }
        # Use email as the internal user_id for consistency across login/signup
        pipeline.db_service.upsert_student_profile(request.email, user_data)
        
        return {"status": "success", "message": "Đăng ký thành công!"}
    except Exception as e:
        logger.error(f"Signup error: {e}")
        raise HTTPException(status_code=500, detail="Lỗi khi tạo tài khoản.")

@app.post("/api/auth/admin-signup")
async def admin_signup(request: SignupRequest):
    """Create an admin account when the shared ADMIN_SIGNUP_KEY is provided."""
    admin_signup_key = os.getenv("ADMIN_SIGNUP_KEY")
    if not admin_signup_key:
        logger.error("ADMIN_SIGNUP_KEY is not configured")
        raise HTTPException(status_code=500, detail="Admin signup is not configured.")

    if not request.admin_key or not secrets.compare_digest(request.admin_key, admin_signup_key):
        raise HTTPException(status_code=403, detail="Invalid admin signup key.")

    existing_user = pipeline.db_service.get_student_profile(request.email)
    if existing_user:
        raise HTTPException(status_code=400, detail="Email nay da duoc dang ky.")

    try:
        pipeline.db_service.upsert_student_profile(request.email, {
            "full_name": request.full_name,
            "email": request.email,
            "password": request.password,
            "role": "admin",
        })
        return {"status": "success", "message": "Admin account created successfully."}
    except Exception as e:
        logger.error(f"Admin signup error: {e}")
        raise HTTPException(status_code=500, detail="Could not create admin account.")

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
        if not GOOGLE_CLIENT_ID or GOOGLE_CLIENT_ID.startswith("YOUR_GOOGLE_CLIENT_ID"):
            logger.error("GOOGLE_CLIENT_ID is not configured")
            raise HTTPException(status_code=500, detail="Google login is not configured.")

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
        if not id_info.get("email_verified"):
            raise HTTPException(status_code=400, detail="Email Google chưa được xác minh")

        # Fetch existing user to include persisted permissions
        user = pipeline.db_service.get_student_profile(email)
        if not user:
            # Persist first-time Google users so later profile/CV/match writes
            # point at a real owner row instead of a transient auth session.
            pipeline.db_service.upsert_student_profile(
                email,
                {
                    "email": email,
                    "full_name": full_name,
                    "role": "user",
                },
            )
            user = pipeline.db_service.get_student_profile(email)
        if user and user.get("blacklisted"):
            raise HTTPException(status_code=403, detail="TÃ i khoáº£n nÃ y Ä‘Ã£ bá»‹ khá»‘a trong há»‡ thá»‘ng.")
        db_permissions = user.get("permissions") or [] if user else []

        # Logic phân quyền tương tự login thường
        role = user.get("role") if user else "user"
        
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

    cv_text = request.cv_text
    cv_signals = request.cv_signals
    if request.cv_document_id and not (cv_text and cv_signals):
        cv_doc = pipeline.db_service.get_cv_document(authenticated_user_id, request.cv_document_id)
        if cv_doc:
            cv_text = cv_text or cv_doc.get("raw_text")
            cv_signals = cv_signals or cv_doc.get("cv_signals")

    # 1. Generate the major matching results via Advisor Agent
    results = pipeline.run_match(authenticated_user_id, request.answers, cv_text, cv_signals)
    
    # 2. Persist to SQL DB for CRM Agent and Profile Page
    try:
        # Persist wizard answers and the latest matched majors for advisor/admin views.
        profile_update = request.answers.copy()
        if results.get("top3"):
            profile_update["preferred_majors"] = [
                item.get("major_id") for item in results["top3"] if item.get("major_id")
            ]
        pipeline.db_service.upsert_student_profile(authenticated_user_id, profile_update)
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

@app.get("/api/profile/me/readiness")
async def get_my_profile_readiness(current_user: dict = Depends(get_current_user)):
    """Return Profile/Wizard/CV completeness so the UI can show next actions."""
    user_id = current_user["email"]
    profile = pipeline.db_service.get_student_profile(user_id) or {}
    cv_documents = pipeline.db_service.list_cv_documents(user_id)
    return {
        "status": "success",
        "user_id": user_id,
        "readiness": _profile_readiness(profile, cv_documents),
    }

@app.get("/api/profile/me/overview")
async def get_my_profile_overview(current_user: dict = Depends(get_current_user)):
    """Return the Profile page's initial data in one round-trip."""
    user_id = current_user["email"]
    profile = pipeline.db_service.get_student_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    cv_documents = pipeline.db_service.list_cv_documents(user_id)
    return {
        "status": "success",
        "user_id": user_id,
        "profile": profile,
        "documents": cv_documents,
        "readiness": _profile_readiness(profile, cv_documents),
    }

@app.get("/api/profile/me/cv-documents/{document_id}/merge-preview")
async def preview_my_cv_document_merge(document_id: str, current_user: dict = Depends(get_current_user)):
    """Preview how a CV document would merge into Profile before confirmation."""
    user_id = current_user["email"]
    doc = pipeline.db_service.get_cv_document(user_id, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="CV document not found")
    profile = pipeline.db_service.get_student_profile(user_id) or {}
    preview = _build_cv_merge_preview(profile, doc.get("structured_data") or {}, doc.get("cv_signals") or {})
    return {
        "status": "success",
        "document_id": document_id,
        "filename": doc.get("filename"),
        "preview": preview,
        "confirm_endpoint": f"/api/profile/me/cv-documents/{document_id}/confirm",
    }

@app.get("/api/resources/contextual")
async def get_contextual_resources(
    surface: Optional[str] = None,
    intent: Optional[str] = None,
    major_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Return intent-aware help snippets for Profile, Wizard, Report, Chat, and Resources."""
    profile = pipeline.db_service.get_student_profile(current_user["email"]) or {}
    cv_documents = pipeline.db_service.list_cv_documents(current_user["email"])
    return {
        "status": "success",
        "surface": surface,
        "intent": intent,
        "major_id": major_id,
        "resources": _contextual_resources(surface, intent, major_id),
        "readiness": _profile_readiness(profile, cv_documents),
    }

@app.get("/api/handoff-status")
async def get_my_handoff_status(current_user: dict = Depends(get_current_user)):
    """Return the latest human fallback state for the current user."""
    user_id = current_user["email"]
    try:
        from models.schemas import AuditLog, HandoffMessage
        if database.SessionLocal is None:
            return {"status": "success", "handoff": None}
        profile = pipeline.db_service.get_student_profile(user_id) or {}
        resolved_user_id = profile.get("user_id") or user_id
        with database.SessionLocal() as session:
            handoff = session.query(AuditLog)\
                .filter(AuditLog.user_id.in_([user_id, resolved_user_id]))\
                .filter(AuditLog.handoff_status.in_(["pending", "accepted", "busy"]))\
                .order_by(AuditLog.timestamp.desc())\
                .first()
            if not handoff:
                return {"status": "success", "handoff": None}
            latest_staff_message = session.query(HandoffMessage)\
                .filter(HandoffMessage.trace_id == handoff.trace_id, HandoffMessage.role == "staff")\
                .order_by(HandoffMessage.timestamp.desc())\
                .first()
            return {
                "status": "success",
                "handoff": {
                    "trace_id": handoff.trace_id,
                    "handoff_status": handoff.handoff_status,
                    "escalation_level": handoff.escalation_level,
                    "reason": handoff.escalation_reason,
                    "queued_at": handoff.timestamp.isoformat() if handoff.timestamp else None,
                    "latest_staff_message": {
                        "content": latest_staff_message.content,
                        "timestamp": latest_staff_message.timestamp.isoformat() if latest_staff_message.timestamp else None,
                    } if latest_staff_message else None,
                    "next_actions": [
                        {"id": "wait", "label": "Wait for advisor reply"},
                        {"id": "continue_chat", "label": "Continue Chat"},
                        {"id": "open_resources", "label": "Open Resources"},
                    ],
                },
            }
    except Exception as e:
        logger.error(f"Handoff status query failed: {e}")
        raise HTTPException(status_code=500, detail="Could not load handoff status")

@app.post("/api/handoff-request")
async def request_human_handoff(request: StudentHandoffRequest, current_user: dict = Depends(get_current_user)):
    """Student-facing endpoint to create a pending handoff job for admin/editor staff."""
    session_id = request.session_id
    if not session_id or session_id == "new":
        session_id = str(uuid.uuid4())
    return create_student_handoff_job(
        current_user["email"],
        session_id,
        request.message or "Student clicked request human counselor.",
    )

@app.get("/api/handoff/{trace_id}/messages")
async def get_handoff_messages(trace_id: str, current_user: dict = Depends(get_current_user)):
    """Return the human-only transcript for a student handoff."""
    handoff = _assert_handoff_access(trace_id, current_user)
    return {
        "status": "success",
        "handoff": handoff,
        "messages": pipeline.db_service.get_handoff_messages(trace_id),
    }

@app.post("/api/handoff/{trace_id}/messages")
async def post_handoff_message(
    trace_id: str,
    request: HandoffReplyRequest,
    current_user: dict = Depends(get_current_user),
):
    """Append one human-only handoff message without invoking the AI pipeline."""
    handoff = _assert_handoff_access(trace_id, current_user)
    is_staff = current_user.get("role") in {"admin", "editor"}
    role = "staff" if is_staff else "student"
    sender_name = pipeline.db_service.display_name_for_user(
        current_user["email"],
        "VinUni counsellor" if is_staff else "Student",
    )
    message = pipeline.db_service.save_handoff_message(
        trace_id=trace_id,
        user_id=handoff["user_id"],
        sender_id=current_user["email"],
        sender_name=sender_name,
        sender_role=current_user.get("role") or role,
        role=role,
        content=request.message.strip(),
    )
    if is_staff:
        try:
            from models.schemas import AuditLog
            with database.SessionLocal() as session:
                log = session.query(AuditLog).filter(AuditLog.trace_id == trace_id).first()
                if log:
                    log.handoff_status = "accepted"
                    session.commit()
        except Exception as e:
            logger.warning(f"Could not mark handoff accepted after staff message: {e}")
    return {"status": "success", "message": message}

@app.get("/api/system/db-status")
async def get_db_status(admin: dict = Depends(admin_required)):
    """Admin-only endpoint to check database statistics."""
    db_info = database.get_database_info()
    user_counts = {"total": 0, "admin": 0, "editor": 0, "user": 0, "blacklisted": 0}
    try:
        from models.schemas import User
        from sqlalchemy import func
        with database.SessionLocal() as session:
            user_counts["total"] = session.query(User).count()
            for role, count in session.query(User.role, func.count(User.user_id)).group_by(User.role).all():
                user_counts[role or "user"] = int(count or 0)
            user_counts["blacklisted"] = session.query(User).filter(User.blacklisted == True).count()
    except Exception as e:
        logger.warning(f"Could not fetch DB user counts: {e}")
    return {
        "status": "connected" if db_info["connected"] else "disconnected",
        "database": db_info["name"],
        "type": db_info["type"],
        "tables": ["users", "students", "chat_messages", "majors"],
        "user_counts": user_counts,
        "accessed_by": admin["email"]
    }

@app.get("/api/system/token-usage")
async def get_token_usage(
    hours: int = 168,
    user_id: Optional[str] = None,
    route: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Return token usage estimates and request frequency from audit logs."""
    requester_role = current_user.get("role")
    if requester_role not in {"admin", "editor"}:
        user_id = current_user["email"]

    since = datetime.utcnow() - timedelta(hours=max(1, min(hours, 24 * 90)))
    try:
        from models.schemas import AuditLog
        with database.SessionLocal() as session:
            query = session.query(AuditLog).filter(AuditLog.timestamp >= since)
            if user_id:
                query = query.filter(AuditLog.user_id == user_id)
            if route:
                query = query.filter(AuditLog.route == route)
            logs = query.order_by(AuditLog.timestamp.desc()).limit(1000).all()

        totals = {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "estimated_cost": 0.0,
            "request_count": len(logs),
        }
        daily = defaultdict(lambda: {"date": "", "requests": 0, "tokens": 0})
        routes = defaultdict(lambda: {"route": "", "requests": 0, "tokens": 0})
        users = defaultdict(lambda: {"user_id": "", "requests": 0, "tokens": 0})
        rows = []

        for log in logs:
            prompt_tokens = getattr(log, "input_tokens", None)
            completion_tokens = getattr(log, "output_tokens", None)
            cost = getattr(log, "cost", None)
            if prompt_tokens is None:
                prompt_tokens = _estimate_text_tokens(log.input_text or log.input_data)
            if completion_tokens is None:
                completion_tokens = _estimate_text_tokens(log.output_text or log.output_data)
            total_tokens = int(prompt_tokens or 0) + int(completion_tokens or 0)
            estimated_cost = float(cost or 0)
            day_key = log.timestamp.date().isoformat() if log.timestamp else "unknown"
            route_key = log.route or "unknown"
            user_key = log.user_id or "anonymous"

            totals["prompt_tokens"] += int(prompt_tokens or 0)
            totals["completion_tokens"] += int(completion_tokens or 0)
            totals["total_tokens"] += total_tokens
            totals["estimated_cost"] += estimated_cost

            daily[day_key]["date"] = day_key
            daily[day_key]["requests"] += 1
            daily[day_key]["tokens"] += total_tokens
            routes[route_key]["route"] = route_key
            routes[route_key]["requests"] += 1
            routes[route_key]["tokens"] += total_tokens
            users[user_key]["user_id"] = user_key
            users[user_key]["requests"] += 1
            users[user_key]["tokens"] += total_tokens

            if len(rows) < 100:
                rows.append({
                    "id": log.id,
                    "user_id": user_key,
                    "route": route_key,
                    "prompt_tokens": int(prompt_tokens or 0),
                    "completion_tokens": int(completion_tokens or 0),
                    "total_tokens": total_tokens,
                    "cost": round(estimated_cost, 6),
                    "timestamp": log.timestamp.isoformat() if log.timestamp else None,
                })

        totals["estimated_cost"] = round(totals["estimated_cost"], 6)
        return {
            "status": "success",
            "filters": {"hours": hours, "user_id": user_id, "route": route},
            "totals": totals,
            "daily": sorted(daily.values(), key=lambda item: item["date"]),
            "routes": sorted(routes.values(), key=lambda item: item["tokens"], reverse=True),
            "users": sorted(users.values(), key=lambda item: item["tokens"], reverse=True)[:25],
            "rows": rows,
            "is_estimated": True,
        }
    except Exception as e:
        logger.error(f"Token usage query failed: {e}")
        raise HTTPException(status_code=500, detail="Could not load token usage")

@app.get("/api/admin/system/health")
async def get_admin_system_health(admin: dict = Depends(staff_required)):
    """Return productized health badges for admin/staff operations pages."""
    try:
        from models.schemas import AuditLog
        db_info = database.get_database_info()
        since_24h = datetime.utcnow() - timedelta(hours=24)
        stats = {
            "tokens_24h": 0,
            "requests_24h": 0,
            "pending_handoffs": 0,
            "accepted_handoffs": 0,
            "prompt_versions": 0,
        }
        if database.SessionLocal is not None:
            with database.SessionLocal() as session:
                logs = session.query(AuditLog).filter(AuditLog.timestamp >= since_24h).all()
                stats["requests_24h"] = len(logs)
                stats["tokens_24h"] = sum(
                    _estimate_text_tokens(log.input_text or log.input_data) +
                    _estimate_text_tokens(log.output_text or log.output_data)
                    for log in logs
                )
                stats["pending_handoffs"] = session.query(AuditLog).filter(AuditLog.handoff_status == "pending").count()
                stats["accepted_handoffs"] = session.query(AuditLog).filter(AuditLog.handoff_status == "accepted").count()
        stats["prompt_versions"] = len(pipeline.db_service.get_all_prompts())
        rag_status = {
            "sync_interval_hours": rag_config["sync_interval_hours"],
            "scheduled_ingest_label": f"Periodic RAG ingest every {rag_config['sync_interval_hours']} hours",
            "immediate_ingest_label": "Run immediate RAG ingestion now",
        }
        badges = [
            {"id": "database", "label": "Database", "status": "ok" if db_info.get("connected") else "error", "detail": db_info.get("type")},
            {"id": "tokens", "label": "Tokens 24h", "status": "ok", "detail": stats["tokens_24h"]},
            {"id": "prompt_versions", "label": "Prompt versions", "status": "ok" if stats["prompt_versions"] else "warning", "detail": stats["prompt_versions"]},
            {"id": "handoffs", "label": "Pending handoffs", "status": "warning" if stats["pending_handoffs"] else "ok", "detail": stats["pending_handoffs"]},
            {"id": "rag_ingest", "label": "RAG ingest", "status": "ok", "detail": rag_status["scheduled_ingest_label"]},
        ]
        return {
            "status": "success",
            "badges": badges,
            "stats": stats,
            "rag": rag_status,
            "accessed_by": admin["email"],
        }
    except Exception as e:
        logger.error(f"Admin system health failed: {e}")
        raise HTTPException(status_code=500, detail="Could not load admin system health")

def _validate_admin_role(role: str) -> str:
    if role not in {"admin", "editor", "user"}:
        raise HTTPException(status_code=400, detail="Role khÃ´ng há»£p lá»‡. Chá»‰ há»— trá»£ admin, editor, user.")
    return role

def _normalize_permission(permission: str) -> str:
    permission = (permission or "").strip()
    if not permission:
        raise HTTPException(status_code=400, detail="Permission khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng.")
    return permission

def _estimate_text_tokens(value: Optional[str]) -> int:
    """Approximate tokens for audit rows when provider token counters are absent."""
    if not value:
        return 0
    return max(1, int(len(str(value)) / 4))

def _apply_prompt_selection(agent_name: str, content: str) -> List[str]:
    """Apply selected prompt content to known in-memory agents for this process."""
    applied = []
    normalized = (agent_name or "").strip().lower()
    targets = {
        "advisor": [("advisor", "system_prompt")],
        "advisor_match": [("advisor", "match_prompt")],
        "match": [("advisor", "match_prompt")],
        "crm": [("crm", "system_prompt")],
        "rag": [("rag", "system_prompt")],
        "router": [("router", "system_prompt")],
        "judge": [("judge", "system_prompt")],
        "judge_safety": [("judge", "system_prompt")],
        "judge_gold": [("judge_gold", "system_prompt")],
    }

    for component_name, attr_name in targets.get(normalized, []):
        component = getattr(pipeline, component_name, None)
        if component is not None and hasattr(component, attr_name):
            setattr(component, attr_name, content)
            applied.append(f"{component_name}.{attr_name}")
    return applied

def _seed_major_rows() -> Dict[str, Any]:
    from models.schemas import Major
    from utils.seed_majors import MAJORS_DATA

    if database.SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database is not available")

    added = 0
    updated = 0
    updated = 0
    with database.SessionLocal() as session:
        for entry in MAJORS_DATA:
            major = session.query(Major).filter(Major.id == entry["id"]).first()
            if major:
                major.name = entry["name"]
                major.description = entry["description"]
                updated += 1
            else:
                session.add(Major(**entry))
                added += 1
        session.commit()
        total = session.query(Major).count()
    return {"table": "majors", "added": added, "updated": updated, "total": total}

def _seed_admissions_rows() -> Dict[str, Any]:
    from models.schemas import AdmissionsData, Major

    if database.SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database is not available")

    _seed_major_rows()
    sample_data = [
        {
            "major_id": "cs",
            "requirements": "GPA >= 3.5, IELTS >= 6.5, Math score >= 8.0",
            "description": "Computer Science requires strong math foundations and programming readiness.",
            "official_url": "https://admissions.vinuni.edu.vn/vi/dai-hoc/cau-hoi-thuong-gap/tuyen-sinh/",
        },
        {
            "major_id": "ee",
            "requirements": "GPA >= 3.2, IELTS >= 6.0, Physics/Math score >= 7.5",
            "description": "Electrical and Computer Engineering fits students interested in circuits, embedded systems, and computing.",
            "official_url": "https://admissions.vinuni.edu.vn/vi/dai-hoc/cau-hoi-thuong-gap/tuyen-sinh/",
        },
        {
            "major_id": "me",
            "requirements": "GPA >= 3.2, IELTS >= 6.0, Math/Physics score >= 7.5",
            "description": "Mechanical Engineering fits students interested in design, robotics, and manufacturing.",
            "official_url": "https://admissions.vinuni.edu.vn/vi/dai-hoc/cau-hoi-thuong-gap/tuyen-sinh/",
        },
        {
            "major_id": "bme",
            "requirements": "GPA >= 3.5, IELTS >= 6.5, Biology/Math score >= 8.0",
            "description": "Biomedical Engineering combines medicine, life sciences, and engineering.",
            "official_url": "https://admissions.vinuni.edu.vn/vi/dai-hoc/cau-hoi-thuong-gap/tuyen-sinh/",
        },
        {
            "major_id": "ba",
            "requirements": "GPA >= 3.0, IELTS >= 6.5, Essay score >= 8.0",
            "description": "Business Administration develops leadership, strategy, and management capability.",
            "official_url": "https://admissions.vinuni.edu.vn/vi/dai-hoc/cau-hoi-thuong-gap/tuyen-sinh/",
        },
        {
            "major_id": "finance",
            "requirements": "GPA >= 3.2, IELTS >= 6.5, Math score >= 7.5",
            "description": "Finance focuses on markets, analysis, investment, and financial decision making.",
            "official_url": "https://admissions.vinuni.edu.vn/vi/dai-hoc/cau-hoi-thuong-gap/tuyen-sinh/",
        },
        {
            "major_id": "data_science",
            "requirements": "GPA >= 3.5, IELTS >= 6.5, Math/Statistics score >= 8.0",
            "description": "Data Science uses statistics, AI, and computation to solve data-rich problems.",
            "official_url": "https://admissions.vinuni.edu.vn/vi/dai-hoc/cau-hoi-thuong-gap/tuyen-sinh/",
        },
        {
            "major_id": "liberal_arts",
            "requirements": "GPA >= 3.0, IELTS >= 7.0, Essay score >= 8.5",
            "description": "Liberal Arts develops critical thinking, research, communication, and social analysis.",
            "official_url": "https://admissions.vinuni.edu.vn/vi/dai-hoc/cau-hoi-thuong-gap/tuyen-sinh/",
        },
        {
            "major_id": "architecture",
            "requirements": "GPA >= 3.2, IELTS >= 6.5, Portfolio required",
            "description": "Architecture requires design creativity, spatial thinking, and portfolio preparation.",
            "official_url": "https://admissions.vinuni.edu.vn/vi/dai-hoc/cau-hoi-thuong-gap/tuyen-sinh/",
        },
    ]

    added = 0
    skipped = 0
    with database.SessionLocal() as session:
        valid_major_ids = {row[0] for row in session.query(Major.id).all()}
        for entry in sample_data:
            if entry["major_id"] not in valid_major_ids:
                skipped += 1
                continue
            exists = session.query(AdmissionsData).filter(
                AdmissionsData.major_id == entry["major_id"],
                AdmissionsData.requirements == entry["requirements"],
            ).first()
            if exists:
                if not exists.official_url:
                    exists.official_url = entry["official_url"]
                    updated += 1
                skipped += 1
                continue
            session.add(AdmissionsData(**entry))
            added += 1
        session.commit()
        total = session.query(AdmissionsData).count()
    return {"table": "admissions_data", "added": added, "updated": updated, "skipped": skipped, "total": total}

def _seed_prompt_rows(version: str = "v2") -> Dict[str, Any]:
    from services.seed_prompts import seed_prompts

    before = len(pipeline.db_service.get_all_prompts())
    seed_prompts(version)
    after = len(pipeline.db_service.get_all_prompts())
    return {"table": "prompts", "version": version, "before": before, "after": after, "added_or_updated": after - before}

@app.post("/api/admin/seed/{target}", response_model=Dict[str, Any])
async def seed_admin_table(target: str, version: str = "v2", admin: dict = Depends(admin_required)):
    """Admin-only utility to populate setup tables from the UI."""
    normalized = (target or "").strip().lower()
    try:
        if normalized == "majors":
            result = _seed_major_rows()
        elif normalized == "admissions_data":
            result = _seed_admissions_rows()
        elif normalized == "prompts":
            result = _seed_prompt_rows(version)
        elif normalized == "all":
            result = {
                "majors": _seed_major_rows(),
                "admissions_data": _seed_admissions_rows(),
                "prompts": _seed_prompt_rows(version),
                "security_events": "Security events are generated automatically by guardrails/rate limits, not seeded.",
            }
        else:
            raise HTTPException(status_code=400, detail="Supported targets: majors, admissions_data, prompts, all")

        pipeline.db_service.save_audit_log(
            user_id=admin["email"],
            input_data=f"ADMIN_SEED_ACTION: {normalized}",
            output_data=json.dumps(result, default=str),
            judge_result={"action": "seed_table", "target": normalized},
            route="admin_internal",
            ai_resolved=True,
            fallback=False,
        )
        return {"status": "success", "result": result}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Admin seed failed for {normalized}: {e}")
        raise HTTPException(status_code=500, detail=f"Could not seed {normalized}")

@app.get("/api/majors/{major_id}", response_model=Dict[str, Any])
async def get_major_detail(major_id: str, current_user: dict = Depends(get_current_user)):
    """Return detailed, source-backed information for a VinUni major."""
    detail = pipeline.db_service.get_major_detail(major_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Major not found")
    return detail

def _profile_readiness(profile: Dict[str, Any], cv_documents: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    cv_documents = cv_documents or []
    required_fields = ["summary", "career_goals", "skills", "education", "experience"]
    completed = [field for field in required_fields if profile.get(field)]
    wizard_keys = ["interests", "strengths", "dislikes", "work_style"]
    wizard_completed = all(profile.get(key) for key in wizard_keys)
    active_cv = next((doc for doc in cv_documents if doc.get("is_active")), None)
    next_actions = []
    if not wizard_completed:
        next_actions.append({"id": "open_wizard", "label": "Complete or update Wizard answers"})
    if not active_cv:
        next_actions.append({"id": "upload_or_confirm_cv", "label": "Upload or confirm a CV document"})
    missing = [field for field in required_fields if field not in completed]
    if missing:
        next_actions.append({"id": "edit_profile", "label": "Complete Profile fields", "missing_fields": missing})
    return {
        "required_fields": required_fields,
        "completed_fields": completed,
        "missing_fields": missing,
        "wizard_completed": wizard_completed,
        "active_cv_document_id": active_cv.get("id") if active_cv else profile.get("active_cv_document_id"),
        "cv_document_count": len(cv_documents),
        "completion_ratio": round((len(completed) + int(wizard_completed) + int(bool(active_cv))) / (len(required_fields) + 2), 3),
        "next_actions": next_actions,
    }

def _build_cv_merge_preview(profile: Dict[str, Any], structured_data: Dict[str, Any], cv_signals: Dict[str, Any]) -> Dict[str, Any]:
    personal = structured_data.get("personal_info") or {}
    proposed = {}
    for source_key, target_key in [("name", "full_name"), ("full_name", "full_name"), ("phone", "phone")]:
        if personal.get(source_key):
            proposed[target_key] = personal.get(source_key)
    for key in ["summary", "career_goals", "skills", "languages", "certifications", "achievements", "education", "experience", "projects"]:
        if structured_data.get(key):
            proposed[key] = structured_data.get(key)
    if cv_signals.get("gpa_estimate") is not None:
        proposed["gpa"] = cv_signals.get("gpa_estimate")

    changes = []
    for field, new_value in proposed.items():
        old_value = profile.get(field)
        if old_value in (None, "", [], {}):
            action = "add"
        elif old_value == new_value:
            action = "keep"
        else:
            action = "update"
        changes.append({"field": field, "action": action, "current": old_value, "proposed": new_value})
    skipped = [
        {"field": field, "action": "skip", "reason": "No value extracted from CV"}
        for field in ["summary", "career_goals", "skills", "education", "experience"]
        if field not in proposed
    ]
    return {
        "changes": changes,
        "skipped": skipped,
        "summary": {
            "add": len([item for item in changes if item["action"] == "add"]),
            "update": len([item for item in changes if item["action"] == "update"]),
            "keep": len([item for item in changes if item["action"] == "keep"]),
            "skip": len(skipped),
        },
    }

def _contextual_resources(surface: Optional[str], intent: Optional[str], major_id: Optional[str]) -> List[Dict[str, Any]]:
    surface_key = (surface or "").lower()
    intent_key = (intent or "").lower()
    resources = [
        {
            "id": "wizard-guide",
            "title": "Use the Wizard to improve major recommendations",
            "surface": "wizard",
            "snippet": "Answer interests, strengths, dislikes, and work style so the advisor can explain fit with clearer signals.",
            "action": {"id": "open_wizard", "label": "Open Wizard"},
        },
        {
            "id": "cv-review",
            "title": "Review CV extraction before saving",
            "surface": "profile",
            "snippet": "Uploaded CV data stays draft until you confirm the merge into Profile.",
            "action": {"id": "open_profile", "label": "Review Profile"},
        },
        {
            "id": "report-followup",
            "title": "Ask follow-up questions from a report",
            "surface": "report",
            "snippet": "Use report context when asking chat why a major matched or what tradeoffs to check.",
            "action": {"id": "open_chat", "label": "Ask in Chat"},
        },
        {
            "id": "human-fallback",
            "title": "Human advisor fallback",
            "surface": "chat",
            "snippet": "If confidence is low or a claim needs official review, request a human advisor and track the handoff status.",
            "action": {"id": "request_handoff", "label": "Request Advisor"},
        },
    ]
    if major_id:
        resources.insert(0, {
            "id": f"major-{major_id}",
            "title": f"Check official context for {major_id}",
            "surface": "report",
            "snippet": "Use official VinUni sources for admissions facts and treat match score as an AI estimate.",
            "action": {"id": "open_resources", "label": "Open Resources"},
        })
    filtered = [
        item for item in resources
        if not surface_key or item["surface"] == surface_key or surface_key in {"resources", "all"}
    ]
    if intent_key in {"fallback", "handoff", "human"}:
        filtered = [item for item in resources if item["id"] == "human-fallback"] + filtered
    return filtered[:4]

@app.get("/api/admin/users")
async def list_admin_users(admin: dict = Depends(admin_required)):
    """List users stored in PostgreSQL for admin database management."""
    users = pipeline.db_service.get_all_users()
    users.sort(key=lambda u: (u.get("role") != "admin", u.get("email") or u.get("user_id") or ""))
    return {"status": "success", "count": len(users), "users": users}

@app.post("/api/admin/users")
async def create_admin_user(request: AdminUserCreateRequest, admin: dict = Depends(admin_required)):
    """Create or update a user account directly from the database admin page."""
    role = _validate_admin_role(request.role)
    try:
        pipeline.db_service.upsert_student_profile(request.email, {
            "email": request.email,
            "full_name": request.full_name or request.email,
            "password": request.password,
            "role": role,
            "permissions": request.permissions or []
        })
        pipeline.db_service.save_audit_log(
            user_id=admin["email"],
            input_data=f"ADMIN_DB_ACTION: created_or_updated_user {request.email}",
            output_data=f"role={role}",
            judge_result={"action": "admin_user_upsert", "target": request.email, "role": role},
            route="admin_internal",
            ai_resolved=True,
            fallback=False
        )
        return {"status": "success", "message": f"ÄÃ£ táº¡o/cáº­p nháº­t {role}: {request.email}"}
    except Exception as e:
        logger.error(f"Admin create user failed: {e}")
        raise HTTPException(status_code=500, detail="KhÃ´ng thá»ƒ táº¡o/cáº­p nháº­t user")

@app.patch("/api/admin/users/{user_id}/role")
async def update_admin_user_role(user_id: str, request: AdminRoleUpdateRequest, admin: dict = Depends(admin_required)):
    role = _validate_admin_role(request.role)
    try:
        pipeline.db_service.upsert_student_profile(user_id, {"role": role})
        return {"status": "success", "user_id": user_id, "role": role}
    except Exception as e:
        logger.error(f"Admin role update failed: {e}")
        raise HTTPException(status_code=500, detail="KhÃ´ng thá»ƒ cáº­p nháº­t role")

@app.post("/api/admin/users/{user_id}/permissions/grant")
async def grant_admin_user_permission(user_id: str, request: AdminPermissionUpdateRequest, admin: dict = Depends(admin_required)):
    permission = _normalize_permission(request.permission)
    profile = pipeline.db_service.get_student_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="KhÃ´ng tÃ¬m tháº¥y user")
    permissions = list(dict.fromkeys((profile.get("permissions") or []) + [permission]))
    pipeline.db_service.upsert_student_profile(user_id, {"permissions": permissions})
    return {"status": "success", "user_id": user_id, "permissions": permissions}

@app.post("/api/admin/users/{user_id}/permissions/revoke")
async def revoke_admin_user_permission(user_id: str, request: AdminPermissionUpdateRequest, admin: dict = Depends(admin_required)):
    permission = _normalize_permission(request.permission)
    profile = pipeline.db_service.get_student_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="KhÃ´ng tÃ¬m tháº¥y user")
    permissions = [p for p in (profile.get("permissions") or []) if p != permission]
    pipeline.db_service.upsert_student_profile(user_id, {"permissions": permissions})
    return {"status": "success", "user_id": user_id, "permissions": permissions}

@app.patch("/api/admin/users/{user_id}/blacklist")
async def update_admin_user_blacklist(user_id: str, request: AdminBlacklistRequest, admin: dict = Depends(admin_required)):
    if user_id == admin["email"] and request.blacklisted:
        raise HTTPException(status_code=400, detail="KhÃ´ng thá»ƒ blacklist chÃ­nh tÃ i khoáº£n admin Ä‘ang Ä‘Äƒng nháº­p.")
    profile = pipeline.db_service.get_student_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="KhÃ´ng tÃ¬m tháº¥y user")
    pipeline.db_service.upsert_student_profile(user_id, {"blacklisted": request.blacklisted})
    return {"status": "success", "user_id": user_id, "blacklisted": request.blacklisted}

@app.get("/api/admin/prompts", response_model=Dict[str, Any])
async def list_admin_prompts(admin: dict = Depends(admin_required)):
    """List all prompt versions available to agents."""
    prompts = pipeline.db_service.get_all_prompts()
    grouped = defaultdict(list)
    for prompt in prompts:
        grouped[prompt["agent_name"]].append(prompt["version"])
    return {
        "status": "success",
        "count": len(prompts),
        "prompts": prompts,
        "agents": [{"agent_name": name, "versions": versions} for name, versions in grouped.items()],
    }

@app.post("/api/admin/prompts", response_model=Dict[str, Any])
async def create_admin_prompt(request: PromptCreateRequest, admin: dict = Depends(admin_required)):
    """Create or update a specific agent prompt version."""
    agent_name = request.agent_name.strip()
    version = request.version.strip()
    content = request.content.strip()
    if not agent_name or not version or not content:
        raise HTTPException(status_code=400, detail="agent_name, version, and content are required")
    if not pipeline.db_service.save_prompt_to_db(agent_name, version, content):
        raise HTTPException(status_code=500, detail="Could not save prompt version")
    pipeline.db_service.save_audit_log(
        user_id=admin["email"],
        input_data=f"ADMIN_PROMPT_ACTION: saved {agent_name}/{version}",
        output_data="prompt saved",
        judge_result={"action": "prompt_save", "agent_name": agent_name, "version": version},
        route="admin_internal",
        ai_resolved=True,
        fallback=False,
    )
    return {"status": "success", "message": "Prompt version saved"}

@app.post("/api/admin/prompts/compare", response_model=Dict[str, Any])
async def compare_admin_prompts(request: PromptCompareRequest, admin: dict = Depends(admin_required)):
    """Compare two prompt versions with the same test input."""
    agent_name = request.agent_name.strip()
    version_a = request.version_a.strip()
    version_b = request.version_b.strip()
    prompt_a = pipeline.db_service.get_prompt_from_db(agent_name, version_a)
    prompt_b = pipeline.db_service.get_prompt_from_db(agent_name, version_b)
    if not prompt_a or not prompt_b:
        raise HTTPException(status_code=404, detail="Prompt version not found")

    test_input = (request.test_input or "").strip()
    rendered_a = f"{prompt_a}\n\nUser input:\n{test_input}" if test_input else prompt_a
    rendered_b = f"{prompt_b}\n\nUser input:\n{test_input}" if test_input else prompt_b
    return {
        "status": "success",
        "agent_name": agent_name,
        "version_a": version_a,
        "version_b": version_b,
        "output_a": rendered_a,
        "output_b": rendered_b,
        "comparison": {
            "same": prompt_a == prompt_b,
            "length_a": len(prompt_a),
            "length_b": len(prompt_b),
            "delta": len(prompt_b) - len(prompt_a),
        },
    }

@app.post("/api/admin/prompts/select", response_model=Dict[str, Any])
async def select_admin_prompt(request: PromptSelectRequest, admin: dict = Depends(admin_required)):
    """Select a prompt version for immediate runtime use and persist it as selected."""
    agent_name = request.agent_name.strip()
    version = request.version.strip()
    content = pipeline.db_service.get_prompt_from_db(agent_name, version)
    if not content:
        raise HTTPException(status_code=404, detail="Prompt version not found")

    pipeline.db_service.save_prompt_to_db(agent_name, "selected", content)
    applied_targets = _apply_prompt_selection(agent_name, content)
    pipeline.db_service.save_audit_log(
        user_id=admin["email"],
        input_data=f"ADMIN_PROMPT_ACTION: selected {agent_name}/{version}",
        output_data=f"applied={applied_targets}",
        judge_result={"action": "prompt_select", "agent_name": agent_name, "version": version},
        route="admin_internal",
        ai_resolved=True,
        fallback=False,
    )
    return {
        "status": "success",
        "message": "Prompt version selected",
        "agent_name": agent_name,
        "version": version,
        "selected_alias": "selected",
        "applied_targets": applied_targets,
    }

@app.delete("/api/admin/prompts/{agent_name}/{version}")
async def delete_admin_prompt(agent_name: str, version: str, admin: dict = Depends(admin_required)):
    """Delete one prompt version after env-gated hard confirmation from the UI."""
    if not ALLOW_PROMPT_DELETION:
        raise HTTPException(status_code=403, detail="Prompt deletion is disabled. Set ALLOW_PROMPT_DELETION=true to enable it.")
    if version == "latest":
        raise HTTPException(status_code=400, detail="The latest prompt alias cannot be deleted directly.")
    deleted = pipeline.db_service.delete_prompt_version(agent_name, version)
    if not deleted:
        raise HTTPException(status_code=404, detail="Prompt version not found")
    pipeline.db_service.save_audit_log(
        user_id=admin["email"],
        input_data=f"ADMIN_PROMPT_ACTION: deleted {agent_name}/{version}",
        output_data="prompt deleted",
        judge_result={"action": "prompt_delete", "agent_name": agent_name, "version": version},
        route="admin_internal",
        ai_resolved=True,
        fallback=False,
    )
    return {"status": "success", "message": "Prompt version deleted"}

@app.post("/api/admin/rag-sync")
async def manual_rag_sync(admin: dict = Depends(admin_required)):
    """Admin-only endpoint to manually trigger RAG data ingestion/sync."""
    try:
        logger.info(f"Manual RAG sync triggered by admin: {admin['email']}")
        # Call the sync method on the RAG service via the pipeline
        sync_report = pipeline.rag.rag_service.sync_all(source_type="internal", params={})
        logger.info(f"Manual RAG sync report: {sync_report}")
        return {"status": "success", "message": "RAG data synchronization completed successfully.", "report": sync_report}
    except Exception as e:
        logger.error(f"Manual RAG sync failed: {e}")
        raise HTTPException(status_code=500, detail=f"RAG sync failed: {str(e)}")

@app.get("/api/admin/rag/ingest/stream")
async def rag_ingest_stream(admin: dict = Depends(admin_required)):
    """Stream real-time ingestion progress using SSE."""
    def event_generator():
        try:
            for update in pipeline.rag.rag_service.sync_all_streaming():
                # SSE format: data: <content>\n\n
                yield f"data: {json.dumps(update)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/api/admin/rag/status")
async def get_rag_status(admin: dict = Depends(admin_required)):
    """Admin-only endpoint to get detailed RAG health and collection stats."""
    from config import USE_MOCK
    try:
        rs = pipeline.rag.rag_service
        
        # 1. Get collection counts
        collections = {
            "admissions": rs.admission_collection.count() if not USE_MOCK else 12,
            "faq": rs.faq_collection.count() if not USE_MOCK else 25,
            "cvs": len(rs.cv_collections) # Count of user-specific collections
        }
        
        # 2. Fetch latency performance from logs
        from models.schemas import AuditLog
        from sqlalchemy import func
        
        avg_total = 0
        with database.SessionLocal() as session:
            avg_total = session.query(func.avg(AuditLog.response_time_ms))\
                .filter(AuditLog.route == 'rag').scalar() or 0

        return {
            "status": "active",
            "db_status": "connected",
            "model_status": "active",
            "sync_interval_hours": rag_config["sync_interval_hours"],
            "collections": collections,
            "performance": {
                "avg_total": round(float(avg_total), 2),
                "avg_chroma": 150, # Estimated/Placeholder
                "avg_openai": round(float(avg_total) - 150, 2) if avg_total > 150 else 0
            },
            "last_sync": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to fetch RAG status: {e}")
        raise HTTPException(status_code=500, detail="Không thể lấy trạng thái hệ thống tri thức")

@app.post("/api/admin/rag/ingest")
async def rag_ingest_alias(request: IngestRequest, admin: dict = Depends(admin_required)):
    """Parameterized RAG ingestion for local corpus or a specific external URL."""
    try:
        report = pipeline.rag.rag_service.sync_all(
            source_type=request.source_type,
            params=request.params or {},
        )
        pipeline.db_service.save_audit_log(
            user_id=admin["email"],
            input_data=f"ADMIN_RAG_ACTION: ingest {request.source_type}",
            output_data=json.dumps(report, default=str),
            judge_result={"action": "rag_ingest", "source_type": request.source_type, "params": request.params},
            route="admin_internal",
            ai_resolved=True,
            fallback=False,
        )
        return {"status": "success", "report": report}
    except Exception as e:
        logger.error(f"RAG ingest failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/admin/rag/config")
async def update_rag_config(request: RagConfigRequest, admin: dict = Depends(admin_required)):
    """Update RAG synchronization settings."""
    try:
        rag_config["sync_interval_hours"] = request.interval_hours
        # In a real app, you would restart the background thread or update a scheduler
        logger.info(f"RAG sync interval updated to {request.interval_hours} hours")
        return {"status": "success", "config": rag_config}
    except Exception as e:
        logger.error(f"Failed to update RAG config: {e}")
        raise HTTPException(status_code=500, detail="Không thể cập nhật cấu hình RAG")

@app.get("/api/test-db/users")
async def get_all_users_test(admin: dict = Depends(admin_required)):
    """Admin-only test endpoint to verify registered users."""
    users = pipeline.db_service.get_all_users()
    return {"status": "success", "count": len(users), "users": users}

@app.get("/api/profile/{user_id}/cv")
async def download_profile_cv(user_id: str, current_user: dict = Depends(get_current_user)):
    """Return the saved CV PDF for profile review."""
    if current_user.get("role") not in ["admin", "editor"] and current_user.get("email") != user_id:
        raise HTTPException(status_code=403, detail="Báº¡n khÃ´ng cÃ³ quyá»n táº£i CV nÃ y")

    saved_path = os.path.join(os.path.dirname(__file__), "uploads", "cv", f"{sanitize_id(user_id)}.pdf")
    if not os.path.exists(saved_path):
        raise HTTPException(status_code=404, detail="CV chÆ°a Ä‘Æ°á»£c táº£i lÃªn")

    profile = pipeline.db_service.get_student_profile(user_id) or {}
    filename = profile.get("cv_filename") or "vinuni_cv.pdf"
    return FileResponse(saved_path, media_type="application/pdf", filename=filename)

@app.get("/api/profile/me/cv-documents")
async def list_my_cv_documents(current_user: dict = Depends(get_current_user)):
    docs = pipeline.db_service.list_cv_documents(current_user["email"])
    return {"status": "success", "documents": docs}

@app.post("/api/profile/me/cv-documents/{document_id}/confirm")
async def confirm_my_cv_document(document_id: str, request: CVConfirmRequest, current_user: dict = Depends(get_current_user)):
    doc = pipeline.db_service.confirm_cv_document(current_user["email"], document_id, request.structured_data)
    if not doc:
        raise HTTPException(status_code=404, detail="CV document not found")
    return {"status": "success", "document": doc}

@app.delete("/api/profile/me/cv-documents/{document_id}")
async def delete_my_cv_document(document_id: str, current_user: dict = Depends(get_current_user)):
    deleted = pipeline.db_service.delete_cv_document(current_user["email"], document_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="CV document not found")
    return {"status": "success", "document_id": document_id}

@app.post("/api/upload-cv")
async def upload_cv(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """Upload and index a PDF CV."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận tệp tin định dạng PDF.")

    try:
        user_id = current_user["email"] # Use the email from the authenticated user
        safe_user_id = sanitize_id(user_id)
        upload_dir = os.path.join(os.path.dirname(__file__), "uploads", "cv")
        os.makedirs(upload_dir, exist_ok=True)
        saved_path = os.path.join(upload_dir, f"{safe_user_id}.pdf")
        # Create a temporary file that is automatically deleted
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        try:
            text = extract_text_from_pdf(tmp_path)
            profile_fields = parse_cv_with_llm(text)

            # Keep raw extracted CV text as the canonical artifact. Any lightweight
            # prompt hints are derived directly from text, not from a user-facing
            # structured JSON review flow.
            cv_signals = {}
            if hasattr(pipeline, 'cv_agent') and pipeline.cv_agent:
                cv_signals = pipeline.cv_agent.analyze(text, profile_fields)

            pipeline.rag.rag_service.ingest_cv(sanitize_id(user_id), text)
            with open(saved_path, "wb") as saved_file:
                saved_file.write(content)
            cv_document = pipeline.db_service.create_cv_document(
                user_id=user_id,
                filename=file.filename,
                file_path=saved_path,
                raw_text=text,
                structured_data=None,
                cv_signals=cv_signals,
            )
            pipeline.db_service.merge_profile_from_cv(
                user_id=user_id,
                structured_data=profile_fields,
                cv_signals=cv_signals,
                document_id=cv_document["id"],
                filename=file.filename,
                store_structured_snapshot=False,
            )
        except Exception as e:
            logger.error(f"Failed to process PDF: {e}")
            raise HTTPException(status_code=400, detail="Tệp tin PDF không hợp lệ hoặc bị lỗi cấu trúc.")
        
        return {
            "status": "CV indexed successfully", 
            "filename": file.filename,
            "cv_url": f"/api/profile/{user_id}/cv",
            "cv_document_id": cv_document["id"],
            "cv_signals": cv_signals,
            "cv_text": text
        }
    finally:
        # Clean up the temp file after indexing
        if 'tmp_path' in locals() and os.path.exists(tmp_path):
            os.remove(tmp_path)

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
