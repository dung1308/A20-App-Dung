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
from models.schemas import User, ChatMessage, ChatSession, Major, Student, AuditLog, SecurityEvent, CVDocument, HandoffMessage, AdmissionsData
from utils.logger import get_logger, get_trace_id
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
            from config import get_database_url
            url = get_database_url()
            self.is_sqlite = url.startswith("sqlite")
            db_type = "SQLite" if self.is_sqlite else "PostgreSQL"
            logger.info(f"DBService initialised for {db_type} (SessionLocal accessed dynamically)")

    def migrate_db(self):
        """Auto-migrate schema (e.g., adding 'prompts' table if missing)."""
        if self.use_mock or not database.get_engine():
            return
            
        try:
            inspector = inspect(database.get_engine())
            
            # Create prompts table if missing
            if "prompts" not in inspector.get_table_names():
                logger.info("Migration: Creating 'prompts' table...")
                with database.get_engine().connect() as conn:
                    if self.is_sqlite:
                        conn.execute(text("""
                            CREATE TABLE prompts (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                agent_name VARCHAR(50) NOT NULL,
                                version VARCHAR(20) NOT NULL,
                                content TEXT NOT NULL,
                                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                UNIQUE(agent_name, version)
                            )
                        """))
                    else:
                        conn.execute(text("""
                            CREATE TABLE prompts (
                                id SERIAL PRIMARY KEY,
                                agent_name VARCHAR(50) NOT NULL,
                                version VARCHAR(20) NOT NULL,
                                content TEXT NOT NULL,
                                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                UNIQUE(agent_name, version)
                            )
                        """))
                    conn.commit()

            # Check for 'sources' column in 'chat_messages' table
            columns = [c['name'] for c in inspector.get_columns('chat_messages')]
            if 'sources' not in columns:
                logger.info("Migration: Adding 'sources' column to 'chat_messages' table...")
                with database.get_engine().connect() as conn:
                    if self.is_sqlite:
                        conn.execute(text("ALTER TABLE chat_messages ADD COLUMN sources JSON"))
                    else:
                        # Use JSONB for Postgres as it is more efficient for searches/metadata
                        conn.execute(text("ALTER TABLE chat_messages ADD COLUMN sources JSONB"))
                    conn.commit()

            logger.info("✓ Database migrations completed.")
        except Exception as e:
            logger.error(f"Migration failed (non-critical): {e}")

    # ------------------------------------------------------------------
    # Conversation history
    # ------------------------------------------------------------------

    def save_message(self, user_id: str, role: str, content: str, agent_type: str = "", session_id: Optional[str] = None, sources: Optional[List[Dict[str, Any]]] = None) -> Optional[str]:
        """
        Persist one conversation turn to ConversationHistory.

        Args:
            user_id:    Student identifier.
            role:       "user" or "assistant".
            content:    Message text.
            agent_type: Which agent generated this (rag/crm/advisor/judge).
            sources:    Optional list of RAG source metadata.
        """
        new_title = None
        if self.use_mock:
            self._history[user_id].append({
                "role": role,
                "content": content,
                "agent_type": agent_type,
                "sources": sources,
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
                sources=sources if sources is not None else [], # Ensure empty list instead of NULL
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
        logger.info(f"save_message args = {content}")
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
                    "id": m.get("id"),
                    "role": m["role"], 
                    "content": m["content"], 
                    "agent_type": m.get("agent_type"),
                    "sources": m.get("sources"),
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
                    "id": m.id,
                    "role": m.role, 
                    "content": m.content, 
                    "agent_type": m.agent_type,
                    "sources": m.sources,
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

    def delete_message(self, message_id: int, requester_email: str, requester_role: str) -> bool:
        """Delete a chat message if the requester owns it or is staff."""
        if self.use_mock:
            return True

        if database.SessionLocal is None:
            logger.error("DBService.delete_message failed: database.SessionLocal is not initialized")
            return False

        with database.SessionLocal() as session:
            message = session.query(ChatMessage).filter(ChatMessage.id == message_id).first()
            if not message:
                return False
            if requester_role not in {"admin", "editor"} and message.user_id != requester_email:
                return False
            session.delete(message)
            session.commit()
            return True

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

                if getattr(user, "blacklisted", False):
                    logger.warning(f"DBService.authenticate_user: Blacklisted user blocked: {email}")
                    return None

                # Verify password in Python using PBKDF2
                # Safety check: ensure hashed_password exists (Google users might not have one)
                if user.hashed_password and self.verify_password(password, user.hashed_password):
                    return {
                        "user_id": user.user_id,
                        "email": user.email,
                        "role": user.role,
                        "permissions": user.permissions,
                        "blacklisted": bool(getattr(user, "blacklisted", False))
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
                result = []
                for u in users:
                    student = session.query(Student).filter(Student.user_id == u.user_id).first()
                    profile_data = student.profile_data if student and student.profile_data else {}
                    result.append({
                        "user_id": u.user_id,
                        "email": u.email,
                        "full_name": u.full_name,
                        "role": u.role,
                        "permissions": u.permissions or [],
                        "blacklisted": bool(getattr(u, "blacklisted", False)),
                        "cv_filename": profile_data.get("cv_filename"),
                        "cv_uploaded_at": profile_data.get("cv_uploaded_at"),
                        "created_at": u.created_at.isoformat() if u.created_at else None
                    })
                return result
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
                    "permissions": user.permissions,
                    "blacklisted": bool(getattr(user, "blacklisted", False))
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
                blacklisted = profile_data.pop("blacklisted", None)

                if user:
                    if email: user.email = email
                    if full_name: user.full_name = full_name
                    if plain_password: 
                        # Hash using PBKDF2
                        user.hashed_password = self.hash_password(plain_password)
                    if role: user.role = role
                    if permissions is not None: user.permissions = permissions
                    if blacklisted is not None: user.blacklisted = bool(blacklisted)
                    user.updated_at = datetime.utcnow()
                else:
                    new_user = User(
                        user_id=user_id, 
                        email=email or user_id, 
                        full_name=full_name,
                        # Hash using PBKDF2
                        hashed_password=self.hash_password(plain_password) if plain_password else None,
                        role=role or "user",
                        permissions=permissions,
                        blacklisted=bool(blacklisted) if blacklisted is not None else False
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
                    if scores is not None:
                        merged_scores = (student.test_scores or {}).copy()
                        merged_scores.update(scores)
                        student.test_scores = merged_scores
                    
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
    # CV documents
    # ------------------------------------------------------------------

    def create_cv_document(
        self,
        user_id: str,
        filename: str,
        file_path: str,
        raw_text: str,
        structured_data: Optional[Dict[str, Any]],
        cv_signals: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Persist an uploaded CV version and make the newest text active."""
        if self.use_mock:
            doc_id = secrets.token_hex(12)
            return {
                "id": doc_id,
                "user_id": user_id,
                "filename": filename,
                "raw_text": raw_text,
                "structured_data": structured_data or {},
                "cv_signals": cv_signals,
                "version": 1,
                "is_active": True,
                "created_at": datetime.utcnow().isoformat(),
            }

        with database.SessionLocal() as session:
            existing_user = session.query(User).filter(
                (User.user_id == user_id) | (func.lower(User.email) == func.lower(user_id))
            ).first()
            if not existing_user:
                existing_user = User(user_id=user_id, email=user_id if "@" in user_id else None)
                session.add(existing_user)
                session.flush()
            resolved_user_id = existing_user.user_id
            version = (session.query(func.max(CVDocument.version)).filter(CVDocument.user_id == resolved_user_id).scalar() or 0) + 1
            session.query(CVDocument).filter(CVDocument.user_id == resolved_user_id).update({"is_active": False})
            doc = CVDocument(
                id=str(secrets.token_hex(16)),
                user_id=resolved_user_id,
                filename=filename,
                file_path=file_path,
                raw_text=raw_text,
                structured_data=structured_data or {},
                cv_signals=cv_signals or {},
                version=version,
                is_active=True,
            )
            session.add(doc)
            session.commit()
            return self._cv_document_to_dict(doc)

    def list_cv_documents(self, user_id: str) -> List[Dict[str, Any]]:
        if self.use_mock or database.SessionLocal is None:
            return []
        with database.SessionLocal() as session:
            resolved_user_id = self._resolve_user_id(session, user_id)
            docs = session.query(CVDocument).filter(CVDocument.user_id == resolved_user_id).order_by(CVDocument.created_at.desc()).all()
            return [self._cv_document_to_dict(doc, include_text=False) for doc in docs]

    def get_cv_document(self, user_id: str, document_id: str) -> Optional[Dict[str, Any]]:
        if self.use_mock or database.SessionLocal is None:
            return None
        with database.SessionLocal() as session:
            resolved_user_id = self._resolve_user_id(session, user_id)
            doc = session.query(CVDocument).filter(CVDocument.user_id == resolved_user_id, CVDocument.id == document_id).first()
            return self._cv_document_to_dict(doc) if doc else None

    def get_active_cv_document(self, user_id: str) -> Optional[Dict[str, Any]]:
        if self.use_mock or database.SessionLocal is None:
            return None
        with database.SessionLocal() as session:
            resolved_user_id = self._resolve_user_id(session, user_id)
            doc = session.query(CVDocument)\
                .filter(CVDocument.user_id == resolved_user_id, CVDocument.is_active == True)\
                .order_by(CVDocument.confirmed_at.desc().nullslast(), CVDocument.created_at.desc())\
                .first()
            return self._cv_document_to_dict(doc) if doc else None

    def confirm_cv_document(self, user_id: str, document_id: str, structured_data: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        if self.use_mock or database.SessionLocal is None:
            return None
        with database.SessionLocal() as session:
            resolved_user_id = self._resolve_user_id(session, user_id)
            doc = session.query(CVDocument).filter(CVDocument.user_id == resolved_user_id, CVDocument.id == document_id).first()
            if not doc:
                return None
            if structured_data is not None:
                doc.structured_data = structured_data
            session.query(CVDocument).filter(CVDocument.user_id == resolved_user_id).update({"is_active": False})
            doc.is_active = True
            doc.confirmed_at = datetime.utcnow()
            doc.updated_at = datetime.utcnow()
            session.commit()

            self.merge_profile_from_cv(user_id, doc.structured_data or {}, doc.cv_signals or {}, doc.id, doc.filename)
            return self._cv_document_to_dict(doc)

    def delete_cv_document(self, user_id: str, document_id: str) -> bool:
        if self.use_mock or database.SessionLocal is None:
            return False
        with database.SessionLocal() as session:
            resolved_user_id = self._resolve_user_id(session, user_id)
            doc = session.query(CVDocument).filter(CVDocument.user_id == resolved_user_id, CVDocument.id == document_id).first()
            if not doc:
                return False
            session.delete(doc)
            session.commit()
            return True

    # ------------------------------------------------------------------
    # Human handoff messages
    # ------------------------------------------------------------------

    def display_name_for_user(self, user_id: str, fallback_role: str = "VinUni counsellor") -> str:
        profile = self.get_student_profile(user_id) or {}
        full_name = (profile.get("full_name") or "").strip()
        if full_name:
            return full_name
        email = (profile.get("email") or user_id or "").strip()
        if "@" in email:
            return email.split("@", 1)[0]
        return email or fallback_role

    def save_handoff_message(
        self,
        trace_id: str,
        user_id: str,
        sender_id: str,
        sender_name: str,
        sender_role: str,
        role: str,
        content: str,
    ) -> Optional[Dict[str, Any]]:
        if self.use_mock or database.SessionLocal is None:
            return {
                "id": None,
                "trace_id": trace_id,
                "user_id": user_id,
                "sender_id": sender_id,
                "sender_name": sender_name,
                "sender_role": sender_role,
                "role": role,
                "content": content,
                "timestamp": datetime.utcnow().isoformat(),
            }

        with database.SessionLocal() as session:
            resolved_user_id = self._resolve_user_id(session, user_id)
            sender_user = session.query(User).filter(
                (User.user_id == sender_id) | (func.lower(User.email) == func.lower(sender_id))
            ).first()
            resolved_sender_id = sender_user.user_id if sender_user else sender_id
            msg = HandoffMessage(
                trace_id=trace_id,
                user_id=resolved_user_id,
                sender_id=resolved_sender_id,
                sender_name=sender_name,
                sender_role=sender_role,
                role=role,
                content=content,
                timestamp=datetime.utcnow(),
            )
            session.add(msg)
            session.commit()
            return self._handoff_message_to_dict(msg)

    def get_handoff_messages(self, trace_id: str) -> List[Dict[str, Any]]:
        if self.use_mock or database.SessionLocal is None:
            return []
        with database.SessionLocal() as session:
            messages = session.query(HandoffMessage)\
                .filter(HandoffMessage.trace_id == trace_id)\
                .order_by(HandoffMessage.timestamp.asc())\
                .all()
            return [self._handoff_message_to_dict(message) for message in messages]

    def _handoff_message_to_dict(self, message: HandoffMessage) -> Dict[str, Any]:
        return {
            "id": message.id,
            "trace_id": message.trace_id,
            "user_id": message.user_id,
            "sender_id": message.sender_id,
            "sender_name": message.sender_name,
            "sender_role": message.sender_role,
            "role": message.role,
            "content": message.content,
            "timestamp": message.timestamp.isoformat() if message.timestamp else None,
        }

    def merge_profile_from_cv(
        self,
        user_id: str,
        structured_data: Dict[str, Any],
        cv_signals: Dict[str, Any],
        document_id: str,
        filename: str,
        store_structured_snapshot: bool = True,
    ) -> Optional[str]:
        """Merge non-empty CV fields into the profile without erasing useful data."""
        personal = structured_data.get("personal_info") or {}
        profile_update: Dict[str, Any] = {
            "active_cv_document_id": document_id,
            "cv_filename": filename,
            "cv_signals": cv_signals or {},
            "cv_uploaded_at": datetime.utcnow().isoformat(),
        }
        if store_structured_snapshot:
            profile_update["cv_structured_data"] = structured_data or {}
        for source_key, target_key in [("name", "full_name"), ("full_name", "full_name"), ("phone", "phone")]:
            value = personal.get(source_key)
            if value:
                profile_update[target_key] = value
        for key in ["summary", "career_goals", "skills", "languages", "certifications", "achievements", "education", "experience", "projects"]:
            value = structured_data.get(key)
            if value:
                profile_update[key] = value
        gpa = structured_data.get("gpa")
        if gpa is None:
            gpa = cv_signals.get("gpa_estimate")
        if gpa is not None:
            profile_update["gpa"] = gpa
        ielts = structured_data.get("ielts")
        if ielts is None:
            ielts = cv_signals.get("ielts_estimate")
        if ielts is not None:
            profile_update["test_scores"] = {"ielts": ielts}
        self.upsert_student_profile(user_id, profile_update)

    def _cv_document_to_dict(self, doc: CVDocument, include_text: bool = True) -> Dict[str, Any]:
        data = {
            "id": doc.id,
            "user_id": doc.user_id,
            "filename": doc.filename,
            "version": doc.version,
            "is_active": bool(doc.is_active),
            "confirmed_at": doc.confirmed_at.isoformat() if doc.confirmed_at else None,
            "created_at": doc.created_at.isoformat() if doc.created_at else None,
            "updated_at": doc.updated_at.isoformat() if doc.updated_at else None,
            "structured_data": doc.structured_data or {},
            "cv_signals": doc.cv_signals or {},
        }
        if include_text:
            data["raw_text"] = doc.raw_text or ""
            data["file_path"] = doc.file_path
        return data

    def _resolve_user_id(self, session, user_id: str) -> str:
        user = session.query(User).filter(
            (User.user_id == user_id) | (func.lower(User.email) == func.lower(user_id))
        ).first()
        return user.user_id if user else user_id

    # ------------------------------------------------------------------
    # Audit logging
    # ------------------------------------------------------------------

    def save_audit_log(
        self,
        user_id: str,
        input_text: str = None,
        output_text: str = None,
        judge_result: Dict[str, Any] = None,
        route: str = None,
        response_time_ms: float = 0.0,
        ai_resolved: bool = True,
        fallback: bool = False,
        input_data: str = None,
        output_data: str = None,
        handoff_status: str = "none",
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
        input_text = input_text if input_text is not None else input_data
        output_text = output_text if output_text is not None else output_data
        input_data = input_data if input_data is not None else input_text
        output_data = output_data if output_data is not None else output_text
        judge_result = judge_result or {}
        trace_id = get_trace_id()
        if trace_id == "-":
            trace_id = f"audit-{secrets.token_hex(8)}"
        escalation_level = judge_result.get("escalation_level", "NONE")
        escalation_reason = judge_result.get("escalation_reason", "")

        if self.use_mock:
            logger.info("DBService.save_audit_log(MOCK) user=%s route=%s res=%s", user_id, route, ai_resolved)
            return trace_id

        try:
            if database.SessionLocal is None:
                logger.error("DBService.save_audit_log failed: database.SessionLocal is not initialized")
                return None

            with database.SessionLocal() as session:
                existing_user = None
                if user_id:
                    existing_user = session.query(User).filter(
                        (User.user_id == user_id) | (func.lower(User.email) == func.lower(user_id))
                    ).first()
                if user_id and not existing_user:
                    existing_user = User(user_id=user_id, email=user_id if "@" in user_id else None)
                    session.add(existing_user)
                    session.flush()

                log_entry = AuditLog(
                    user_id=existing_user.user_id if existing_user else None,
                    trace_id=trace_id,
                    input_data=input_data,
                    output_data=output_data,
                    input_text=input_text,
                    output_text=output_text,
                    judge_result=judge_result,
                    escalation_level=escalation_level,
                    escalation_reason=escalation_reason,
                    handoff_status=handoff_status,
                    route=route,
                    response_time_ms=response_time_ms,
                    ai_resolved=ai_resolved,
                    fallback=fallback,
                    timestamp=datetime.utcnow()
                )
                session.add(log_entry)
                session.commit()
                logger.debug(f"Audit log persisted for user {user_id}")
                return trace_id
        except Exception as e:
            logger.error(f"Failed to save audit log: {e}")
            return None

    def save_security_event(
        self,
        user_id: Optional[str],
        event_type: str,
        severity: str,
        details: Dict[str, Any],
    ) -> None:
        """
        Persist a guardrail/security event for staff review and incident analysis.
        This method is best-effort and must never block the user-facing flow.
        """
        if self.use_mock:
            logger.warning(
                "DBService.save_security_event(MOCK) — user=%s type=%s severity=%s details=%s",
                user_id,
                event_type,
                severity,
                details,
            )
            return

        try:
            if database.SessionLocal is None:
                logger.error("DBService.save_security_event failed: database.SessionLocal is not initialized")
                return

            with database.SessionLocal() as session:
                existing_user = None
                if user_id:
                    existing_user = session.query(User).filter(
                        (User.user_id == user_id) | (func.lower(User.email) == func.lower(user_id))
                    ).first()
                if user_id and not existing_user:
                    existing_user = User(user_id=user_id, email=user_id if "@" in user_id else None)
                    session.add(existing_user)
                    session.flush()

                event = SecurityEvent(
                    user_id=existing_user.user_id if existing_user else None,
                    event_type=event_type,
                    severity=severity,
                    details=details,
                    timestamp=datetime.utcnow(),
                )
                session.add(event)
                session.commit()
        except Exception as e:
            logger.error(f"Failed to save security event: {e}")

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

    def get_admissions_data_by_major(self) -> Dict[str, Dict[str, Any]]:
        """Fetch admissions metadata keyed by major id for report enrichment."""
        if self.use_mock or database.SessionLocal is None:
            return {}

        try:
            with database.SessionLocal() as session:
                rows = session.query(AdmissionsData).all()
                return {
                    row.major_id: {
                        "requirements": row.requirements,
                        "description": row.description,
                        "official_url": row.official_url,
                    }
                    for row in rows
                }
        except Exception as e:
            logger.error(f"Failed to fetch admissions data from DB: {e}")
            return {}

    # ------------------------------------------------------------------
    # Prompt management
    # ------------------------------------------------------------------

    def get_all_prompts(self) -> List[Dict[str, Any]]:
        """Return all prompt versions ordered for admin review."""
        if self.use_mock:
            return []

        if database.SessionLocal is None:
            return []

        try:
            with database.SessionLocal() as session:
                rows = session.execute(text("""
                    SELECT agent_name, version, content, created_at
                    FROM prompts
                    ORDER BY agent_name ASC, created_at DESC
                """)).fetchall()
                return [
                    {
                        "agent_name": row[0],
                        "version": row[1],
                        "content": row[2],
                        "created_at": row[3].isoformat() if hasattr(row[3], "isoformat") else row[3],
                    }
                    for row in rows
                ]
        except Exception as e:
            logger.error(f"DBService.get_all_prompts failed: {e}")
            return []

    def get_prompt_from_db(self, agent_name: str, version: str = "latest") -> Optional[str]:
        """Lấy prompt từ database."""
        if self.use_mock:
            return None

        if database.SessionLocal is None:
            return None

        with database.SessionLocal() as session:
            if version == "latest":
                query = text("SELECT content FROM prompts WHERE agent_name = :name ORDER BY created_at DESC LIMIT 1")
                params = {"name": agent_name}
            else:
                query = text("SELECT content FROM prompts WHERE agent_name = :name AND version = :version")
                params = {"name": agent_name, "version": version}
            
            result = session.execute(query, params).fetchone()
            return result[0] if result else None

    def save_prompt_to_db(self, agent_name: str, version: str, content: str) -> bool:
        """Lưu hoặc cập nhật prompt vào database."""
        if self.use_mock:
            return True

        if database.SessionLocal is None:
            return False

        try:
            with database.SessionLocal() as session:
                if self.is_sqlite:
                    sql = text("INSERT OR REPLACE INTO prompts (agent_name, version, content, created_at) VALUES (:name, :version, :content, :now)")
                else:
                    sql = text("""
                        INSERT INTO prompts (agent_name, version, content, created_at)
                        VALUES (:name, :version, :content, :now)
                        ON CONFLICT (agent_name, version) DO UPDATE SET content = EXCLUDED.content, created_at = EXCLUDED.created_at
                    """)
                session.execute(sql, {"name": agent_name, "version": version, "content": content, "now": datetime.utcnow()})
                session.commit()
                return True
        except Exception as e:
            logger.error(f"DBService.save_prompt_to_db failed: {e}")
            return False

    def delete_prompt_version(self, agent_name: str, version: str) -> bool:
        """Delete one prompt version. The synthetic 'latest' alias is protected."""
        if self.use_mock:
            return True

        if version == "latest" or database.SessionLocal is None:
            return False

        try:
            with database.SessionLocal() as session:
                result = session.execute(
                    text("DELETE FROM prompts WHERE agent_name = :name AND version = :version"),
                    {"name": agent_name, "version": version},
                )
                session.commit()
                return result.rowcount > 0
        except Exception as e:
            logger.error(f"DBService.delete_prompt_version failed: {e}")
            return False
