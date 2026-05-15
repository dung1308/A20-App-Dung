"""
orchestrator/router.py
----------------------
Responsibility: Classify incoming user messages into one of four intents.

MOCK mode:
- Uses deterministic keyword-based routing (no LLM)

REAL mode:
- Uses Gemini to classify intent
"""

import logging
import json
import re
import unicodedata
from typing import List, Dict, Any

from config import USE_MOCK, PROMPT_VERSION
from services.llm_client import LLMClient
from services.prompt_service import PromptService
from utils.logger import get_logger

logger = get_logger(__name__)

VALID_ROUTES = {"rag", "crm", "advisor", "fallback"}

ROUTER_SYSTEM_PROMPT = """
You are an intent classifier for a university admissions chatbot.
Classify the user message into exactly one of: rag, crm, advisor, fallback.

rag      → factual question about programs, requirements, deadlines, campus life
crm      → question about the student's own profile, scores, or personal history
advisor  → request for guidance on which major to choose or career direction
fallback → out-of-scope, harmful, or impossible to answer reliably

Respond with ONLY the label. No explanation.
"""


class LLMRouter:
    def __init__(self):
        # ✅ Do NOT load model in MOCK mode
        self.llm = None if USE_MOCK else LLMClient()
        self.prompt_service = PromptService()
        self.system_prompt = self.prompt_service.get_prompt("router", PROMPT_VERSION) or ROUTER_SYSTEM_PROMPT

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def route(self, message: str, history: List[Dict[str, Any]]) -> str:
        """
        Main routing function.
        """
        logger.info(f"Routing message: '{message[:60]}...'")

        rule_route = self._rule_route(message)
        if rule_route:
            logger.info(f"[RULE] Routed to: {rule_route}")
            return rule_route

        # ==========================================================
        # ✅ MOCK MODE — NO LLM CALLS
        # ==========================================================
        if USE_MOCK:
            route = self._mock_route(message)
            logger.info(f"[MOCK] Routed to: {route}")
            return route

        # ==========================================================
        # REAL MODE — LLM routing
        # ==========================================================
        try:
            prompt = self._build_routing_prompt(message, history)
            response = self.llm.generate(prompt)

            if not response or response == "I don't know":
                logger.warning("Empty LLM response → default to 'rag'")
                return "rag"

            label = response.strip().lower()

            if label in VALID_ROUTES:
                logger.info(f"[LLM] Routed to: {label}")
                return label

            logger.warning(f"Invalid route label '{label}' → default to 'rag'")
            return "rag"

        except Exception as e:
            logger.error(f"Router failure: {e} → fallback to 'rag'")
            return "rag"

    def _rule_route(self, message: str) -> str:
        """
        Force informational program/major lookup questions through RAG.
        Without this, phrases such as "xem chuyen nganh bac si y khoa" can
        be classified as advisor because they contain major-selection words.
        """
        msg = self._normalize_text(message)
        if not msg:
            return ""

        profile_terms = [
            "my profile",
            "my gpa",
            "my ielts",
            "ho so cua toi",
            "diem cua toi",
            "cv cua toi",
        ]
        if any(term in msg for term in profile_terms):
            return ""

        explicit_advisor_terms = [
            "nen chon",
            "phu hop voi toi",
            "chon nganh nao",
            "nganh nao hop",
            "major match",
            "career direction",
            "tu van chon nganh",
            "so sanh giup toi chon",
        ]
        if any(term in msg for term in explicit_advisor_terms):
            return ""

        factual_terms = [
            "admission",
            "admissions",
            "apply",
            "application",
            "deadline",
            "requirement",
            "requirements",
            "eligibility",
            "tuition",
            "fee",
            "fees",
            "scholarship",
            "financial aid",
            "campus",
            "dorm",
            "program",
            "curriculum",
            "major",
            "vinuni",
            "tuyen sinh",
            "ung tuyen",
            "nop ho so",
            "han nop",
            "hoc phi",
            "hoc bong",
            "yeu cau",
            "dieu kien",
            "ky tuyen sinh",
            "nganh",
            "chuong trinh",
            "doi song sinh vien",
        ]
        question_terms = [
            "what",
            "when",
            "where",
            "who",
            "how",
            "which",
            "can you tell",
            "explain",
            "list",
            "give me",
            "la gi",
            "khi nao",
            "o dau",
            "nhu the nao",
            "bao nhieu",
            "co nhung",
            "cho biet",
            "thong tin",
            "chi tiet",
            "gioi thieu",
            "huong dan",
            "xem",
            "tim hieu",
        ]
        if any(term in msg for term in factual_terms) and any(term in msg for term in question_terms):
            return "rag"

        factual_program_terms = [
            "bác sĩ y khoa",
            "bac si y khoa",
            "medical doctor",
            "doctor of medicine",
            "chương trình",
            "chuong trinh",
            "program",
        ]
        info_verbs = [
            "xem",
            "tìm hiểu",
            "tim hieu",
            "hướng dẫn",
            "huong dan",
            "thông tin",
            "thong tin",
            "chi tiết",
            "chi tiet",
            "giới thiệu",
            "gioi thieu",
        ]
        choose_terms = [
            "nên chọn",
            "nen chon",
            "phù hợp",
            "phu hop",
            "match",
            "so sánh",
            "so sanh",
        ]

        if any(term in msg for term in factual_program_terms) and any(term in msg for term in info_verbs):
            if not any(term in msg for term in choose_terms):
                return "rag"

        return ""

    def _normalize_text(self, value: str) -> str:
        text = (value or "").lower()
        text = unicodedata.normalize("NFD", text)
        text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
        text = text.replace("đ", "d")
        text = re.sub(r"\s+", " ", text)
        return text.strip()

    # ------------------------------------------------------------------
    # MOCK ROUTER (deterministic)
    # ------------------------------------------------------------------

    def _mock_route(self, message: str) -> str:
        msg = message.lower()

        # CRM intent
        if any(word in msg for word in [
            "hồ sơ", "điểm", "ielts", "gpa", "thông tin cá nhân"
        ]):
            return "crm"

        # Advisor intent
        if any(word in msg for word in [
            "ngành", "chọn", "tư vấn", "phù hợp", "match", "nên học"
        ]):
            return "advisor"

        # Default → factual
        return "rag"

    # ------------------------------------------------------------------
    # Prompt builder (REAL mode)
    # ------------------------------------------------------------------

    def _build_routing_prompt(self, message: str, history: List[Dict[str, Any]]) -> str:
        """
        Build prompt with last 3 turns of history.
        """
        history = history[-3:] if history else []

        history_text = ""
        for turn in history:
            if "role" in turn and "content" in turn:
                role = "User" if turn["role"] == "user" else "Assistant"
                history_text += f"{role}: {turn['content']}\n"

        return (
            f"{self.system_prompt}\n\n"
            f"Conversation:\n{history_text}\n"
            f"User message: {message}"
        )
