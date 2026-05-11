"""
services/db_service.py
----------------------
Responsibility: All PostgreSQL interactions via SQLAlchemy ORM.
Single point of DB access — no other file runs raw SQL or uses sessions directly.

Tables managed here:
  - ConversationHistory  (chat messages per user)
  - Student              (CRM profiles)
  - AuditLog             (compliance trail)
  - SecurityEvent        (guardrail events)
"""

import logging
from datetime import datetime
from typing import List, Dict, Optional, Any, Union
from collections import defaultdict

from sqlalchemy import text, func, inspect
import hashlib
import secrets
from config import USE_MOCK
from models.schemas import User, ChatMessage, ChatSession, Major, Student, AuditLog
from utils.logger import get_logger
import database

logger = get_logger(__name__)

class DBService:
    """
    Provides high-level data access methods for all pipeline components.
    All methods accept and return plain Python dicts — no ORM objects leak out.
    """

    @staticmethod
    def hash_password(password: str) -> str:
        """Hashes a password using PBKDF2-SHA256 (Standard Library)."""
        salt = secrets.token_hex(16)
        iterations = 100000
        hash_bytes = hashlib.pbkdf2_hmac(
            'sha256', 
            password.encode('utf-8'), 
            salt.encode('utf-8'), 
            iterations
        )
        return f"pbkdf2_sha256:{iterations}:{salt}:{hash_bytes.hex()}"

    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """Verifies a password against a PBKDF2 hash."""
        try:
            if not hashed_password or ":" not in hashed_password:
                return False
            
            parts = hashed_password.split(":")
            if len(parts) != 4 or parts[0] != "pbkdf2_sha256":
                return False
                
            _, iterations, salt, hash_hex = parts
            check_hash = hashlib.pbkdf2_hmac(
                'sha256', 
                plain_password.encode('utf-8'), 
                salt.encode('utf-8'), 
                int(iterations)
            ).hex()
            return secrets.compare_digest(check_hash, hash_hex)
        except Exception as e:
            logger.error(f"Password verification error: {e}")
            return False

    def __init__(self):
        self.use_mock = USE_MOCK
        if self.use_mock:
            # user_id -> list of message dicts
            self._history: Dict[str, List[Dict]] = defaultdict(list)
            # user_id -> profile dict
            self._profiles: Dict[str, Dict[str, Any]] = {}
            logger.info("DBService initialised in MOCK mode (in-memory)")
        else:
            # Determine the actual database type for accurate logging
            from config import get_database_url
            db_type = "SQLite" if get_database_url().startswith("sqlite") else "PostgreSQL"
            logger.info(f"DBService initialised for {db_type} (SessionLocal accessed dynamically)")

    def migrate_db(self):
        """Auto-migrate schema (e.g., adding 'title' to 'chat_sessions' if missing)."""
        if self.use_mock or not database.get_engine():
            return
            
        try:
            inspector = inspect(database.get_engine())
            
            # 1. Migrate chat_sessions (add title)
            if "chat_sessions" in inspector.get_table_names():
                session_cols = [col['name'] for col in inspector.get_columns("chat_sessions")]
                if "title" not in session_cols:
                    logger.info("Migration: Adding 'title' to 'chat_sessions'...")
                    with database.get_engine().connect() as conn:
                        conn.execute(text("ALTER TABLE chat_sessions ADD COLUMN title TEXT DEFAULT 'Cuộc hội thoại mới'"))
                        conn.commit()

            # 2. Migrate audit_logs (add missing PMF/Audit columns)
            if "audit_logs" in inspector.get_table_names():
                audit_cols = [col['name'] for col in inspector.get_columns("audit_logs")]
                new_columns = {
                    "input_data": "TEXT",
                    "output_data": "TEXT",
                    "judge_result": "JSON",
                    "route": "VARCHAR",
                    "response_time_ms": "INTEGER",
                    "ai_resolved": "BOOLEAN DEFAULT TRUE",
                    "fallback": "BOOLEAN DEFAULT FALSE"
                }
                
                with database.get_engine().connect() as conn:
                    for col_name, col_type in new_columns.items():
                        if col_name not in audit_cols:
                            logger.info(f"Migration: Adding column '{col_name}' to 'audit_logs'...")
                            conn.execute(text(f"ALTER TABLE audit_logs ADD COLUMN {col_name} {col_type}"))
                    conn.commit()
                logger.info("✓ Database migrations completed.")

        except Exception as e:
            logger.error(f"Migration failed (non-critical): {e}")

    # ------------------------------------------------------------------
    # Conversation history
    # ------------------------------------------------------------------

    def save_message(self, user_id: str, role: str, content: str, agent_type: str = "", session_id: Optional[str] = None) -> Optional[str]:
        """
        Persist one conversation turn to ConversationHistory.

        Args:
            user_id:    Student identifier.
            role:       "user" or "assistant".
            content:    Message text.
            agent_type: Which agent generated this (rag/crm/advisor/judge).
        """
        new_title = None
        if self.use_mock:
            self._history[user_id].append({
                "role": role,
                "content": content,
                "agent_type": agent_type,
                "timestamp": datetime.utcnow(),
                "session_id": session_id
            })
            logger.debug(f"DBService.save_message(MOCK) — user={user_id}, role={role}")
            return None

        if database.SessionLocal is None:
            logger.error("DBService.save_message failed: database.SessionLocal is not initialized")
            return

        with database.SessionLocal() as session:
            # Ensure session exists in the DB and belongs to the correct user
            chat_session = None
            if session_id:
                chat_session = session.query(ChatSession).filter(ChatSession.id == session_id).first()
                if not chat_session:
                    # Create new session record if it doesn't exist
                    chat_session = ChatSession(id=session_id, user_id=user_id, title="")
                    session.add(chat_session)
                elif chat_session.user_id != user_id:
                    # Security check: Prevent saving messages to a session belonging to another user
                    logger.error(f"Security Violation: User {user_id} tried to save to session {session_id} owned by {chat_session.user_id}")
                    # In production, you might raise an Exception here
                    return None
                
                # Flush to ensure persistence before potential commit
                session.flush()

            new_msg = ChatMessage(
                user_id=user_id,
                session_id=session_id,
                role=role,
                content=content,
                agent_type=agent_type,
                timestamp=datetime.utcnow()
            )
            session.add(new_msg)
            
            # Automatically generate session title from the first message
            if chat_session and role == "user" and not chat_session.title:
                # Heuristic: Use first 50 chars of the first user message as title
                title_preview = content[:50].strip()
                chat_session.title = title_preview + ("..." if len(content) > 50 else "")
                new_title = chat_session.title
            
            session.commit()
        return new_title

    def get_history(self, user_id: str, limit: int = 20, session_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Fetch the most recent N conversation turns for a user.

        Args:
            user_id: Student identifier.
            limit:   Max number of turns to return (default 20).
            session_id: Optional session identifier for filtering.

        Returns:
            List of dicts including metadata.
            Ordered oldest → newest.
        """
        if self.use_mock:
            msgs = self._history.get(user_id, [])
            if session_id:
                msgs = [m for m in msgs if m.get("session_id") == session_id]
                
            history = [
                {
                    "role": m["role"], 
                    "content": m["content"], 
                    "agent_type": m.get("agent_type"),
                    "timestamp": m.get("timestamp").isoformat() if m.get("timestamp") else None
                } for m in msgs[-limit:]
            ]
            logger.debug(f"DBService.get_history(MOCK) — user={user_id}, found {len(history)} turns")
            return history

        if database.SessionLocal is None:
            logger.error("DBService.get_history failed: database.SessionLocal is not initialized")
            return []

        with database.SessionLocal() as session:
            query = session.query(ChatMessage).filter(ChatMessage.user_id == user_id)
            if session_id:
                query = query.filter(ChatMessage.session_id == session_id)
                
            msgs = query.order_by(ChatMessage.timestamp.desc()).limit(limit).all()
            
            history = [
                {
                    "role": m.role, 
                    "content": m.content, 
                    "agent_type": m.agent_type,
                    "timestamp": m.timestamp.isoformat() if m.timestamp else None
                } for m in reversed(msgs)
            ]
            logger.debug(f"DBService.get_history() — user={user_id}, found {len(history)} turns")
            return history

    def get_user_sessions(self, user_id: str) -> List[Dict[str, Any]]:
        """
        Fetch all chat sessions for a specific user from the ChatSession table.

        Args:
            user_id: Student identifier.

        Returns:
            List of dicts representing chat sessions.
        """
        if self.use_mock:
            logger.debug(f"DBService.get_user_sessions(MOCK) — user={user_id}")
            return []

        try:
            if database.SessionLocal is None:
                logger.error("DBService.get_user_sessions failed: database.SessionLocal is not initialized")
                return []

            with database.SessionLocal() as session:
                sessions = session.query(ChatSession)\
                    .filter(ChatSession.user_id == user_id)\
                    .order_by(ChatSession.created_at.desc())\
                    .all()
                
                return [
                    {
                        "id": s.id,
                        "title": s.title,
                        "user_id": s.user_id,
                        "created_at": s.created_at.isoformat() if s.created_at else None,
                        "ended_at": s.ended_at.isoformat() if s.ended_at else None
                    } for s in sessions
                ]
        except Exception as e:
            logger.error(f"DBService.get_user_sessions failed: {e}")
            return []

    def get_session_by_id(self, session_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch a specific chat session by its unique ID.
        
        Args:
            session_id: The session UUID string.
        """
        if self.use_mock:
            return None

        if database.SessionLocal is None:
            logger.error("DBService.get_session_by_id failed: database.SessionLocal is not initialized")
            return None

        with database.SessionLocal() as session:
            s = session.query(ChatSession).filter(ChatSession.id == session_id).first()
            if not s:
                return None
            return {
                "id": s.id,
                "title": s.title,
                "user_id": s.user_id,
                "created_at": s.created_at
            }

    def delete_session(self, session_id: str) -> None:
        """
        Delete a chat session and all messages associated with it.
        """
        if self.use_mock:
            logger.debug(f"DBService.delete_session(MOCK) — session={session_id}")
            return

        if database.SessionLocal is None:
            logger.error("DBService.delete_session failed: database.SessionLocal is not initialized")
            return

        with database.SessionLocal() as session:
            # Delete associated messages first to maintain referential integrity
            session.query(ChatMessage).filter(ChatMessage.session_id == session_id).delete()
            # Delete the session itself
            session.query(ChatSession).filter(ChatSession.id == session_id).delete()
            session.commit()
            logger.info(f"DBService: Deleted session {session_id} and its messages")

    def update_session_title(self, session_id: str, title: str) -> bool:
        """
        Update the title of a specific chat session.
        
        Returns:
            bool: True if successful, False otherwise.
        """
        if self.use_mock:
            logger.debug(f"DBService.update_session_title(MOCK) — session={session_id}, title={title}")
            return True

        try:
            if database.SessionLocal is None:
                logger.error("DBService.update_session_title failed: database.SessionLocal is not initialized")
                return False

            with database.SessionLocal() as session:
                chat_session = session.query(ChatSession).filter(ChatSession.id == session_id).first()
                if chat_session:
                    chat_session.title = title
                    session.commit()
                    return True
                return False
        except Exception as e:
            logger.error(f"DBService.update_session_title failed: {e}")
            return False

    def authenticate_user(self, email: str, password: str) -> Optional[Dict[str, Any]]:
        """
        Authenticate a user by verifying the password using passlib (bcrypt).
        """
        if self.use_mock:
            # In mock mode, we assume any user exists if they are in the dict
            return self.get_student_profile(email)

        try:
            if database.SessionLocal is None:
                # Avoid misleading 401s by raising a clear system error
                raise RuntimeError("Database connection not initialized. Check server startup logs.")

            with database.SessionLocal() as session:
                # Attempt to find user by email first, fallback to user_id
                # This resolves conflicts where a user might have been created with email as the ID
                user = session.query(User).filter(func.lower(User.email) == func.lower(email)).first()
                
                if not user:
                    user = session.query(User).filter(func.lower(User.user_id) == func.lower(email)).first()

                if not user:
                    logger.warning(f"DBService.authenticate_user: User not found for email {email}")
                    return None

                # Verify password in Python using PBKDF2
                # Safety check: ensure hashed_password exists (Google users might not have one)
                if user.hashed_password and self.verify_password(password, user.hashed_password):
                    return {
                        "user_id": user.user_id,
                        "email": user.email,
                        "role": user.role,
                        "permissions": user.permissions
                    }
                
                logger.warning(f"DBService.authenticate_user: Password mismatch for user: {email}")
                return None
        except Exception as e:
            if "no such column" in str(e).lower():
                logger.error(f"CRITICAL SCHEMA ERROR: The database is missing columns. Run 'python backend/create_db.py' or check migrations. Details: {e}")
            else:
                logger.error(f"DBService.authenticate_user system error: {e}")
            return None

    # ------------------------------------------------------------------
    # Student profiles (CRM)
    # ------------------------------------------------------------------

    def get_all_users(self) -> List[Dict[str, Any]]:
        """
        Fetch all users from the users table.
        Used for debugging and testing.
        """
        if self.use_mock:
            return [{"user_id": uid, "email": profile.get("email")} for uid, profile in self._profiles.items()]

        try:
            if database.SessionLocal is None:
                logger.error("DBService.get_all_users failed: database.SessionLocal is not initialized")
                return []

            with database.SessionLocal() as session:
                users = session.query(User).all()
                return [
                    {
                        "user_id": u.user_id,
                        "email": u.email,
                        "full_name": u.full_name,
                        "role": u.role,
                        "created_at": u.created_at.isoformat() if u.created_at else None
                    } for u in users
                ]
        except Exception as e:
            logger.error(f"DBService.get_all_users failed: {e}")
            return []

    def get_student_profile(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch student profile data combined from User and Student tables.
        """
        if self.use_mock:
            profile = self._profiles.get(user_id)
            logger.debug(f"DBService.get_student_profile(MOCK) — user={user_id}, found={profile is not None}")
            return profile

        try:
            if database.SessionLocal is None:
                logger.error("DBService.get_student_profile failed: database.SessionLocal is not initialized")
                return None

            with database.SessionLocal() as session:
                # Check User table using case-insensitive match for both ID and Email
                user = session.query(User).filter(
                    (func.lower(User.user_id) == func.lower(user_id)) | 
                    (func.lower(User.email) == func.lower(user_id))
                ).first()
                
                if not user:
                    return None
                
                # Build initial dict from User columns
                data = {
                    "user_id": user.user_id,
                    "email": user.email,
                    "full_name": user.full_name,
                    "role": user.role,
                    "permissions": user.permissions
                }
                
                # Fetch and merge Student academic profile data if it exists
                student = session.query(Student).filter(Student.user_id == user.user_id).first()
                if student:
                    data.update({"gpa": student.gpa, "preferred_majors": student.preferred_majors, "test_scores": student.test_scores})
                    if student.profile_data: data.update(student.profile_data)
                return data
        except Exception as e:
            logger.error(f"DBService.get_student_profile failed: {e}")
            return None

    def upsert_student_profile(self, user_id: str, profile_data: Dict[str, Any]) -> None:
        """
        Insert or update a student's profile.

        Args:
            user_id:      Student identifier.
            profile_data: Dict of profile fields (gpa, ielts, interests, etc.).
        """
        if self.use_mock:
            self._profiles[user_id] = profile_data
            logger.debug(f"DBService.upsert_student_profile(MOCK) — user={user_id}")
            return

        try:
            if database.SessionLocal is None:
                raise RuntimeError("Database connection not initialized.")

            with database.SessionLocal() as session:
                # 1. Update/Create entry in User table (Auth & Identity)
                user = session.query(User).filter(User.user_id == user_id).first()
                
                # Pop User-specific fields from profile_data to avoid duplicate storage in JSON
                email = profile_data.pop("email", None)
                full_name = profile_data.pop("full_name", None)
                plain_password = profile_data.pop("password", None)
                role = profile_data.pop("role", None)
                permissions = profile_data.pop("permissions", None)

                if user:
                    if email: user.email = email
                    if full_name: user.full_name = full_name
                    if plain_password: 
                        # Hash using PBKDF2
                        user.hashed_password = self.hash_password(plain_password)
                    if role: user.role = role
                    if permissions is not None: user.permissions = permissions
                    user.updated_at = datetime.utcnow()
                else:
                    new_user = User(
                        user_id=user_id, 
                        email=email or user_id, 
                        full_name=full_name,
                        # Hash using PBKDF2
                        hashed_password=self.hash_password(plain_password) if plain_password else None,
                        role=role or "user",
                        permissions=permissions
                    )
                    session.add(new_user)

                # Explicitly flush to the database so the User record exists
                # before we attempt to create/query the dependent Student record.
                session.flush()

                # 2. Update/Create entry in Student table (Academic Profile)
                student = session.query(Student).filter(Student.user_id == user_id).first()
                
                # Pop Student-specific columns
                gpa = profile_data.pop("gpa", None)
                pref = profile_data.pop("preferred_majors", None)
                scores = profile_data.pop("test_scores", None)

                if student:
                    if gpa is not None: student.gpa = gpa 
                    if pref is not None: student.preferred_majors = pref 
                    if scores is not None: student.test_scores = scores 
                    
                    # Merge new profile fields into existing JSON blob
                    if student.profile_data:
                        updated_json = student.profile_data.copy()
                        updated_json.update(profile_data)
                        student.profile_data = updated_json
                    else:
                        student.profile_data = profile_data
                    student.updated_at = datetime.utcnow()
                else:
                    student = Student(user_id=user_id, gpa=gpa, preferred_majors=pref, test_scores=scores, profile_data=profile_data)
                    session.add(student)
                
                session.commit()
        except Exception as e:
            logger.error(f"DBService.upsert_student_profile failed: {e}")
            # Re-raise to ensure the API layer (signup) knows the operation failed
            raise

    def create_user_if_not_exists(self, user_id: str) -> None:
        """
        Ensure a user record exists in the users table.

        Args:
            user_id: Student identifier.
        """
        if self.use_mock:
            logger.debug(f"DBService.create_user_if_not_exists(MOCK) — user={user_id}")
            return

        if database.SessionLocal is None:
            logger.error("DBService.create_user_if_not_exists failed: database.SessionLocal is not initialized")
            return

        with database.SessionLocal() as session:
            user = session.query(User).filter(User.user_id == user_id).first()
            if not user:
                new_user = User(user_id=user_id)
                session.add(new_user)
                session.commit()
                logger.info(f"DBService: Created new user record for {user_id}")

    # ------------------------------------------------------------------
    # Audit logging
    # ------------------------------------------------------------------

    def save_audit_log(
        self,
        user_id: str,
        input_data: str,
        output_data: str,
        judge_result: Dict[str, Any],
        route: str = None,
        response_time_ms: int = None,
        ai_resolved: bool = True,
        fallback: bool = False
    ) -> None:
        """
        Persist an audit record for compliance and debugging.

        Args:
            user_id:      Student identifier.
            input_data:   Sanitised user input or action description.
            output_data:  Final agent response or result status.
            judge_result: Dict from JudgeAgent.evaluate().
            route:        The classification route (rag/crm/advisor/fallback).
            response_time_ms: Latency of the request.
            ai_resolved:  Whether the AI handled the query successfully.
            fallback:     Whether human fallback was triggered.
        """
        if self.use_mock:
            logger.info(f"DBService.save_audit_log(MOCK) — user={user_id}, route={route}, res={ai_resolved}")
            return

        try:
            with database.SessionLocal() as session:
                log_entry = AuditLog(
                    user_id=user_id,
                    input_data=input_data,
                    output_data=output_data,
                    judge_result=judge_result,
                    route=route,
                    response_time_ms=response_time_ms,
                    ai_resolved=ai_resolved,
                    fallback=fallback,
                    timestamp=datetime.utcnow()
                )
                session.add(log_entry)
                session.commit()
                logger.debug(f"Audit log persisted for user {user_id}")
        except Exception as e:
            logger.error(f"Failed to save audit log: {e}")

    def get_majors(self) -> List[Dict[str, Any]]:
        """
        Fetch list of available majors from the database.
        In Mock mode, returns an empty list to trigger hardcoded fallback in agents.
        """
        if self.use_mock:
            return []

        try:
            if database.SessionLocal is None:
                logger.error("DBService.get_majors failed: database.SessionLocal is not initialized")
                return []

            with database.SessionLocal() as session:
                # Use the ORM model to fetch all majors
                result = session.query(Major).all()
                
                majors = []
                for row in result:
                    majors.append({
                        "id": row.id,
                        "name": row.name,
                        "description": row.description
                    })
                return majors
        except Exception as e:
            logger.error(f"Failed to fetch majors from DB: {e}")
            return []
