"""
config.py
---------
Responsibility: Centralized LLM and environment configuration.
HINGE RULE: This is the ONLY file that imports google.generativeai or
initialises any LLM client. All agents call get_gemini_model() from here.
Swapping LLM providers = edit this one file only.
"""

import os
import logging
from typing import List, Optional
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Environment variables
# ---------------------------------------------------------------------------

OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
DATABASE_URL: str = os.getenv("DATABASE_URL", "") # Initialize as empty string, actual value from get_database_url
PROMPT_VERSION: str = os.getenv("PROMPT_VERSION", "v2")
ALLOW_PROMPT_DELETION: bool = os.getenv("ALLOW_PROMPT_DELETION", "false").lower() == "true"
USE_MOCK: bool = os.getenv("USE_MOCK", "True").lower() == "true"
REDIS_URL: Optional[str] = os.getenv("REDIS_URL")
HUMAN_WEBHOOK: str = os.getenv("HUMAN_WEBHOOK", "http://localhost:9000/handoff")
ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
# CORS settings - comma separated string in env
CORS_ORIGINS_STR: str = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000")
CORS_ORIGINS: List[str] = [origin.strip() for origin in CORS_ORIGINS_STR.split(",") if origin.strip()]

LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

RATE_LIMIT_MAX_REQUESTS: int = int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "10"))
RATE_LIMIT_WINDOW_SECONDS: int = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))
DAILY_LLM_BUDGET: float = float(os.getenv("DAILY_LLM_BUDGET", "100"))

# Security settings
SECRET_KEY: str = os.getenv("SECRET_KEY", "your-super-secret-key-change-in-production")
ALGORITHM: str = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

if not OPENAI_API_KEY and not USE_MOCK:
    logger.warning("OPENAI_API_KEY not set — LLM calls will fail at runtime.")

# ---------------------------------------------------------------------------
# Logging setup
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)


# ---------------------------------------------------------------------------
# LLM client factory (hinge rule)
# ---------------------------------------------------------------------------

class MockGenerativeModel:
    """
    A mock object that mimics the interface of google.generativeai.GenerativeModel.
    Used when USE_MOCK=True to avoid external API calls.
    """
    def __init__(self, model_name: str):
        self.model_name = model_name

    def generate_content(self, prompt: str, **kwargs):
        """
        Returns a simulated response based on detected prompt keywords to ensure 
        JSON parsers in agents don't break.
        """
        text = "Đây là phản hồi giả lập từ hệ thống VinUni Major Matcher."
        
        # Detect agent-specific intents for structured JSON responses
        if "top3" in prompt: # AdvisorAgent
            text = '{"top3": [{"major_id": "data_science", "match_reason": "Dựa trên sở thích công nghệ và logic của bạn.", "match_score": 95}], "fallback": false}'
        elif "suggested_majors" in prompt: # CVAgent
            text = '{"suggested_majors": ["data_science", "ba"], "confidence": 0.9, "evidence": ["Hồ sơ có thế mạnh về lập trình."], "gpa_estimate": 3.9, "ielts_estimate": 8.5, "extracted_job_titles": ["Senior Product Manager"], "extracted_skills": ["Product Management"], "referrer_titles": ["Technical Lead", "QC Lead"], "persona_summary": "Ứng viên Senior Product Manager với thành tích học tập xuất sắc (GPA 3.9, IELTS 8.5).", "analysis_metadata": {"length": 1000}}'
        elif "pass" in prompt: # JudgeAgent
            text = '{"pass": true, "reason": "Nội dung an toàn và phù hợp.", "score": 100}'
        elif "personal_info" in prompt and "career_goals" in prompt and "CV TEXT" in prompt: # CVParser
            text = '{"personal_info": {"email": "", "phone": ""}, "summary": "Sinh viên tiềm năng.", "career_goals": "Phát triển trong lĩnh vực AI.", "education": [], "experience": [], "skills": ["Python", "AI"], "projects": [], "certifications": [], "achievements": [], "languages": [], "gpa": null, "ielts": null}'
        elif "intent" in prompt: # LLMRouter.classify_intent
            text = '{"intent": "INFO_QUERY", "confidence": 1.0}'
        elif "rag, crm, advisor, fallback" in prompt: # LLMRouter.route
            text = "rag"

        class MockResponse:
            def __init__(self, t):
                self.text = t
        
        return MockResponse(text)

def get_database_url() -> str:
    """
    Return the current database URL from environment variables.
    Prioritizes DATABASE_URL, but constructs it from PG variables if missing.
    """
    url = os.getenv("DATABASE_URL")
    
    # Fallback to individual variables if DATABASE_URL is not set
    if not url:
        user = os.getenv("PGUSER")
        password = os.getenv("PGPASSWORD")
        host = os.getenv("PGHOST", "localhost")
        port = os.getenv("PGPORT", "5432")
        database = os.getenv("PGDATABASE")

        if all([user, password, database]):
            url = f"postgresql://{user}:{password}@{host}:{port}/{database}"
        else:
            url = "sqlite:///./vinuni_match.db"

    if not USE_MOCK and url and url.startswith("sqlite"):
        logger.warning("Application is NOT in MOCK mode but is falling back to SQLite. Check your .env file.")
        
    return url

def embed_text(text: str):
    if USE_MOCK:
        return None

    client = OpenAI(api_key=OPENAI_API_KEY)
    response = client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=text
    )
    return response.data[0].embedding

def get_openai_model():
    """
    Factory for OpenAI chat client.
    Centralized here to follow hinge-rule architecture.
    """

    if USE_MOCK:
        return MockGenerativeModel(OPENAI_MODEL)

    client = OpenAI(api_key=OPENAI_API_KEY)

    class OpenAIModelWrapper:

        def generate_content(self, prompt: str, **kwargs):

            response = client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=[
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.3,
            )

            class Response:
                def __init__(self, text):
                    self.text = text

            return Response(
                response.choices[0].message.content
            )

    return OpenAIModelWrapper()
