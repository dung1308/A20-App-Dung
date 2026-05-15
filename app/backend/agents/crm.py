"""
agents/crm.py
-------------
Responsibility: CRMAgent retrieves the student's stored profile from the
database and uses it to give personalised, context-aware responses.

Typical triggers (router → "crm"):
  - "Hồ sơ của tôi đang ở đâu?"
  - "Điểm IELTS của tôi có đủ không?"
  - "Mình đã điền thông tin gì rồi?"
"""

import logging
from typing import Optional, Dict, Any

from config import USE_MOCK, PROMPT_VERSION
from services.db_service import DBService
from services.llm_client import LLMClient
from services.prompt_service import PromptService
from utils.logger import get_logger

logger = get_logger(__name__)

CRM_SYSTEM_PROMPT = """
Bạn là trợ lý tư vấn tuyển sinh VinUni với quyền truy cập hồ sơ học sinh.
Trả lời câu hỏi của học sinh dựa trên thông tin hồ sơ được cung cấp.
Không tiết lộ thông tin cá nhân của học sinh cho bên thứ ba.
Trả lời bằng tiếng Việt, thân thiện và cụ thể.
"""


class CRMAgent:
    """
    Fetches student profile from PostgreSQL and answers profile-related questions.
    """

    def __init__(self, prompt_version: str = PROMPT_VERSION):
        self.llm = None if USE_MOCK else LLMClient()
        self.prompt_service = PromptService()
        self.system_prompt = self.prompt_service.get_prompt("crm", prompt_version) or CRM_SYSTEM_PROMPT
        # TODO: Inject DBService dependency for easier testing
        self.db = DBService()

    def run(self, user_id: str, message: str, history: list = None, **kwargs) -> str:
        """
        Retrieve student profile and answer a profile-related question.

        Args:
            user_id: Student identifier — used to fetch profile from DB.
            message: User question about their own profile or fit.

        Returns:
            Personalised answer string in Vietnamese.
        """
        logger.info(f"CRMAgent.run() — user: {user_id}")

        try:
            # 1. Fetch student profile from DB
            profile = self.get_profile(user_id)

            # 2. Handle missing profile
            if not profile:
                return "Mình chưa tìm thấy hồ sơ của bạn trong hệ thống. Bạn có thể cung cấp thêm thông tin hoặc tải lên CV để mình hỗ trợ tốt hơn nhé."

            # 3. Build personalized prompt
            prompt = self._build_crm_prompt(profile, message, history)

            # 4. LLM Generation
            if USE_MOCK:
                return f"[MOCK CRM] Dựa trên hồ sơ của bạn (GPA: {profile.get('gpa', 'N/A')}), bạn có rất nhiều tiềm năng tại VinUni."
            
            if not self.llm:
                return "Hệ thống tư vấn hiện đang bận, vui lòng thử lại sau."

            response = self.llm.generate(prompt)
            if not response or response == "I don't know":
                return "Mình gặp chút vấn đề khi đọc thông tin hồ sơ. Bạn có thể hỏi lại được không?"

            # 5. Return response stripped of whitespace
            return response.strip()

        # 6. Safety wrapper
        except Exception as e:
            logger.error(f"CRMAgent.run failure: {e}")
            return "Rất tiếc, mình gặp lỗi khi kiểm tra hồ sơ của bạn. Vui lòng thử lại sau nhé."

    def get_profile(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch raw student profile dict from the database.

        Args:
            user_id: Student identifier.

        Returns:
            Profile dict or None if not found.
        """
        return self.db.get_student_profile(user_id)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _build_crm_prompt(self, profile: Dict[str, Any], question: str, history: list = None) -> str:
        """
        Format a student profile dict into a readable prompt block.

        Args:
            profile:  Dict with student fields (gpa, ielts, interests, etc.).
            history:  Optional recent conversation turns.
            question: User's question.

        Returns:
            Full prompt string for Gemini.
        """
        # Mask sensitive fields to protect student PII
        sensitive_keys = {"email", "phone", "phone_number", "address", "id_number"}
        masked_profile = {
            k: ("[ĐÃ ẨN ĐỂ BẢO MẬT]" if k.lower() in sensitive_keys else v)
            for k, v in profile.items()
        }

        # Format profile keys for better LLM readability
        formatted = "\n".join(f"- {k.replace('_', ' ').title()}: {v}" for k, v in masked_profile.items() if v)

        hist_ctx = ""
        if history:
            hist_ctx = "\n\nLịch sử trò chuyện gần đây:\n" + "\n".join([
                f"{'Học sinh' if t.get('role')=='user' else 'Trợ lý'}: {t.get('content')}" 
                for t in history[-5:]
            ])

        return f"{self.system_prompt}\n\nHồ sơ học sinh:\n{formatted}{hist_ctx}\n\nCâu hỏi: {question}"
