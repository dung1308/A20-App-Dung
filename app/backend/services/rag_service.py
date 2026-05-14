"""
services/rag_service.py (Chroma version)

Safety & observability layers applied to every request:

  1. TIMEOUT + FAIL FAST   — ThreadPoolExecutor with hard wall-clock deadline.
                             Gemini hangs → TimeoutError → fallback, not API hang.

  2. FALLBACK STRATEGY     — LLM failure/timeout:
                               Tier A: top RAG chunk returned directly
                               Tier B: keyword-matched rule-based response
                               Tier C: generic contact message

  3. CONTEXT SIZE CONTROL  — ContextManager enforces per-chunk and total token
                             budgets before any text reaches the LLM.

  4. COST CONTROL          — CostController gates every call against per-user
                             and global daily USD budgets.

  5. OBSERVABILITY         — ObservabilityMiddleware wraps retrieve_and_answer().
                             Every request emits one structured TRACE log line
                             containing: trace_id, user_id, route, latency_ms,
                             step timings, retrieved_docs, llm_errors,
                             fallback_used, cost_usd, token_stats, final_status.
                             The same trace_id is injected into every logger call
                             made during the request (via logger.py context var).
"""

from __future__ import annotations

import re
import copy
import time
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from typing import List, Dict, Any, Tuple, Optional

import numpy as np
import chromadb
from rank_bm25 import BM25Okapi

from chromadb.config import Settings
from openai import OpenAI
from services.ltr import LearningToRank
from services.llm_client import LLMClient
from services.context_manager import ContextManager
from services.cost_control import CostController, _count_tokens, _estimate_cost
from services.db_service import DBService
from services.features import extract_features
from utils.logger import get_logger
from utils.observability import ObservabilityMiddleware, RequestSpan
from config import USE_MOCK, embed_text, EMBEDDING_MODEL

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Timeouts
# ---------------------------------------------------------------------------

LLM_TIMEOUT_SECONDS  = 8   # hard deadline for answer generation
QUERY_EXPAND_TIMEOUT = 4   # expansion is best-effort — fail faster

# ---------------------------------------------------------------------------
# Rule-based fallback responses
# ---------------------------------------------------------------------------

RULE_BASED_FALLBACKS: Dict[str, str] = {
    "admission":   "For admissions enquiries please visit vinuni.edu.vn/admissions or email admissions@vinuni.edu.vn.",
    "deadline":    "Application deadlines are published at vinuni.edu.vn/admissions/deadlines.",
    "scholarship": "Scholarship information is available at vinuni.edu.vn/financial-aid.",
    "tuition":     "Tuition and fee schedules are listed at vinuni.edu.vn/tuition.",
    "contact":     "You can reach VinUni at info@vinuni.edu.vn or +84-24-3975-xxxx.",
}
GENERIC_FALLBACK = (
    "I'm currently unable to generate a full answer. "
    "Please contact VinUni directly at info@vinuni.edu.vn for assistance."
)

# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

QUERY_EXPANSION_PROMPT = (
    """
    Rewrite the user query into a standalone retrieval query.

    Rules:
    - Preserve original intent
    - Do NOT add new topics
    - Do NOT infer unrelated information
    - Keep it concise
    - Only resolve ambiguous references

    Conversation:
    {history}

    User query:
    {query}

    Standalone retrieval query:
    """
)

ANSWER_GENERATION_PROMPT = (
    "Bạn là trợ lý tư vấn tuyển sinh của VinUni.\n"
    "Trả lời CHỈ dựa trên Context.\n"
    "Nếu Context có Source URL, hãy đính kèm link liên quan ở cuối câu trả lời.\n"
    "Không tự tạo URL.\n\n"
    "Context:\n{context}\n\n"
    "Question: {query}\n\n"
    "Answer:"
)

# ---------------------------------------------------------------------------
# Demo corpus
# ---------------------------------------------------------------------------

DEMO_CORPUS: List[Dict[str, str]] = [
    {"id": "cs",           "text": "Khoa học Máy tính (CS) tại VinUni tập trung vào AI, phát triển phần mềm..."},
    {"id": "ee",           "text": "Kỹ thuật Điện — Điện tử (EE) đào tạo về mạch điện, hệ thống nhúng..."},
    {"id": "me",           "text": "Kỹ thuật Cơ khí (ME) đào tạo thiết kế máy móc..."},
    {"id": "bme",          "text": "Kỹ thuật Y sinh (BME)..."},
    {"id": "ba",           "text": "Quản trị Kinh doanh (BA)..."},
    {"id": "finance",      "text": "Tài chính..."},
    {"id": "data_science", "text": "Khoa học Dữ liệu..."},
    {"id": "liberal_arts", "text": "Khoa học Xã hội..."},
    {"id": "architecture", "text": "Kiến trúc..."},
]

REFERENTIAL_PATTERNS = [
    "trường này",
    "ngành này",
    "ngành đó",
    "ở đây",
    "nó",
    "học phí bao nhiêu",
]


# ---------------------------------------------------------------------------
# RAGService
# ---------------------------------------------------------------------------

class RAGService:
    def embed_text(self, text: str):
        if USE_MOCK:
            return None
        try:
            response = self.llm.client.embeddings.create(
                model="text-embedding-3-small",
                input=text
            )
            return response.data[0].embedding
        except Exception as e:
            logger.error(f"Embedding failed: {e}")
            return None

    def classify_intent(self, query: str) -> str:
        q = query.lower()
        patterns = {
            "tuition": [
                "học phí",
                "tuition",
                "fee",
                "fees",
                "chi phí"
            ],
            "scholarship": [
                "học bổng",
                "scholarship",
                "financial aid"
            ],
            "deadline": [
                "deadline",
                "hạn nộp",
                "khi nào đóng",
                "application date"
            ],
            "admission": [
                "xét tuyển",
                "tuyển sinh",
                "apply",
                "ứng tuyển",
                "admission"
            ],
            "major": [
                "ngành",
                "major",
                "program",
                "chuyên ngành"
            ]
        }
        for intent, keywords in patterns.items():
            if any(k in q for k in keywords):
                return intent
        return "general"

    def _call_llm_with_timeout(
        self,
        prompt:   str,
        timeout:  float = 8,
        span:     Optional['RequestSpan'] = None,
        step_name: str = "llm_call",
    ) -> Optional[str]:
        """
        Submit self.llm.generate(prompt) to a thread pool and wait at most
        `timeout` seconds. Returns None on timeout or any exception.
        If a RequestSpan is provided, the sub-step timing and any errors
        are recorded directly onto the span for the TRACE summary.
        """
        future = self._executor.submit(self.llm.generate, prompt)
        ctx = span.step(step_name) if span else _noop_context()
        with ctx:
            try:
                result = future.result(timeout=timeout)
                return result
            except Exception as exc:
                msg = str(exc)
                logger.warning(f"[LLMError] {step_name}: {msg}")
                if span:
                    span.add_llm_error("api_error", msg)
                future.cancel()
                return None

    def expand_query(
        self,
        query:   str,
        history: List[Dict[str, Any]] = None,
        user_id: str = "system",
        span:    Optional['RequestSpan'] = None,
    ) -> str:
        """
        Rewrite the query for better retrieval coverage.
        Best-effort: any failure silently returns the original query.
        """
        # Format history turns for context
        history_text = ""
        if history:
            if isinstance(history, str):
                history_text = history
            else:
                history_text = "\n".join([
                    f"{'Học sinh' if t.get('role')=='user' else 'Trợ lý'}: {t.get('content')}"
                    for t in history[-3:]
                ])
        prompt = QUERY_EXPANSION_PROMPT.format(query=query, history=history_text or "Không có lịch sử.")
        # Layer 4: cost gate
        if not self.cost.allow(user_id, prompt, estimated_output_tokens=30, call_type="expand_query"):
            logger.info("[CostBlock] expand_query skipped — budget exceeded")
            if span:
                span.add_llm_error("cost_block", "expand_query budget exceeded")
            return query
        # Layer 1: timeout-guarded call
        result = self._call_llm_with_timeout(
            prompt, timeout=QUERY_EXPAND_TIMEOUT,
            span=span, step_name="expand_query",
        )
        if not result or result == "I don't know":
            return query
        # Layer 3: reject oversized expansions
        validated = self.ctx.validate_expanded_query(query, result)
        self.cost.record(user_id, prompt, validated, call_type="expand_query")
        logger.info(f"Query expanded: '{query[:50]}' → '{validated[:50]}'")
        return validated

    def build_retrieval_history(
        self,
        history: List[Dict[str, Any]],
        max_turns: int = 4,
    ) -> str:
        """
        Định dạng lại lịch sử hội thoại cho truy vấn RAG.
        """
        if not history:
            return ""
        recent = history[-max_turns:]
        lines = []
        for msg in recent:
            role = msg.get("role", "")
            content = msg.get("content", "").strip()
            if not content:
                continue
            if role == "user":
                prefix = "User"
            else:
                prefix = "Assistant"
            lines.append(f"{prefix}: {content}")
        return "\n".join(lines)

    def __init__(self):
        logger.info("Initializing RAGService")

        self.corpus    = DEMO_CORPUS
        self.llm       = LLMClient()
        self.ctx       = ContextManager()
        self.cost      = CostController()
        self.obs       = ObservabilityMiddleware()       # ← Layer 5
        self._executor = ThreadPoolExecutor(max_workers=4)

        # MOCK MODE — keyword search only, no Chroma
        if USE_MOCK:
            logger.info("RAGService in MOCK mode (keyword search)")
            return

        # REAL MODE — Chroma
        self.faq_bm25_docs = []
        self.faq_bm25_meta = []
        self.faq_bm25 = None
        self.client = chromadb.PersistentClient(
            path="./chroma_db"
        )
        self.admission_collection = self.client.get_or_create_collection(name="admissions")
        self.faq_collection       = self.client.get_or_create_collection(name="faq")
        self.cv_collections: Dict[str, Any] = {}
        self.reranker       = LearningToRank()

        try:
            self.faq_collection.count()
            self.admission_collection.count()

            if self.faq_collection.count() == 0:
                logger.info("FAQ collection empty -> ingesting")
                self.ingest_faq_folder()

            if self.admission_collection.count() == 0:
                logger.info("Admissions collection empty -> ingesting")
                self._ingest_admissions()
            self.build_bm25_index()

        except Exception as e:
            logger.error(f"Collection init failed: {e}")

    def bm25_search(
        self,
        query: str,
        top_k: int = 10
    ):

        if self.faq_bm25 is None:
            return []

        tokenized_query = re.findall(
            r"\w+",
            query.lower()
        )

        scores = self.faq_bm25.get_scores(tokenized_query)

        ranked_idx = np.argsort(scores)[::-1][:top_k]

        results = []

        for idx in ranked_idx:

            score = scores[idx]

            if score <= 0:
                continue

            results.append({
                "text": self.faq_bm25_docs[idx],
                "metadata": self.faq_bm25_meta[idx],
                "bm25_score": float(score)
            })

        return results

    def build_bm25_index(self):

        logger.info("Building FAQ BM25 index...")

        faq = self.faq_collection.get(
            include=["documents", "metadatas"]
        )

        docs = faq.get("documents", [])
        metas = faq.get("metadatas", [])

        self.faq_bm25_docs = docs
        self.faq_bm25_meta = metas

        tokenized_corpus = [
            re.findall(r"\w+", doc.lower())
            for doc in docs
        ]

        self.faq_bm25 = BM25Okapi(tokenized_corpus)

        logger.info(f"FAQ BM25 built with {len(docs)} docs")

    def retrieve(
        self,
        query: str,
        top_k: int = 3,
        user_id: Optional[str] = None,
        expand: bool = True,
        span: Optional[RequestSpan] = None,
        history: List[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Nâng cấp: Sử dụng Hybrid Search (Vector + BM25) trên toàn bộ collections.
        Loại bỏ hard-routing theo domain để tránh việc miss tài liệu khi phân loại sai.
        """
        retrieval_query = query
        if expand:
            retrieval_history = self.build_retrieval_history(history)
            retrieval_query = self.expand_query(
                query=query,
                user_id=user_id or "system",
                span=span,
                history=retrieval_history,
            )
        logger.info(f"[RETRIEVAL_QUERY] {retrieval_query}")
        
        # Dùng câu query ĐÃ EXPAND để phân loại intent (đề phòng bạn cần dùng log)
        intent = self.classify_intent(query.lower())
        if intent == "general":
            intent = self.classify_intent(retrieval_query.lower())
        logger.info(f"[QUERY_INTENT] {intent}")

        if USE_MOCK:
            return [
                {"text": text, "metadata": {"source": "mock"}}
                for text in self._keyword_search(retrieval_query, top_k)
            ]

        all_candidates = []
        
        # ==========================================
        # 1. VECTOR SEARCH TRÊN CẢ 2 COLLECTIONS
        # ==========================================
        query_embedding = self.embed_text(retrieval_query)
        if query_embedding is not None:
            for coll_name, collection in [("admission", self.admission_collection), ("faq", self.faq_collection)]:
                try:
                    res = collection.query(
                        query_embeddings=[query_embedding],
                        n_results=top_k * 2,
                        include=["documents", "distances", "metadatas"]
                    )
                    
                    # Trích xuất dữ liệu an toàn
                    docs = res.get("documents", [[]])[0] or []
                    dists = res.get("distances", [[]])[0] or []
                    metas = res.get("metadatas", [[]])[0] or [{} for _ in docs]
                    
                    for d, dist, meta in zip(docs, dists, metas):
                        all_candidates.append({
                            "text": d,
                            "distance": dist, # Chroma dùng L2 distance: Càng nhỏ càng tốt
                            "metadata": meta
                        })
                except Exception as e:
                    logger.error(f"Chroma query failed on {coll_name}: {e}")

        # ==========================================
        # 2. BỔ SUNG KEYWORD SEARCH (BM25) TỪ FAQ
        # ==========================================
        bm25_results = self.bm25_search(retrieval_query, top_k=top_k)
        for item in bm25_results:
            # Chuyển đổi BM25 Score thành Distance ảo để có thể mix chung với Vector
            # Điểm BM25 càng cao -> distance ảo càng thấp
            pseudo_distance = max(0.5, 1.5 - (item.get("bm25_score", 0) / 10)) 
            all_candidates.append({
                "text": item.get("text"),
                "distance": pseudo_distance,
                "metadata": item.get("metadata", {})
            })

        # ==========================================
        # 3. SẮP XẾP, LỌC TRÙNG VÀ LẤY TOP_K
        # ==========================================
        # Ưu tiên tài liệu có distance nhỏ nhất
        all_candidates = sorted(all_candidates, key=lambda x: x["distance"])
        
        results = []
        added_texts = set()
        
        for c in all_candidates:
            if c["text"] in added_texts:
                continue
            added_texts.add(c["text"])
            results.append({
                "text": c["text"],
                "metadata": c["metadata"]
            })
            if len(results) >= top_k:
                break

        # ==========================================
        # 4. FALLBACK CUỐI CÙNG
        # ==========================================
        if not results:
            logger.warning("No candidates found -> fallback keyword")
            return [
                {
                    "text": text,
                    "metadata": {"source": "keyword"}
                }
                for text in self._keyword_search(retrieval_query, top_k)
            ]

        return results

    # ------------------------------------------------------------------
    # Layer 5: PRIMARY ENTRY POINT — full observability trace
    # ------------------------------------------------------------------

    def retrieve_and_answer(
        self,
        query:   str,
        top_k:   int = 3,
        history: List[Dict[str, Any]] = None,
        user_id: Optional[str] = None,
    ) -> str:
        """
        Primary entry point for RAGAgent.

        Wraps the full pipeline inside an ObservabilityMiddleware trace:
          retrieve → context-fit → generate (timeout + fallback + cost)
        """
        _user_id = user_id or "anonymous"

        with self.obs.trace(user_id=_user_id, route="retrieve_and_answer") as span:

            # Retrieval (chroma_query + reranker steps timed inside retrieve())
            with span.step("retrieval"):
                docs = self.retrieve(
                    query, top_k=top_k, user_id=_user_id,
                    expand=True, span=span, history=history
                )

            # Record what we retrieved for debugging
            span.set_retrieved_docs(docs)

            if not docs:
                logger.warning("No documents retrieved — going straight to fallback")
                answer = self._fallback_response(query, [], span=span)
                span.set_status("fallback")
                return answer

            # Generation (context fitting + LLM call timed inside generate_answer())
            answer = self.generate_answer(
                query, docs, user_id=_user_id, span=span,
            )

            # Final status: generate_answer sets fallback/blocked on span internally;
            # only set "ok" if no fallback was triggered.
            if span.fallback_used == "none":
                span.set_status("ok")
        logger.info(f"[DEBUG_DOCS] {docs}")
        return answer

    # ------------------------------------------------------------------
    # retrieve_with_details — training use, no observability overhead
    # ------------------------------------------------------------------

    def retrieve_with_details(
        self,
        query:   str,
        top_k:   int = 3,
        user_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Raw retrieval with embeddings — used for LTR training.
        No expansion, no reranking, no LLM, no observability span.
        """
        if USE_MOCK:
            mock_docs = self._keyword_search(query, top_k)
            return [{"text": doc, "distance": 0.1, "metadata": {"source": "mock"}} for doc in mock_docs]

        query_embedding = self.embed_text(query)
        if query_embedding is None:
            mock_docs = self._keyword_search(query, top_k)
            return [{"text": doc, "distance": 0.1, "metadata": {"source": "mock"}} for doc in mock_docs]

        vector_candidates_raw = []

        # Main collections (Admissions + FAQ)
        for collection_name, coll in [
            ("admissions", self.admission_collection),
            ("faq", self.faq_collection)
        ]:
            res = coll.query(
                query_embeddings=[query_embedding],
                n_results=top_k,
                include=["documents", "distances", "metadatas", "embeddings"],
            )
            docs  = res.get("documents", [[]])[0]
            dists = res.get("distances",  [[]])[0]
            metas = res.get("metadatas",  [[]])[0] or [{} for _ in docs]
            embs  = res.get("embeddings", [[]])[0] or [None for _ in docs]
            for doc, dist, meta, emb in zip(docs, dists, metas, embs):
                meta_copy = copy.deepcopy(meta)
                meta_copy.setdefault("source", collection_name)
                vector_candidates_raw.append((doc, dist, meta_copy, emb))

        # CV collection
        if user_id and user_id in self.cv_collections:
            cv_res = self.cv_collections[user_id].query(
                query_embeddings=[query_embedding],
                n_results=top_k,
                include=["documents", "distances", "metadatas", "embeddings"],
            )
            cv_docs  = cv_res.get("documents", [[]])[0]
            cv_dists = cv_res.get("distances",  [[]])[0]
            cv_metas = cv_res.get("metadatas",  [[]])[0] or [{} for _ in cv_docs]
            cv_embs  = cv_res.get("embeddings", [[]])[0] or [None for _ in cv_docs]
            for doc, dist, meta, emb in zip(cv_docs, cv_dists, cv_metas, cv_embs):
                meta.setdefault("source", "cv")
                vector_candidates_raw.append((doc, dist, copy.deepcopy(meta), emb))

        detailed_candidates: List[Dict[str, Any]] = []
        seen_docs: set = set()

        for doc, dist, meta, emb in vector_candidates_raw:
            if doc not in seen_docs and dist < 1.2:
                detailed_candidates.append({
                    "text": doc, "distance": dist, "metadata": meta,
                    "embedding": emb, "query_embedding": query_embedding,
                })
                seen_docs.add(doc)

        for doc in self._keyword_search(query, top_k):
            if doc not in seen_docs:
                detailed_candidates.append({"text": doc, "distance": 0.5, "metadata": {"source": "keyword"}})
                seen_docs.add(doc)

        return detailed_candidates

    # ------------------------------------------------------------------
    # Ingestion
    # ------------------------------------------------------------------
    def sync_all(self, source_type: str = "internal", params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Refresh RAG data for a selected source."""
        params = params or {}
        force = bool(params.get("force_overwrite"))
        report = {
            "source_type": source_type,
            "force_overwrite": force,
            "added": 0,
            "updated": 0,
            "failed_files": [],
            "completed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }

        if USE_MOCK:
            report["message"] = "Mock mode: ingestion skipped"
            return report

        try:
            if source_type == "internal":
                if force:
                    try:
                        self.client.delete_collection("admissions")
                    except Exception:
                        pass
                    try:
                        self.client.delete_collection("faq")
                    except Exception:
                        pass
                    self.admission_collection = self.client.get_or_create_collection(name="admissions")
                    self.faq_collection = self.client.get_or_create_collection(name="faq")

                faq_added, faq_updated = self.ingest_faq_folder()
                admissions_added, admissions_updated = self._ingest_admissions()
                self.build_bm25_index()
                report["added"] = faq_added + admissions_added
                report["updated"] = faq_updated + admissions_updated
                return report

            if source_type == "external":
                url = (params.get("url") or "").strip()
                if not url:
                    raise ValueError("External ingestion requires params.url")
                added = self.ingest_external_url(url, force_overwrite=force)
                report["added"] = added
                return report

            raise ValueError(f"Unsupported source_type: {source_type}")
        except Exception as e:
            logger.error(f"RAG sync_all failed: {e}")
            report["failed_files"].append({"name": source_type, "type": "rag", "error": str(e)})
            return report

    def sync_all_streaming(self, source_type: str = "internal", params: Optional[Dict[str, Any]] = None):
        """Yield coarse-grained progress events for SSE clients."""
        yield {"progress": 10, "message": "Starting RAG ingestion"}
        report = self.sync_all(source_type=source_type, params=params or {})
        yield {"progress": 100, "message": "RAG ingestion completed", "report": report, "done": True}

    def ingest_external_url(self, url: str, force_overwrite: bool = False) -> int:
        import requests
        from html.parser import HTMLParser

        class TextExtractor(HTMLParser):
            def __init__(self):
                super().__init__()
                self.parts = []
                self.skip = False

            def handle_starttag(self, tag, attrs):
                if tag in {"script", "style", "noscript"}:
                    self.skip = True

            def handle_endtag(self, tag):
                if tag in {"script", "style", "noscript"}:
                    self.skip = False

            def handle_data(self, data):
                if not self.skip and data.strip():
                    self.parts.append(data.strip())

        response = requests.get(url, timeout=15, headers={"User-Agent": "VinUniAdmissionAssistant/1.0"})
        response.raise_for_status()
        parser = TextExtractor()
        parser.feed(response.text)
        text = " ".join(parser.parts)
        chunks = chunk_text(text, max_tokens=220)
        ids, documents, embeddings, metadatas = [], [], [], []
        safe_id = re.sub(r"[^a-zA-Z0-9._-]", "_", url)[:120]

        for idx, chunk in enumerate(chunks):
            emb = self.embed_text(chunk)
            if emb is None:
                continue
            ids.append(f"external_{safe_id}_{idx}")
            documents.append(chunk)
            embeddings.append(emb)
            metadatas.append({"type": "external", "source": "web", "url": url})

        if ids:
            self.admission_collection.upsert(
                ids=ids,
                documents=documents,
                embeddings=embeddings,
                metadatas=metadatas,
            )
        return len(ids)

    def ingest_faq_folder(self, folder_path="data/faq"):
        import json
        from pathlib import Path

        folder = Path(folder_path)

        ids, documents, embeddings, metadatas = [], [], [], []

        idx = 0

        for file in folder.glob("*.json"):
            with open(file, "r", encoding="utf-8") as f:
                data = json.load(f)

            for item in data:
                q = item.get("question", "")
                a = item.get("answer", "")
                section = item.get("section", "")
                url = item.get("url", "")

                if not q or not a:
                    continue

                # 👉 rất quan trọng: ưu tiên question
                text = f"""
                Question: {q}
                Answer: {a}
                """.strip()

                emb = self.embed_text(text)
                if emb is None:
                    continue

                ids.append(f"{file.stem}_{item['id']}_{idx}")
                documents.append(text)
                embeddings.append(emb)

                metadatas.append({
                    "type": "faq",
                    "section": section,
                    "url": url
                })

                idx += 1

        if ids:
            self.faq_collection.upsert(
                ids=ids,
                documents=documents,
                embeddings=embeddings,
                metadatas=metadatas
            )
            # To accurately count added/updated, we'd need to query existing IDs before upsert.
            # For simplicity, we'll assume all are "added" if collection was empty,
            # or "updated" if it wasn't. A more precise count would involve fetching all IDs.
            # For now, we'll return a simple count based on the number of items processed.
            return len(ids), 0 # Simplified: assuming all are added for now, or updated if they existed.

        logger.info(f"Ingested {len(ids)} FAQ items")
        return 0, 0

    def _ingest_admissions(self, data_dir="data/admissions"):
        import json
        from pathlib import Path

        data_dir = Path(data_dir)

        ids, documents, embeddings, metadatas = [], [], [], []

        for file in data_dir.glob("*.json"):
            with open(file, "r", encoding="utf-8") as f:
                data = json.load(f)

            for item in data:
                text = item.get("text", "")
                section = item.get("section", "")
                source = item.get("source", "")
                url = item.get("url", "")

                # 👉 enrich text (RẤT QUAN TRỌNG)
                full_text = f"""
                Section: {section}
                Source: {source}
                Content: {text}
                """.strip()

                if not full_text:
                    continue

                chunks = chunk_text(full_text)

                for i, chunk in enumerate(chunks):
                    emb = self.embed_text(chunk)
                    if emb is None:
                        continue

                    ids.append(f"{item['id']}_{i}")
                    documents.append(chunk)
                    embeddings.append(emb)

                    metadatas.append({
                        "type": "admission",
                        "section": section,
                        "source": source,
                        "url": url
                    })

        if ids:
            self.admission_collection.upsert(
                ids=ids,
                documents=documents,
                embeddings=embeddings,
                metadatas=metadatas
            )
            # Similar simplification as above.
            return len(ids), 0 # Simplified: assuming all are added for now, or updated if they existed.

        logger.info(f"Ingested {len(ids)} admission chunks")
        return 0, 0

    def ingest_cv(self, user_id: str, cv_text: str):
        if USE_MOCK:
            return
        logger.info(f"Ingesting CV for user {user_id}")
        collection = self.client.get_or_create_collection(name=f"cv_{user_id}")
        chunks = chunk_text(cv_text)
        ids, documents, embeddings = [], [], []
        stamp = datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
        for i, chunk in enumerate(chunks):
            emb = self.embed_text(chunk)
            if emb is None:
                continue
            ids.append(f"{user_id}_{stamp}_{i}")
            documents.append(chunk)
            embeddings.append(emb)
        if ids:
            collection.add(
                ids=ids, documents=documents, embeddings=embeddings,
                metadatas=[{"source": "cv", "user_id": user_id} for _ in documents],
            )
        self.cv_collections[user_id] = collection

    # ------------------------------------------------------------------
    # Evaluation
    # ------------------------------------------------------------------

    def evaluate_reranker(self, test_cases: List[Dict[str, Any]], k: int = 3) -> float:
        p_at_k_list = []
        for case in test_cases:
            results   = self.retrieve(case["query"], top_k=k, expand=False)
            relevance = [1 if doc == case["expected_doc"] else 0 for doc in results]
            p_at_k_list.append(precision_at_k(relevance, k))
        avg = sum(p_at_k_list) / len(p_at_k_list) if p_at_k_list else 0.0
        logger.info(f"Reranker Evaluation — Average Precision@{k}: {avg:.4f}")
        return avg

    # ------------------------------------------------------------------
    # Cost report passthrough
    # ------------------------------------------------------------------

    def cost_report(self, user_id: Optional[str] = None) -> dict:
        """Return today's cost/usage summary from CostController."""
        return self.cost.usage_report(user_id=user_id)

    # ------------------------------------------------------------------
    # MOCK fallback
    # ------------------------------------------------------------------

    def _keyword_search(self, query: str, top_k: int) -> List[str]:
        query_words = set(re.findall(r"\w+", query.lower()))
        scored = [
            (len(query_words & set(re.findall(r"\w+", doc["text"].lower()))), doc["text"])
            for doc in self.corpus
        ]
        scored.sort(key=lambda x: x[0], reverse=True)
        return [text for score, text in scored[:top_k] if score > 0]


# ---------------------------------------------------------------------------
# Internal helper: no-op context manager for when span is None
# ---------------------------------------------------------------------------

from contextlib import contextmanager

@contextmanager
def _noop_context():
    """Dummy context manager so span.step() calls are always safe."""
    yield


# ---------------------------------------------------------------------------
# Module-level utilities
# ---------------------------------------------------------------------------

def chunk_text(text: str, max_tokens: int = 200) -> List[str]:
    """Chunk text by semantic boundaries (headings, bullets, paragraphs)."""
    sections = re.split(r"\n{2,}|•|- ", text)
    chunks: List[str] = []
    current: List[str] = []
    for sec in sections:
        sec = sec.strip()
        if not sec:
            continue
        words = sec.split()
        if not words:
            continue
        if len(current) + len(words) > max_tokens:
            if current:
                chunks.append(" ".join(current))
            current = words
        else:
            current.extend(words)
    if current:
        chunks.append(" ".join(current))
    return chunks


def compress_context(chunks: List[str], max_chars: int = 1000) -> List[str]:
    """Legacy character-budget trimmer — prefer ContextManager.fit_chunks_to_budget()."""
    result, total = [], 0
    for c in chunks:
        if total + len(c) > max_chars:
            break
        result.append(c)
        total += len(c)
    return result


def generate_training_data(
    queries: List[str],
    retrieved_results: Dict[str, List[Dict[str, Any]]],
) -> Tuple[np.ndarray, np.ndarray]:
    """Bootstrap LTR training data: first doc = relevant (1), rest = not (0)."""
    X, y = [], []
    for query in queries:
        for i, doc_data in enumerate(retrieved_results.get(query, [])):
            features = extract_features(
                query, doc_data["text"],
                doc_data["distance"], doc_data.get("metadata", {}),
            )
            X.append(features)
            y.append(1 if i == 0 else 0)
    return np.array(X), np.array(y)


def precision_at_k(results: List[int], k: int = 3) -> float:
    return sum(results[:k]) / k
