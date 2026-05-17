from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey, Float, Boolean, JSON
from sqlalchemy.orm import declarative_base
from datetime import datetime

Base = declarative_base()

class User(Base):
    """Represents a student user in the system."""
    __tablename__ = "users"
    user_id = Column(String, primary_key=True)
    email = Column(String, unique=True, nullable=True)
    full_name = Column(String, nullable=True)
    hashed_password = Column(String, nullable=True)
    role = Column(String, default="user")
    permissions = Column(JSON, nullable=True)  # Custom permission overrides
    blacklisted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Major(Base):
    """Stores official VinUni major information."""
    __tablename__ = "majors"
    id = Column(String, primary_key=True)  # e.g., 'cs', 'ee', 'ba'
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)  # Details on what students do/learn

class AdmissionsData(Base):
    """Stores specific admission requirements for majors."""
    __tablename__ = "admissions_data"
    id = Column(Integer, primary_key=True, autoincrement=True)
    major_id = Column(String, ForeignKey("majors.id"), nullable=False)
    requirements = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
    official_url = Column(Text, nullable=True)
    school_or_college = Column(String, nullable=True)
    degree_name = Column(String, nullable=True)
    source_file = Column(String, nullable=True)
    raw_sections = Column(JSON, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class MajorContentSection(Base):
    """Stores ordered, source-backed content sections for a major detail page."""
    __tablename__ = "major_content_sections"
    id = Column(Integer, primary_key=True, autoincrement=True)
    major_id = Column(String, ForeignKey("majors.id"), nullable=False, index=True)
    section_index = Column(Integer, nullable=False)
    title = Column(Text, nullable=True)
    paragraphs = Column(JSON, nullable=True)
    list_items = Column(JSON, nullable=True)
    links = Column(JSON, nullable=True)
    images = Column(JSON, nullable=True)
    tables = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ChatMessage(Base):
    """Stores individual chat messages in the conversation history."""
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, ForeignKey("users.user_id"), nullable=False)
    session_id = Column(String, ForeignKey("chat_sessions.id"), nullable=True)
    role = Column(String)  # "user" or "assistant"
    content = Column(Text)
    agent_type = Column(String)  # "rag", "crm", "advisor", "judge", "router"
    sources = Column(JSON, nullable=True) # Stores RAG sources as a JSON array of objects
    timestamp = Column(DateTime, default=datetime.utcnow)

class ChatSession(Base):
    """Groups related chat messages into sessions."""
    __tablename__ = "chat_sessions"
    id = Column(String, primary_key=True)
    title = Column(String, nullable=True)
    user_id = Column(String, ForeignKey("users.user_id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)

class HandoffMessage(Base):
    """Human-only messages exchanged during a counselor handoff."""
    __tablename__ = "handoff_messages"
    id = Column(Integer, primary_key=True, autoincrement=True)
    trace_id = Column(String, nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.user_id"), nullable=False)
    sender_id = Column(String, ForeignKey("users.user_id"), nullable=True)
    sender_name = Column(String, nullable=True)
    sender_role = Column(String, nullable=True)
    role = Column(String, nullable=False)  # "student" or "staff"
    content = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)

class Student(Base):
    """Stores student CRM profile and recommendation data."""
    __tablename__ = "students"
    user_id = Column(String, ForeignKey("users.user_id"), primary_key=True)
    gpa = Column(Float, nullable=True)
    preferred_majors = Column(JSON, nullable=True)  # List of major IDs
    test_scores = Column(JSON, nullable=True)  # IELTS, TOEFL, etc.
    profile_data = Column(JSON, nullable=True)  # Extended profile info
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class CVDocument(Base):
    """Versioned uploaded CV document and extracted profile data."""
    __tablename__ = "cv_documents"
    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.user_id"), nullable=False, index=True)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=True)
    raw_text = Column(Text, nullable=True)
    structured_data = Column(JSON, nullable=True)
    cv_signals = Column(JSON, nullable=True)
    version = Column(Integer, default=1)
    is_active = Column(Boolean, default=False)
    confirmed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class AuditLog(Base):
    """Compliance trail for all API operations."""
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, ForeignKey("users.user_id"), nullable=True)
    endpoint = Column(String)  # "/api/match", "/api/chat"
    request_data = Column(JSON, nullable=True)  # Request metadata (no sensitive data)
    response_status = Column(String)  # "success", "rejected", "error"
    judge_decision = Column(String, nullable=True)  # Judge agent decision
    trace_id = Column(String, nullable=True, index=True)
    input_data = Column(Text, nullable=True)
    output_data = Column(Text, nullable=True)
    input_text = Column(Text, nullable=True)
    output_text = Column(Text, nullable=True)
    judge_result = Column(JSON, nullable=True)
    escalation_level = Column(String, nullable=True)
    escalation_reason = Column(Text, nullable=True)
    handoff_status = Column(String, default="none", nullable=True)
    route = Column(String, nullable=True)
    response_time_ms = Column(Integer, nullable=True)
    ai_resolved = Column(Boolean, nullable=True)
    fallback = Column(Boolean, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

class SecurityEvent(Base):
    """Logs guardrail violations and suspicious activity."""
    __tablename__ = "security_events"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, ForeignKey("users.user_id"), nullable=True)
    event_type = Column(String)  # "input_violation", "output_violation", "rate_limit", "injection"
    severity = Column(String)  # "low", "medium", "high"
    details = Column(JSON)
    timestamp = Column(DateTime, default=datetime.utcnow)
