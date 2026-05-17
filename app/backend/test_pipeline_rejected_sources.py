import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from orchestrator.pipeline import Pipeline


class TestPipelineRejectedSources(unittest.TestCase):
    def test_rejected_response_hides_sources(self):
        pipeline = object.__new__(Pipeline)
        pipeline.input_guard = SimpleNamespace(
            check=lambda text: (True, ""),
            sanitize=lambda text: text,
        )
        pipeline.output_guard = SimpleNamespace(
            process=lambda text: text,
            redact=lambda text: text,
        )
        pipeline.rate_limiter = SimpleNamespace(allow=lambda user_id: True)
        pipeline.router = SimpleNamespace(route=lambda message, history: "rag")
        pipeline.judge = SimpleNamespace(
            evaluate=lambda message, response, evidence_context="": {
                "pass": False,
                "reason": "unsupported numeric claim",
                "score": 20,
                "escalation_level": "NONE",
                "escalation_reason": "",
            }
        )
        pipeline.db_service = MagicMock()
        pipeline.db_service.save_message.side_effect = ["session title", None]
        pipeline._dispatch = lambda *args, **kwargs: {
            "answer": "Học phí là 815.850.000 VND mỗi năm.",
            "sources": [
                {
                    "title": "FAQ",
                    "url": "https://admissions.vinuni.edu.vn/vi/dai-hoc/cau-hoi-thuong-gap/hoc-phi-hoc-bong-va-ho-tro-tai-chinh/",
                    "source_type": "official",
                }
            ],
        }
        pipeline._audit_log = MagicMock()
        pipeline._record_security_event = MagicMock()

        with patch("orchestrator.pipeline.USE_MOCK", False):
            result = pipeline.run_chat(
                user_id="student@example.com",
                message="cho tôi hỏi về học phí vinuni",
                history=[],
                session_id="session-1",
            )

        self.assertEqual(result["status"], "rejected")
        self.assertEqual(result["sources"], [])
        self.assertEqual(result["decision_trace"]["source_count"], 0)
        pipeline.db_service.save_message.assert_called_with(
            "student@example.com",
            "assistant",
            result["response"],
            agent_type="fallback",
            session_id="session-1",
            sources=[],
        )


if __name__ == "__main__":
    unittest.main()
