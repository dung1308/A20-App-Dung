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

class ChatMessage(Base):
    """Stores individual chat messages in the conversation history."""
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, ForeignKey("users.user_id"), nullable=False)
    session_id = Column(String, ForeignKey("chat_sessions.id"), nullable=True)
    role = Column(String)  # "user" or "assistant"
    content = Column(Text)
    agent_type = Column(String)  # "rag", "crm", "advisor", "judge", "router"
    timestamp = Column(DateTime, default=datetime.utcnow)

class ChatSession(Base):
    """Groups related chat messages into sessions."""
    __tablename__ = "chat_sessions"
    id = Column(String, primary_key=True)
    title = Column(String, nullable=True)
    user_id = Column(String, ForeignKey("users.user_id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)

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

class AuditLog(Base):
    """Compliance trail for all API operations."""
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, ForeignKey("users.user_id"), nullable=True)
    input_data = Column(Text, nullable=True)
    output_data = Column(Text, nullable=True)
    judge_result = Column(JSON, nullable=True)
    route = Column(String, nullable=True)
    response_time_ms = Column(Integer, nullable=True)
    ai_resolved = Column(Boolean, default=True)
    fallback = Column(Boolean, default=False)
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