"""
orchestrator/pipeline.py
------------------------
Responsibility: Main request flow controller.
Coordinates the full pipeline for both /api/match and /api/chat:

  Request
    → [InputGuard]      block injection / length violations
    → [RateLimiter]     enforce per-user quota
    → [LLMRouter]       classify intent  (chat only)
    → [Agent]           RAG / CRM / Advisor based on route
    → [OutputGuard]     redact PII, sanitize HTML
    → [Judge]           safety evaluation (fail-safe: reject on error)
    → [AuditLog]        record everything to DB
    → Response
"""

import json
import logging
import time
from typing import List, Dict, Any, Optional

from orchestrator.router import LLMRouter
from agents.advisor import AdvisorAgent
from agents.rag import RAGAgent
from agents.crm import CRMAgent
from agents.cv_agent import CVAgent
from services.cv_parser import CVParser
from agents.judge import JudgeAgent
from guards.input_guard import InputGuard
from guards.output_guard import OutputGuard
from guards.rate_limiter import RateLimiter
from utils.logger import get_logger
from services.db_service import DBService
from models.cv_schema import CVSignals
from config import USE_MOCK

logger = get_logger(__name__)

DISCLAIMER = (
    "Kết quả do AI phân tích dựa trên câu trả lời của bạn "
    "— không thay thế buổi tư vấn trực tiếp."
)


ESCALATION_MESSAGE = (
    "Câu trả lời này cần xác nhận từ tư vấn viên tuyển sinh. "
    "Bạn vui lòng liên hệ trực tiếp với bộ phận tư vấn tuyển sinh VinUni "
    "để nhận thông tin chính thức và phù hợp với hồ sơ của bạn."
)


class Pipeline:
    """
    Wires all components together and executes the two main flows:
      - run_match(): wizard submit → Top 3 majors
      - run_chat():  free-form message → routed agent response
    """

    def __init__(self):
        # TODO: Accept injected dependencies for easier unit testing
        self.router = LLMRouter()
        self.advisor = AdvisorAgent()
        self.rag = RAGAgent()
        self.crm = CRMAgent()
        self.judge = JudgeAgent()
        self.input_guard = InputGuard()
        self.output_guard = OutputGuard()
        self.rate_limiter = RateLimiter()
        self.cv_parser = CVParser()
        self.cv_agent = CVAgent()
        self.db_service = DBService()

    # ------------------------------------------------------------------
    # Wizard flow
    # ------------------------------------------------------------------

    def run_match(self, user_id: str, answers: Dict[str, Any], cv_text: str = None, cv_signals: CVSignals = None) -> Dict[str, Any]:
        """
        Full pipeline for POST /api/match (wizard submit).
        Calls AdvisorAgent to produce Top 3 major recommendations.

        Args:
            user_id: Student identifier string.
            answers:  Dict with keys interests, strengths, dislikes, work_style.

        Returns:
            Dict with keys: top3 (list), fallback (bool), disclaimer (str).

        """
        logger.info(f"run_match for user: {user_id}")
        start_time = time.time()

        # 1. Input Guard & Rate Limiter
        self._check_input_or_raise(user_id, str(answers), "match")
        if not self.rate_limiter.allow(user_id):
            self._record_security_event(user_id, "rate_limit", "medium", {"flow": "match"})
            from fastapi import HTTPException
            raise HTTPException(status_code=429, detail="Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.")

        try:
            if USE_MOCK:
                # Simulate realistic processing time for demo mode
                time.sleep(1.0)
                judge_result = {"pass": True, "score": 1.0}
                route = "advisor"
                # Deterministic mock advisor result
                raw_result = {
                    "top3": [
                        {
                            "major_id": "cs",
                            "major_name": "Khoa học Máy tính",
                            "match_reason": "Dựa trên sở thích công nghệ của bạn (Mock).",
                            "match_score": 95,
                            "what_students_do": "Sinh viên CS làm việc với AI và phần mềm."
                        }
                    ],
                    "fallback": False
                }
            else:
                # 2. Process CV if provided
                if not cv_signals:
                    if cv_text:
                        cv_signals = self.cv_agent.analyze(cv_text)
                    else:
                        active_cv = self.db_service.get_active_cv_document(user_id)
                        if active_cv:
                            cv_text = active_cv.get("raw_text")
                            cv_signals = active_cv.get("cv_signals")
                
                route = "advisor"

                # 2. Match majors using AdvisorAgent
                raw_result = self.advisor.match_majors(answers, cv_signals)
                # 3. Safety check with JudgeAgent (Only in real mode)
                judge_result = self.judge.evaluate(str(answers), str(raw_result))

            is_safe = judge_result.get("pass", False)
            escalation_level = judge_result.get("escalation_level", "NONE")
            latency = int((time.time() - start_time) * 1000)

            if escalation_level in ["MEDIUM", "HIGH"]:
                logger.warning(
                    f"Escalation triggered in match for user {user_id}: "
                    f"{escalation_level} - {judge_result.get('escalation_reason', '')}"
                )
                self._audit_log(
                    user_id,
                    answers,
                    ESCALATION_MESSAGE,
                    judge_result,
                    route="fallback",
                    response_time_ms=latency,
                    ai_resolved=False,
                    fallback=True,
                    handoff_status="pending",
                )
                return {
                    "top3": [],
                    "fallback": True,
                    "message": ESCALATION_MESSAGE,
                    "disclaimer": DISCLAIMER,
                    "escalation_level": escalation_level,
                    "fallback_card": self._fallback_card(
                        "human_handoff_required",
                        judge_result.get("escalation_reason") or "The answer needs human admissions review.",
                        "request_human_fallback",
                    ),
                    "recovery_actions": self._recovery_actions("fallback"),
                    "decision_trace": self._decision_trace("match", "fallback", "escalated", judge_result),
                }

            if not is_safe:
                logger.warning(f"Judge rejected match result for {user_id}")
                self._audit_log(user_id, answers, "REJECTED", judge_result, route=route, response_time_ms=latency, ai_resolved=False, fallback=True)
                return {
                    "top3": [],
                    "fallback": True,
                    "disclaimer": DISCLAIMER,
                    "fallback_card": self._fallback_card(
                        "safety_rejected",
                        judge_result.get("reason") or "The recommendation did not pass safety review.",
                        "revise_answers",
                    ),
                    "recovery_actions": self._recovery_actions("fallback"),
                    "decision_trace": self._decision_trace("match", route, "rejected", judge_result),
                }

            # 4. Audit logging
            try:
                self._audit_log(user_id, answers, raw_result, judge_result, route=route, response_time_ms=latency, ai_resolved=True, fallback=False)
            except Exception as audit_err:
                logger.error(f"Audit log failed (non-blocking): {audit_err}")

            return {
                **raw_result,
                "top3": self._enrich_match_explanations(raw_result.get("top3", []), answers, cv_signals),
                "disclaimer": DISCLAIMER,
                "recovery_actions": self._recovery_actions("success"),
                "decision_trace": self._decision_trace(
                    "match",
                    route,
                    "success",
                    judge_result,
                    {"used_cv_context": bool(cv_text or cv_signals), "recommendation_count": len(raw_result.get("top3", []))},
                ),
            }

        except Exception as e:
            logger.error(f"Pipeline match failure for {user_id}: {e}")
            return {
                "top3": [],
                "fallback": True,
                "disclaimer": DISCLAIMER,
                "fallback_card": self._fallback_card("system_error", "The matching service could not complete this request.", "retry"),
                "recovery_actions": self._recovery_actions("error"),
                "decision_trace": self._decision_trace("match", "fallback", "error", {"pass": False, "reason": str(e)}),
            }

    def parse_cv(self, text: str) -> Optional[CVSignals]:
        """
        Extract structured signals from CV text.
        """
        try:
            return self.cv_agent.analyze(text)
        except Exception as e:
            logger.error(f"Pipeline parse_cv failure: {e}")
            return None

    def _check_input_or_raise(self, user_id: str, text: str, flow: str) -> None:
        """
        Enforce InputGuard verdicts before routing, retrieval, or LLM calls.
        """
        is_safe, reason = self.input_guard.check(text)
        if is_safe:
            return

        severity = "high" if reason == "injection_detected" else "medium"
        self._record_security_event(
            user_id,
            reason,
            severity,
            {
                "flow": flow,
                "input_preview": self.output_guard.redact(str(text))[:500],
            },
        )
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"Input blocked by guardrail: {reason}")

    # ------------------------------------------------------------------
    # Chat flow
    # ------------------------------------------------------------------

    def run_chat(
        self,
        user_id: str,
        message: str,
        history: List[Dict[str, str]],
        session_id: Optional[str] = None,
        persona_summary: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Full pipeline for POST /api/chat (free-form follow-up).
        Routes message to correct agent based on LLMRouter classification.

        Args:
            user_id: Student identifier string.
            message:  Latest user message.
            history:  Prior conversation turns.

        Returns:
            Dict with keys: response (str), agent (str).

        """
        logger.info(f"run_chat for user: {user_id}, session: {session_id}")
        start_time = time.time()
        
        # 1. Input Guard & Rate Limiter
        self._check_input_or_raise(user_id, message, "chat")
        message = self.input_guard.sanitize(message)
        if not self.rate_limiter.allow(user_id):
            self._record_security_event(user_id, "rate_limit", "medium", {"flow": "chat"})
            from fastapi import HTTPException
            raise HTTPException(status_code=429, detail="Tần suất gửi tin nhắn quá nhanh. Vui lòng đợi giây lát.")

        # 0. Save user message to database (This triggers auto-rename in db_service)
        new_title = self.db_service.save_message(user_id, "user", message, session_id=session_id, sources=[])

        # Initialize default judge result to prevent unbound errors
        judge_result = {"pass": True, "score": 1.0}
        
        try:
            if USE_MOCK:
                logger.info("Pipeline operating in MOCK mode")
                # Simulate realistic processing time for demo mode
                time.sleep(0.7)
                # 1. Mock routing (no LLM)
                route = self._mock_route(message)
            else:
                logger.info("Pipeline operating in REAL mode")
                # 1. Real LLM routing using safe history
                route = self.router.route(message, history)
            
            context_summary = self._format_context_summary(context)
            if context_summary:
                persona_summary = f"{persona_summary or ''}\n{context_summary}".strip()

            # 2. Dispatch (Real or Mock) with safe history
            raw_response = self._dispatch(
                route,
                user_id,
                message,
                history,
                persona_summary=persona_summary
            )

            sources = []

            if isinstance(raw_response, dict):
                response_text = raw_response.get("answer", "")
                sources = raw_response.get("sources", [])
            else:
                response_text = raw_response

            safe_response = self.output_guard.process(response_text)
            
            # 3. Safety check and escalation detection
            judge_evidence = self._build_judge_evidence(route, user_id)
            judge_result = self.judge.evaluate(message, safe_response, evidence_context=judge_evidence)
            
            judge_pass = judge_result.get("pass", False)
            escalation_level = judge_result.get("escalation_level", "NONE")
            latency = int((time.time() - start_time) * 1000)
            handoff_status = "none"
            
            # Handle clarify case - re-route to advisor for clarification
            if escalation_level in ["MEDIUM", "HIGH"]:
                logger.warning(
                    f"Escalation triggered for user {user_id}: "
                    f"{escalation_level} - {judge_result.get('escalation_reason', '')}"
                )
                safe_response = ESCALATION_MESSAGE
                route = "fallback"
                status = "escalated"
                ai_resolved = False
                fallback = True
                handoff_status = "pending"
                sources = []
            elif judge_pass == "clarify":
                logger.info(f"Judge requested clarification for user {user_id}. Re-routing to advisor.")
                clarify_response = self.advisor.run(
                    message, 
                    history, 
                    user_id=user_id, 
                    persona_summary=persona_summary,
                    clarify=True  # Special flag for clarification mode
                )
                safe_response = self.output_guard.process(clarify_response)
                route = "advisor"
                status = "clarified"
                ai_resolved = True
                fallback = False
            elif not judge_pass:
                logger.warning(f"Judge REJECTED response for user {user_id}. Reason: {judge_result.get('reason', 'Safety violation or API error')}")
                safe_response = "Tôi xin lỗi, nhưng tôi không thể trả lời câu hỏi này vì lý do an toàn. Bạn có câu hỏi nào khác về VinUni không?"
                route = "fallback"
                status = "rejected"
                ai_resolved = False
                fallback = True
                handoff_status = "pending"
                sources = []
            elif route == "fallback":
                status = "fallback"
                ai_resolved = False
                fallback = True
                handoff_status = "pending"
            else:
                status = "success"
                ai_resolved = True
                fallback = False

            # Save only the final user-visible assistant response. This avoids
            # storing a response that JudgeAgent later rejects.
            self.db_service.save_message(
                user_id,
                "assistant",
                safe_response,
                agent_type=route,
                session_id=session_id,
                sources=sources
            )
            
            response_data = {
                "response": safe_response,
                "intent": route,
                "status": status,
                "major": None,
                "sources": self._label_sources(sources),
                "sessionId": session_id,
                "sessionTitle": new_title,
                "escalation_level": escalation_level,
                "fallback_card": self._fallback_card(
                    "human_handoff_required" if fallback else "",
                    judge_result.get("escalation_reason") or judge_result.get("reason") or "",
                    "request_human_fallback" if fallback else "",
                ) if fallback else None,
                "recovery_actions": self._recovery_actions(status),
                "decision_trace": self._decision_trace(
                    "chat",
                    route,
                    status,
                    judge_result,
                    {"context_received": bool(context), "source_count": len(sources)},
                ),
                "suggested_resources": self._suggested_resources(route, message, fallback),
            }

            # If route is advisor, extract structured data for the frontend cards
            if route == "advisor":
                try:
                    json_text = safe_response
                    if "```json" in json_text:
                        json_text = json_text.split("```json")[1].split("```")[0].strip()
                    elif "```" in json_text:
                        json_text = json_text.split("```")[1].split("```")[0].strip()
                    
                    parsed = json.loads(json_text)
                    if "top3" in parsed:
                        response_data["response"] = parsed.get("answer", "Dựa trên trao đổi của chúng ta, đây là 3 ngành học tiềm năng nhất dành cho bạn:")
                        response_data["major"] = self._enrich_match_explanations(
                            self.advisor._validate_and_enrich(parsed["top3"]),
                            {},
                            None,
                        )
                except Exception as e:
                    logger.warning(f"Structured advisor parsing failed: {e}")

            self._audit_log(
                user_id,
                message,
                safe_response,
                judge_result,
                route=route,
                response_time_ms=latency,
                ai_resolved=ai_resolved,
                fallback=fallback,
                handoff_status=handoff_status,
            )
            return response_data

        except Exception as e:
            logger.error(f"Pipeline failure for {user_id}: {str(e)}")
            return {
                "response": "Hệ thống đang gặp sự cố. Vui lòng thử lại sau.",
                "intent": "fallback",
                "status": "error",
                "fallback_card": self._fallback_card("system_error", "The chat service could not complete this request.", "retry"),
                "recovery_actions": self._recovery_actions("error"),
                "decision_trace": self._decision_trace("chat", "fallback", "error", {"pass": False, "reason": str(e)}),
                "suggested_resources": self._suggested_resources("fallback", message, True)
            }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _dispatch(
        self,
        route: str,
        user_id: str,
        message: str,
        history: List[Dict[str, Any]],
        persona_summary: Optional[str] = None,
    ) -> str:
        """
        Call the correct agent based on router output.

        Args:
            route:    One of "rag", "crm", "advisor", "fallback".
            user_id:  Student identifier.
            message:  User message.
            history:  Conversation history.

        Returns:
            Raw response string from the selected agent.

        Implemented dispatch branches:
          - "crm" uses profile-aware CRM responses.
          - "advisor" uses personalized major guidance.
          - "rag" uses retrieval-grounded admissions answers.
          - "fallback" returns a human-handoff prompt.
          - Unknown routes default to RAG with a warning.
        """
        if route == "fallback":
            return "Bạn muốn được kết nối với tư vấn viên của chúng tôi không?"
        
        if route == "advisor":
            return self.advisor.run(message, history, user_id=user_id, persona_summary=persona_summary)
        elif route == "crm":
            return self.crm.run(user_id, message, history=history)
        elif route == "rag":
            return self.rag.run(message, history=history, user_id=user_id, persona_summary=persona_summary)
        
        # Default: rag
        logger.warning(f"Unknown route '{route}'. Falling back to RAG.")
        return self.rag.run(message, history=history, user_id=user_id, persona_summary=persona_summary)

    def _mock_route(self, message: str) -> str:
        """Deterministic keyword-based router for Mock mode."""
        msg = message.lower()
        if any(word in msg for word in ["hồ sơ", "điểm", "ielts", "gpa", "thông tin cá nhân"]):
            return "crm"
        if any(word in msg for word in ["ngành", "chọn", "tư vấn", "phù hợp", "match"]):
            return "advisor"
        return "rag"

    def _fallback_card(self, reason_code: str, reason: str, next_action: str) -> Dict[str, Any]:
        if not reason_code:
            return {}
        if next_action == "request_human_fallback":
            cta = {"label": "Request human advisor", "action": "human_fallback"}
        else:
            cta = {"label": "Try again", "action": next_action or "retry"}
        return {
            "reason_code": reason_code,
            "reason": reason or "The system could not answer with enough confidence.",
            "next_action": next_action or "retry",
            "cta": cta,
        }

    def _recovery_actions(self, status: str) -> List[Dict[str, str]]:
        actions = [
            {"id": "retry", "label": "Retry"},
            {"id": "edit_profile", "label": "Edit Profile"},
            {"id": "open_wizard", "label": "Update Wizard answers"},
            {"id": "open_resources", "label": "Open Resources"},
        ]
        if status in {"fallback", "error", "rejected", "escalated"}:
            actions.append({"id": "request_human_fallback", "label": "Request human advisor"})
        return actions

    def _decision_trace(
        self,
        flow: str,
        route: str,
        status: str,
        judge_result: Dict[str, Any],
        extra: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        trace = {
            "flow": flow,
            "route": route,
            "status": status,
            "judge_pass": judge_result.get("pass"),
            "escalation_level": judge_result.get("escalation_level", "NONE"),
            "escalation_reason": judge_result.get("escalation_reason") or judge_result.get("reason"),
        }
        if extra:
            trace.update(extra)
        return trace

    def _label_sources(self, sources: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        labeled = []
        for source in sources or []:
            url = (source.get("url") or "").lower()
            if "vinuni.edu.vn" in url or "admissions.vinuni.edu.vn" in url:
                source_type = "official"
            elif source.get("source_type"):
                source_type = source.get("source_type")
            else:
                source_type = "derived"
            labeled.append({**source, "source_type": source_type})
        return labeled

    def _format_context_summary(self, context: Optional[Dict[str, Any]]) -> str:
        if not context:
            return ""
        safe_context = {
            key: value for key, value in context.items()
            if key in {"surface", "major_id", "major_name", "report_id", "question", "selected_signals"}
        }
        if not safe_context:
            return ""
        return "Report/UI context: " + json.dumps(safe_context, ensure_ascii=False)

    def _suggested_resources(self, route: str, message: str, fallback: bool) -> List[Dict[str, str]]:
        message_lower = (message or "").lower()
        resources = []
        if route == "advisor" or any(word in message_lower for word in ["major", "ngành", "nganh", "match"]):
            resources.append({"id": "wizard", "title": "Major matching wizard", "surface": "wizard"})
        if route == "rag" or any(word in message_lower for word in ["admission", "tuyển sinh", "deadline", "hoc phi"]):
            resources.append({"id": "admissions", "title": "Admissions resources", "surface": "resources"})
        if fallback:
            resources.append({"id": "human-fallback", "title": "Human advisor support", "surface": "staff_handoff"})
        return resources[:3]

    def _build_judge_evidence(self, route: str, user_id: str) -> str:
        """
        Supply bounded, non-PII grounding context to JudgeAgent so profile-aware
        answers are evaluated against the data they were allowed to use.
        """
        if route != "crm":
            return ""

        profile = self.crm.get_profile(user_id) or {}
        safe_keys = (
            "summary",
            "career_goals",
            "education",
            "experience",
            "projects",
            "skills",
            "certifications",
            "gpa",
            "test_scores",
            "preferred_majors",
        )
        safe_profile = {
            key: profile.get(key)
            for key in safe_keys
            if profile.get(key) not in (None, "", [], {})
        }
        if not safe_profile:
            return ""

        return "Stored student profile evidence: " + json.dumps(
            safe_profile,
            ensure_ascii=False,
            default=str,
        )

    def _enrich_match_explanations(
        self,
        matches: List[Dict[str, Any]],
        answers: Dict[str, Any],
        cv_signals: Optional[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        interests = answers.get("interests") or []
        strengths = answers.get("strengths") or []
        work_style = answers.get("work_style")
        dislikes = answers.get("dislikes") or []
        cv_signals = cv_signals or {}

        enriched = []
        for item in matches or []:
            matched_signals = []
            for value in interests[:2]:
                matched_signals.append({"source": "wizard", "label": "Interest", "value": value})
            for value in strengths[:2]:
                matched_signals.append({"source": "wizard", "label": "Strength", "value": value})
            if work_style:
                matched_signals.append({"source": "wizard", "label": "Work style", "value": work_style})
            for value in (cv_signals.get("extracted_skills") or [])[:2]:
                matched_signals.append({"source": "cv", "label": "CV skill", "value": value})
            for value in (cv_signals.get("suggested_majors") or [])[:1]:
                matched_signals.append({"source": "cv", "label": "CV suggested major", "value": value})

            tradeoffs = []
            if dislikes:
                tradeoffs.append({
                    "source": "wizard",
                    "label": "Preference tradeoff",
                    "value": f"Check whether this major avoids: {', '.join(map(str, dislikes[:2]))}",
                })
            if not cv_signals:
                tradeoffs.append({
                    "source": "profile",
                    "label": "Missing CV context",
                    "value": "Upload or confirm a CV to improve the evidence behind this recommendation.",
                })
            if float(item.get("match_score") or 0) < 70:
                tradeoffs.append({
                    "source": "advisor",
                    "label": "Moderate confidence",
                    "value": "Review the explanation and ask a follow-up before treating this as a strong fit.",
                })

            evidence = []
            if item.get("source_url"):
                evidence.append({
                    "title": item.get("department") or item.get("major_name") or "VinUni admissions",
                    "url": item.get("source_url"),
                    "source_type": "official",
                })
            evidence.append({
                "title": "Student profile and wizard answers",
                "url": None,
                "source_type": "profile-based",
            })

            enriched.append({
                **item,
                "match_breakdown": {
                    "matched_signals": matched_signals[:5],
                    "tradeoffs": tradeoffs[:2],
                    "evidence": evidence,
                },
            })
        return enriched

    def _audit_log(
        self,
        user_id: str,
        input_data: Any,
        output_data: Any,
        judge_result: Dict,
        route: str = None,
        response_time_ms: int = None,
        ai_resolved: bool = True,
        fallback: bool = False,
        handoff_status: str = "none",
    ) -> None:
        """
        Persist an audit record to the database.
        """
        redacted_input = self.output_guard.redact(str(input_data))
        
        logger.info(f"AUDIT [{user_id}] route={route} pass={judge_result.get('pass')} latency={response_time_ms}ms")
        self.db_service.save_audit_log(
            user_id=user_id, 
            input_text=redacted_input, 
            output_text=str(output_data), 
            judge_result=judge_result,
            route=route,
            response_time_ms=response_time_ms,
            ai_resolved=ai_resolved,
            fallback=fallback,
            handoff_status=handoff_status,
        )

    def _record_security_event(
        self,
        user_id: Optional[str],
        event_type: str,
        severity: str,
        details: Dict[str, Any],
    ) -> None:
        """
        Best-effort security-event logging. Never raises into the user flow.
        """
        try:
            self.db_service.save_security_event(
                user_id=user_id,
                event_type=event_type,
                severity=severity,
                details=details,
            )
        except Exception as e:
            logger.error(f"Security event logging failed: {e}")
