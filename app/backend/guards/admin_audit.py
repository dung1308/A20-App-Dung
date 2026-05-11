import time
import jwt
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from config import SECRET_KEY, ALGORITHM

class AdminAuditMiddleware(BaseHTTPMiddleware):
    """
    Security Middleware to log all API interactions performed by Admin and Staff users.
    Captures the endpoint, method, status code, and latency for the AuditLog.
    """
    def __init__(self, app, pipeline):
        super().__init__(app)
        self.pipeline = pipeline

    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        response = await call_next(request)
        process_time = int((time.time() - start_time) * 1000)

        # Extract authentication token to identify user role
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            try:
                token = auth_header.split(" ")[1]
                payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
                
                if payload.get("role") in ["admin", "editor"]:
                    # Log the internal staff/admin action
                    self.pipeline.db_service.save_audit_log(
                        user_id=payload.get("sub"),
                        input_data=f"ADMIN_ACTION: {request.method} {request.url.path}",
                        output_data=f"Response Status: {response.status_code}",
                        judge_result={"audit": True, "ip": request.client.host if request.client else "unknown"},
                        route="admin_internal",
                        response_time_ms=process_time,
                        ai_resolved=True,
                        fallback=False
                    )
            except Exception:
                pass # Ensure logging failures don't crash the actual request flow
        return response