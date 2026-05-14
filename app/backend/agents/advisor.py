"""
agents/advisor.py
-----------------
Responsibility: AdvisorAgent handles two tasks:
  1. match_majors(answers) → Top 3 VinUni majors from the wizard flow.
  2. run(message, history, user_id)  → Personalized guidance in free-form chat.

Uses LLMClient (OpenAI).
Validates that returned major IDs exist in the 9-item VINUNI_MAJORS list.
Returns fallback=True if model output is ambiguous or cannot be validated.
"""

import json
import logging
from typing import List, Dict, Any

from config import USE_MOCK, PROMPT_VERSION
from services.llm_client import LLMClient
from services.db_service import DBService
from models.cv_schema import CVSignals
from utils.logger import get_logger
from services.prompt_service import PromptService

logger = get_logger(__name__)

# The only valid major IDs. Any AI output outside this set is rejected.
VALID_IDS = {
    "cs", "ee", "me", "bme", "ba",
    "finance", "data_science", "liberal_arts", "architecture",
}

OFFICIAL_MAJOR_LINKS: Dict[str, Dict[str, str]] = {
    "cs": {"department": "College of Engineering and Computer Science", "source_url": "https://admissions.vinuni.edu.vn/vi/dai-hoc/cau-hoi-thuong-gap/tuyen-sinh/"},
    "ee": {"department": "College of Engineering and Computer Science", "source_url": "https://admissions.vinuni.edu.vn/vi/dai-hoc/cau-hoi-thuong-gap/tuyen-sinh/"},
    "me": {"department": "College of Engineering and Computer Science", "source_url": "https://admissions.vinuni.edu.vn/vi/dai-hoc/cau-hoi-thuong-gap/tuyen-sinh/"},
    "bme": {"department": "College of Engineering and Computer Science", "source_url": "https://admissions.vinuni.edu.vn/vi/dai-hoc/cau-hoi-thuong-gap/tuyen-sinh/"},
    "ba": {"department": "College of Business and Management", "source_url": "https://admissions.vinuni.edu.vn/vi/dai-hoc/cau-hoi-thuong-gap/tuyen-sinh/"},
    "finance": {"department": "College of Business and Management", "source_url": "https://admissions.vinuni.edu.vn/vi/dai-hoc/cau-hoi-thuong-gap/tuyen-sinh/"},
    "data_science": {"department": "College of Engineering and Computer Science", "source_url": "https://admissions.vinuni.edu.vn/vi/dai-hoc/cau-hoi-thuong-gap/tuyen-sinh/"},
    "liberal_arts": {"department": "College of Arts and Sciences", "source_url": "https://admissions.vinuni.edu.vn/vi/dai-hoc/cau-hoi-thuong-gap/tuyen-sinh/"},
    "architecture": {"department": "VinUni Admissions", "source_url": "https://admissions.vinuni.edu.vn/vi/dai-hoc/cau-hoi-thuong-gap/tuyen-sinh/"},
}

VINUNI_MAJORS_LOOKUP: Dict[str, Dict] = {
    "cs":           {"name": "Khoa học Máy tính",         "what_students_do": "Sinh viên CS tại VinUni làm việc với AI, xây dựng ứng dụng, nghiên cứu thuật toán và thực tập tại các công ty công nghệ như VNG, KMS, FPT."},
    "ee":           {"name": "Kỹ thuật Điện — Điện tử",   "what_students_do": "Sinh viên EE thiết kế mạch điện, lập trình vi điều khiển, làm dự án IoT và thực tập tại các nhà máy sản xuất điện tử."},
    "me":           {"name": "Kỹ thuật Cơ khí",           "what_students_do": "Sinh viên ME làm với CAD/CAM, in 3D, robotics và thực tập tại các nhà máy hoặc công ty sản xuất."},
    "bme":          {"name": "Kỹ thuật Y sinh",            "what_students_do": "Sinh viên BME thiết kế thiết bị y tế, nghiên cứu cùng bệnh viện, có thể học tiếp y khoa hoặc làm trong ngành dược."},
    "ba":           {"name": "Quản trị Kinh doanh",        "what_students_do": "Sinh viên BA làm case study thực tế, tham gia cuộc thi khởi nghiệp, thực tập tại công ty lớn hoặc startup."},
    "finance":      {"name": "Tài chính",                  "what_students_do": "Sinh viên Finance học mô hình tài chính, phân tích cổ phiếu, thực tập tại ngân hàng, quỹ đầu tư."},
    "data_science": {"name": "Khoa học Dữ liệu",           "what_students_do": "Sinh viên Data Science làm Python, SQL, xây model dự đoán và thực tập tại các công ty dữ liệu, fintech."},
    "liberal_arts": {"name": "Khoa học Xã hội & Nhân văn", "what_students_do": "Sinh viên CAS viết nghiên cứu, tranh luận, phân tích xã hội — hướng đến luật, báo chí, chính sách công."},
    "architecture": {"name": "Kiến trúc",                  "what_students_do": "Sinh viên Kiến trúc làm đồ án thiết kế, học AutoCAD/Revit, thực tập tại công ty kiến trúc."},
}

MATCH_SYSTEM_PROMPT = """
Bạn là AI tư vấn tuyển sinh VinUni. Phân tích câu trả lời học sinh và chọn đúng 3 ngành phù hợp nhất.

Ngành hợp lệ (chỉ dùng các id này):
cs, ee, me, bme, ba, finance, data_science, liberal_arts, architecture

Yêu cầu:
1. Trả về JSON thuần — không markdown, không giải thích ngoài JSON.
2. 'answer' là lời phản hồi tự nhiên, thân thiện dẫn dắt học sinh bằng tiếng Việt.
3. match_reason phải giải thích rõ ràng dựa trên 2 nguồn:
   - 'Dựa trên lựa chọn của bạn': Liên kết với Interests/Strengths/Work-style từ Wizard.
   - 'Dựa trên hồ sơ (CV)': Liên kết với kinh nghiệm/kỹ năng/thành tựu từ CV (nếu có).
3. Nếu dislikes mâu thuẫn với ngành → không chọn ngành đó.
4. Nếu không đủ tín hiệu rõ ràng → trả fallback: true, top3: [].
5. CÔNG THỨC TÍNH ĐIỂM (match_score 0-100):
   - Trọng số mặc định: 0.6 * Wizard Answers + 0.4 * CV Signals.
   - ƯU TIÊN TUYỆT ĐỐI: Nếu có mâu thuẫn giữa Wizard và CV (VD: CV có kinh nghiệm CS nhưng Wizard nói "Ghét lập trình"), phải ưu tiên Wizard và loại bỏ ngành đó khỏi Top 3.
   - ĐIỀU CHỈNH TRỌNG SỐ:
     * Nếu CV trống hoặc chất lượng thấp (Confidence < 0.4): Giảm trọng số CV xuống 0.2 (Wizard 0.8).
     * Nếu CV cực kỳ nhất quán với Wizard: Tăng trọng số CV lên tối đa 0.5 (Wizard 0.5).
   - Kết quả cuối cùng phải được chuẩn hóa (normalized) trong khoảng 0-100.
6. PHÁT HIỆN MÂU THUẪN: Nếu phát hiện mâu thuẫn giữa nền tảng trong CV và sở thích thực tế của học sinh (ngay cả với các ngành không được chọn), hãy đề cập ngắn gọn sự mâu thuẫn này trong phần giải thích của ngành phù hợp nhất để thể hiện sự khách quan.

Format bắt buộc:
{"answer": "...", "top3": [{"major_id": "...", "match_reason": "...", "match_score": 0}], "fallback": false}
"""

ADVISOR_CHAT_SYSTEM_PROMPT = """
Bạn là Cố vấn học tập tại VinUniversity. Hãy hỗ trợ học sinh tìm hiểu về các ngành học và môi trường tại trường.
Hãy trả lời một cách thân thiện, chuyên nghiệp. Nếu học sinh hỏi về việc chọn ngành, hãy gợi ý họ thực hiện 
bài trắc nghiệm Wizard hoặc thảo luận về sở thích/thế mạnh của họ. Trả lời bằng tiếng Việt.
"""


class AdvisorAgent:
    """
    Provides major-matching and personalized guidance using the configured LLM.
    """

    def __init__(self, prompt_version: str = PROMPT_VERSION):
        self.llm = None if USE_MOCK else LLMClient()
        self.db = DBService()
        self.prompt_service = PromptService()
        self._majors_cache = None
        self.system_prompt = self.prompt_service.get_prompt("advisor", prompt_version)
        self.match_prompt = self.prompt_service.get_prompt("advisor_match", prompt_version)

    def _get_majors_lookup(self) -> Dict[str, Dict]:
        """
        Dynamic lookup: returns DB data if available, otherwise defaults to hardcoded lookup.
        """
        if self._majors_cache:
            return self._majors_cache

        # Try to get from Database
        db_majors = self.db.get_majors()
        
        if not db_majors:
            logger.info("Using hardcoded VINUNI_MAJORS_LOOKUP (Mock/Fallback)")
            self._majors_cache = VINUNI_MAJORS_LOOKUP
            return self._majors_cache

        # Transform DB rows into the expected lookup format
        lookup = {}
        for m in db_majors:
            m_id = m["id"]
            lookup[m_id] = {
                "name": m["name"],
                "what_students_do": m.get("description", "Thông tin đang được cập nhật.")
            }
        
        self._majors_cache = lookup
        return lookup

    def _get_valid_ids(self) -> set:
        """Returns set of valid major IDs from the current lookup."""
        return set(self._get_majors_lookup().keys())

    def match_majors(self, answers: Dict[str, Any], cv_signals: CVSignals = None) -> Dict[str, Any]:
        """
        Core wizard flow: analyse 4-step answers and return Top 3 majors.

        Args:
            answers: Dict with keys interests (list), strengths (list),
                     dislikes (list), work_style (str).

        Returns:
            Dict: {top3: [...], fallback: bool}
            Each top3 item has: major_id, major_name, match_reason,
                                match_score, what_students_do.

        Implemented feature flow:
          - Build a model prompt from wizard answers and optional CV signals.
          - Parse a JSON response from the configured LLM client.
          - Validate major IDs against the DB-backed major list or static fallback.
          - Enrich valid matches with display names and "what students do" copy.
          - Sort matches by match_score and fail closed to fallback on errors.
        """
        logger.info("AdvisorAgent.match_majors() called")

        try:
            # Check for missing data - return fallback (handoff signal)
            # Fix: Ensure all keys exist, even if they are empty lists (don't use all() on values)
            required_keys = ["interests", "strengths", "dislikes", "work_style"]
            if not all(k in answers for k in required_keys):
                logger.warning("AdvisorAgent: Missing data in wizard answers, returning fallback/handoff.")
                return {"top3": [], "fallback": True}

            prompt = self._build_match_prompt(answers, cv_signals)

            if not self.llm: return {"top3": [], "fallback": True}
            response_text = self.llm.generate(prompt)

            if not response_text or response_text == "I don't know":
                return {"top3": [], "fallback": True}

            clean_text = response_text.strip()
            # Robust JSON extraction
            start_idx = clean_text.find('{')
            end_idx = clean_text.rfind('}') + 1
            data = json.loads(clean_text[start_idx:end_idx])

            # Dynamic validation and enrichment using DB/Fallback lookup
            enriched = self._validate_and_enrich(data.get("top3", []))

            enriched.sort(key=lambda x: x.get("match_score", 0), reverse=True)

            return {
                "answer": data.get("answer"),
                "top3": enriched,
                "fallback": data.get("fallback", False)
            }
        except (json.JSONDecodeError, ValueError, Exception) as e:
            logger.error(f"AdvisorAgent.match_majors failed: {e}")
            return {"top3": [], "fallback": True}

    def run(self, message: str, history: List[Dict[str, Any]], user_id: str = None, persona_summary: str = None, clarify: bool = False, **kwargs) -> str:
        """
        Free-form advisor chat: personalized guidance on major choice.
        Called by Pipeline when router returns "advisor".

        Args:
            message: User question about which major to choose.
            history: Prior conversation turns for context.
            user_id: Student identifier for personalized context.
            persona_summary: Natural language context about the student (from CV/Wizard).
            clarify: If True, ask for clarification instead of giving advice.

        Returns:
            Guidance text in Vietnamese.
        """
        logger.info(f"AdvisorAgent.run() called (clarify={clarify})")

        try:
            if USE_MOCK:
                if clarify:
                    return ("Để tôi có thể tư vấn tốt hơn cho bạn, bạn có thể chia sẻ thêm về:\n\n"
                            "1. Sở thích cụ thể của bạn (ví dụ: thích lập trình, thiết kế, kinh doanh...)\n"
                            "2. Điểm mạnh và điểm yếu của bạn\n"
                            "3. Bạn muốn làm việc gì trong tương lai?\n\n"
                            "Hoặc bạn có thể làm bài trắc nghiệm ngành học của chúng tôi để có kết quả chính xác hơn!")
                else:
                    return ("Dựa trên sở thích của bạn về công nghệ và giải quyết vấn đề, "
                            "ngành Khoa học Máy tính hoặc Kỹ thuật tại VinUni sẽ là lựa chọn tuyệt vời. "
                            "Bạn có muốn biết thêm về cơ hội thực tập tại các tập đoàn lớn không?")

            hist_ctx = "\n".join([
                f"{'Học sinh' if t.get('role')=='user' else 'Cố vấn'}: {t.get('content')}" 
                for t in history[-5:] 
                if "role" in t and "content" in t
            ])
            
            persona_ctx = f"\n\nBối cảnh người dùng: {persona_summary}" if persona_summary else ""
            
            if clarify:
                # Special prompt for clarification mode
                prompt = f"""Bạn là Cố vấn học tập tại VinUniversity. Người dùng vừa hỏi một câu hỏi nhưng thông tin chưa đủ rõ ràng để đưa ra lời khuyên chính xác.

Hãy hỏi thêm thông tin một cách thân thiện, không phán xét, và gợi ý họ làm bài trắc nghiệm nếu phù hợp.

{persona_ctx}
Lịch sử trò chuyện:
{hist_ctx}

Câu hỏi của học sinh: {message}

Hãy hỏi thêm 2-3 thông tin cụ thể để có thể tư vấn tốt hơn."""
            else:
                # Normal advisor chat
                grounding_rule = (
                    "\n\nGrounding rule: For admissions, tuition, scholarship, and major requirement claims, "
                    "prioritize official VinUni sources from admissions.vinuni.edu.vn or vinuni.edu.vn/admission. "
                    "If official source context is unavailable, label the claim as an AI estimate that should be verified."
                )
                prompt = f"{self.system_prompt}{grounding_rule}{persona_ctx}\n\nLịch sử trò chuyện:\n{hist_ctx}\n\nCâu hỏi: {message}"

            if not self.llm: return "Hệ thống đang bận. Vui lòng thử lại sau."
            response_text = self.llm.generate(prompt)

            if not response_text or response_text == "I don't know":
                if clarify:
                    return ("Xin chào! Để tôi có thể hỗ trợ bạn tốt hơn, bạn có thể cho tôi biết thêm về sở thích và kỹ năng của mình không? Hoặc bạn có muốn làm bài trắc nghiệm chọn ngành của chúng tôi?")
                else:
                    return "Tôi xin lỗi, tôi chưa thể đưa ra lời khuyên lúc này. Bạn có thể hỏi cụ thể hơn không?"

            return response_text.strip()

        except Exception as e:
            logger.error(f"AdvisorAgent.run failure: {e}")
            if clarify:
                return "Xin chào! Để tôi hỗ trợ bạn tốt hơn, hãy cho tôi biết thêm về sở thích của bạn nhé!"
            else:
                return "Tôi xin lỗi, tôi gặp vấn đề khi xử lý câu hỏi này. Bạn có thể hỏi lại về các ngành học tại VinUni không?"

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _build_match_prompt(self, answers: Dict[str, Any], cv_signals: CVSignals = None) -> str:
        """
        Format the wizard answers into a model prompt.

        Args:
            answers: Dict with interests, strengths, dislikes, work_style.

        Returns:
            Full prompt string combining the match system prompt + answers.
        """
        interests = ", ".join(answers.get("interests", []))
        strengths = ", ".join(answers.get("strengths", []))
        dislikes = ", ".join(answers.get("dislikes", []))
        work_style = answers.get("work_style", "")

        user_summary = (
            f"1. Sở thích: {interests}\n2. Thế mạnh: {strengths}\n"
            f"3. Điều không thích: {dislikes}\n4. Phong cách làm việc: {work_style}"
        )

        cv_summary = ""
        if cv_signals:
            # Handle cv_signals as a dictionary returned by CVAgent.analyze()
            persona = cv_signals.get("persona_summary", "Không có tóm tắt.")
            skills = ", ".join(cv_signals.get("extracted_skills", []))
            titles = ", ".join(cv_signals.get("extracted_job_titles", []))
            suggested = ", ".join(cv_signals.get("suggested_majors", []))
            
            cv_summary = (
                f"\n\nTín hiệu từ CV:\n- Tóm tắt: {persona}\n"
                f"- Chức danh: {titles}\n- Kỹ năng: {skills}\n- Gợi ý sơ bộ: {suggested}"
            )

        return f"{self.match_prompt}\n\nDưới đây là thông tin của học sinh:\n{user_summary}{cv_summary}"

    def _validate_and_enrich(self, top3: List[Dict]) -> List[Dict]:
        """
        Validate major IDs and enrich each item with display data.

        Args:
            top3: Raw list of dicts from model response.

        Returns:
            Enriched list, or raises ValueError if any major_id is invalid.
        """
        enriched = []
        lookup = self._get_majors_lookup()
        valid_ids = self._get_valid_ids()

        for item in top3:
            major_id = item.get("major_id")
            if major_id not in valid_ids:
                raise ValueError(f"Invalid major_id returned by AI: {major_id}")
            
            info = lookup[major_id]
            # Mapping keys to match MajorResult pydantic schema
            enriched.append({
                "major_id": major_id,
                "major_name": info["name"],
                "match_reason": item.get("match_reason", ""),
                "match_score": item.get("match_score", 0),
                "what_students_do": info["what_students_do"],
                "department": OFFICIAL_MAJOR_LINKS.get(major_id, {}).get("department"),
                "source_url": OFFICIAL_MAJOR_LINKS.get(major_id, {}).get("source_url"),
                "verified_source": bool(OFFICIAL_MAJOR_LINKS.get(major_id, {}).get("source_url")),
            })
        return enriched
