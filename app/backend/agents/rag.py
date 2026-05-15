"""
agents/rag.py
-------------
Production-ready RAG Agent for VinUni admission assistant.
Features:
- Contextual query rewriting
- Hybrid retrieval support
- Persona-aware reranking
- Robust normalization
- Safe fallback handling
- Grounded LLM response generation
"""

import re
from typing import List, Dict, Any, Optional

from config import get_openai_model, USE_MOCK, PROMPT_VERSION
from services.rag_service import RAGService
from services.prompt_service import PromptService
from utils.logger import get_logger

logger = get_logger(__name__)

RAG_SYSTEM_PROMPT = """
Bạn là trợ lý tuyển sinh chính thức của VinUni.

Nhiệm vụ:
- Trả lời câu hỏi dựa trên Context được cung cấp
- Không bịa thông tin
- Nếu Context không chứa câu trả lời:
  "Mình chưa có thông tin chính xác về điều này.
   Hãy kiểm tra trực tiếp tại vinuni.edu.vn
   hoặc liên hệ tư vấn viên."

Quy tắc:
- Trả lời bằng tiếng Việt
- Ngắn gọn
- Chính xác
- Dễ hiểu
- Có thể dùng bullet points nếu phù hợp
- Khi Context có Source URL, phải thêm mục "Nguồn:" ở cuối câu trả lời với link đó
- Không nói đã xác minh nếu không có source_type official trong Context
"""


class RAGAgent:

    def __init__(self, prompt_version: str = PROMPT_VERSION):

        self.rag_service = RAGService()
        self.prompt_service = PromptService()
        self.system_prompt = self.prompt_service.get_prompt("rag", prompt_version) or RAG_SYSTEM_PROMPT

        self.model = None if USE_MOCK else get_openai_model()

    # ==========================================================
    # MAIN ENTRY
    # ==========================================================

    def run(
        self,
        message: str,
        history: Optional[List[Dict[str, Any]]] = None,
        user_id: str = None,
        persona_summary: str = None,
    ) -> Dict[str, Any]:

        logger.info(f"RAGAgent: Processing query for {user_id}")

        try:

            # ======================================================
            # RETRIEVE DOCUMENTS
            # ======================================================

            logger.info(f"[USER_QUERY] {message}")

            retrieved_docs = self.rag_service.retrieve(
                message,
                user_id=user_id,
                history=history
            )

            if not retrieved_docs:

                logger.warning("No documents retrieved")

                return {
                    "answer": (
                        "Mình chưa có thông tin chính xác "
                        "về điều này."
                    ),
                    "sources": []
                }

            # ======================================================
            # NORMALIZE DOCS
            # ======================================================

            normalized_docs = self._normalize_docs(
                retrieved_docs
            )

            # ======================================================
            # PERSONA-AWARE RERANK
            # ======================================================

            context_docs = self._filter_docs_by_persona(
                normalized_docs,
                persona_summary
            )

            # ======================================================
            # BUILD CONTEXT
            # ======================================================

            context_text = "\n\n---\n\n".join(
                [self._format_context_doc(doc, idx) for idx, doc in enumerate(context_docs, start=1)]
            )

            if not context_text.strip():

                logger.warning("Empty context after reranking")

                return {
                    "answer": (
                        "Mình chưa có thông tin chính xác "
                        "về điều này."
                    ),
                    "sources": []
                }

            # ======================================================
            # BUILD SOURCES
            # ======================================================

            sources = self._build_sources(context_docs)

            # ======================================================
            # MOCK MODE
            # ======================================================

            if USE_MOCK:

                return {
                    "answer": (
                        f"[RAG MOCK]\n"
                        f"Context:\n{context_text[:300]}"
                    ),
                    "sources": sources
                }

            # ======================================================
            # REAL MODE
            # ======================================================

            if not self.model:

                logger.error("LLM model unavailable")

                return {
                    "answer": (
                        "Mình chưa có thông tin chính xác "
                        "về điều này."
                    ),
                    "sources": sources
                }

            prompt = self._build_rag_prompt(
                message=message,
                context=context_text,
                history=history,
                persona_summary=persona_summary
            )

            logger.info(
                f"[RAG_PROMPT_PREVIEW]\n{prompt[:1000]}"
            )

            response = self.model.generate_content(prompt)

            if not response:

                logger.warning("LLM returned empty response")

                return {
                    "answer": (
                        "Mình chưa có thông tin chính xác "
                        "về điều này."
                    ),
                    "sources": sources
                }

            text = getattr(response, "text", None)

            if not text:

                logger.warning("LLM response.text empty")

                return {
                    "answer": (
                        "Mình chưa có thông tin chính xác "
                        "về điều này."
                    ),
                    "sources": sources
                }

            return {
                "answer": text.strip(),
                "sources": sources
            }

        except Exception as e:

            logger.exception(f"RAGAgent failure: {e}")

            return {
                "answer": (
                    "Mình chưa có thông tin chính xác "
                    "về điều này."
                ),
                "sources": []
            }

    # ==========================================================
    # NORMALIZATION
    # ==========================================================

    def _normalize_docs(
        self,
        docs: List[Any]
    ) -> List[Dict[str, Any]]:

        normalized = []

        for doc in docs:

            if isinstance(doc, str):

                normalized.append({
                    "text": doc
                })

            elif isinstance(doc, dict):

                normalized.append({
                    "text": doc.get("text", ""),
                    "score": doc.get("score"),
                    "metadata": {
                        "url": doc.get("url"),
                        "source": doc.get("source"),
                        "section": doc.get("section"),
                        **doc.get("metadata", {})
                    }
                })

            else:

                logger.warning(
                    f"Unsupported doc type: {type(doc)}"
                )

        return normalized

    # ==========================================================
    # PERSONA RERANK
    # ==========================================================

    def _filter_docs_by_persona(
        self,
        docs: List[Dict[str, Any]],
        persona: Optional[str]
    ) -> List[Dict[str, Any]]:

        if not docs:
            return []

        if not persona:
            return docs[:5]

        domain_keywords = {
            "computer science": [
                "khoa học máy tính",
                "lập trình",
                "phần mềm",
                "ai",
                "machine learning",
                "thuật toán",
            ],
            "business": [
                "kinh doanh",
                "marketing",
                "tài chính",
                "khởi nghiệp",
            ],
            "engineering": [
                "kỹ thuật",
                "robot",
                "cơ khí",
                "automation",
            ],
        }

        persona_lower = persona.lower()

        active_keywords = []

        for domain, keywords in domain_keywords.items():

            if domain in persona_lower:

                active_keywords.extend(keywords)

        if not active_keywords:

            active_keywords = [
                w
                for w in re.findall(r"\w+", persona_lower)
                if len(w) > 4
            ]

        scored_docs = []

        for idx, doc in enumerate(docs):

            text = doc.get("text", "").lower()

            boost = sum(
                2 for k in active_keywords if k in text
            )

            retrieval_score = doc.get("score", 0) or 0

            final_score = retrieval_score + boost

            scored_docs.append(
                (final_score, idx, doc)
            )

        scored_docs.sort(
            key=lambda x: (x[0], -x[1]),
            reverse=True
        )

        return [x[2] for x in scored_docs[:5]]

    def _build_sources(
        self,
        docs: List[Dict[str, Any]]
    ) -> List[Dict[str, str]]:

        sources = []
        seen_urls = set()

        for idx, doc in enumerate(docs, start=1):

            metadata = doc.get("metadata", {}) or {}
            chunk = doc.get("text", "")
            logger.info(f"[SOURCE_METADATA] {chunk} {metadata}")

            url = self._source_url(metadata)
            if url in seen_urls:
                continue

            seen_urls.add(url)
            sources.append({
                "title": self._source_title(metadata, idx),
                "url": url,
                "source_type": self._source_type(metadata, url),
                "snippet": self._snippet(chunk),
            })

        return sources

    def _source_url(self, metadata: Dict[str, Any]) -> str:
        url = (metadata.get("url") or "").strip()
        if url:
            return url

        source_type = (metadata.get("type") or metadata.get("source") or "").lower()
        if source_type == "faq":
            return "https://admissions.vinuni.edu.vn/vi/dai-hoc/cau-hoi-thuong-gap/"
        if source_type == "admission":
            return "https://admissions.vinuni.edu.vn/vi/dai-hoc/"

        return "https://vinuni.edu.vn/"

    def _source_title(self, metadata: Dict[str, Any], idx: int) -> str:
        return (
            metadata.get("title")
            or metadata.get("page_title")
            or metadata.get("source")
            or metadata.get("section")
            or metadata.get("type")
            or f"Tài liệu VinUni {idx}"
        )

    def _source_type(self, metadata: Dict[str, Any], url: str) -> str:
        explicit = metadata.get("source_type")
        if explicit:
            return explicit
        lowered_url = (url or "").lower()
        if "vinuni.edu.vn" in lowered_url:
            return "official"
        return metadata.get("type") or metadata.get("source") or "derived"

    def _snippet(self, text: str, max_chars: int = 220) -> str:
        compact = re.sub(r"\s+", " ", text or "").strip()
        if len(compact) <= max_chars:
            return compact
        return compact[:max_chars].rsplit(" ", 1)[0] + "..."

    def _format_context_doc(self, doc: Dict[str, Any], idx: int) -> str:
        metadata = doc.get("metadata", {}) or {}
        url = self._source_url(metadata)
        title = self._source_title(metadata, idx)
        source_type = self._source_type(metadata, url)
        return (
            f"Source {idx}: {title}\n"
            f"Source type: {source_type}\n"
            f"Source URL: {url}\n"
            f"Content: {doc.get('text', '')}"
        )

    # ==========================================================
    # PROMPT BUILDER
    # ==========================================================

    def _build_rag_prompt(
        self,
        message: str,
        context: str,
        history: Optional[List[Dict[str, Any]]] = None,
        persona_summary: Optional[str] = None,
    ) -> str:

        history_block = ""

        if history:

            history_lines = []

            for msg in history[-6:]:

                role = msg.get("role", "user")
                content = msg.get("content", "")

                if content:

                    history_lines.append(
                        f"{role}: {content}"
                    )

            history_block = "\n".join(history_lines)

        persona_block = ""

        if persona_summary:

            persona_block = f"""
Thông tin người học:
{persona_summary}

Hãy điều chỉnh câu trả lời phù hợp
với hồ sơ và mối quan tâm của người học.
"""

        prompt = f"""
{self.system_prompt}

{persona_block}

Conversation History:
{history_block}

Context:
{context}

Question:
{message}
"""

        return prompt[:30000]
