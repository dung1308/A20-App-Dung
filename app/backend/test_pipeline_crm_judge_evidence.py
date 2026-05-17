import json
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from orchestrator.pipeline import Pipeline


class TestPipelineCRMJudgeEvidence(unittest.TestCase):
    def test_crm_route_passes_safe_profile_evidence_to_judge(self):
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
        pipeline.router = SimpleNamespace(route=lambda message, history: "crm")
        pipeline.crm = SimpleNamespace(
            get_profile=lambda user_id: {
                "email": "hidden@example.com",
                "summary": "AI Engineer",
                "education": ["FPT University - Artificial Intelligence"],
                "experience": ["FPT Software - Java Backend Intern"],
                "skills": ["Python"],
            }
        )
        pipeline.judge = MagicMock()
        pipeline.judge.evaluate.return_value = {
            "pass": True,
            "reason": "grounded",
            "score": 95,
            "escalation_level": "NONE",
            "escalation_reason": "",
        }
        pipeline.db_service = MagicMock()
        pipeline.db_service.save_message.side_effect = ["session title", None]
        pipeline._dispatch = lambda *args, **kwargs: "Bạn từng là Java Backend Intern tại FPT Software."
        pipeline._audit_log = MagicMock()
        pipeline._record_security_event = MagicMock()

        with patch("orchestrator.pipeline.USE_MOCK", False):
            result = pipeline.run_chat(
                user_id="student@example.com",
                message="Phân tích hồ sơ",
                history=[],
                session_id="session-1",
            )

        self.assertEqual(result["status"], "success")
        _, _, kwargs = pipeline.judge.evaluate.mock_calls[0]
        evidence = kwargs["evidence_context"]
        self.assertIn("Stored student profile evidence:", evidence)
        self.assertIn("Java Backend Intern", evidence)
        self.assertNotIn("hidden@example.com", evidence)

        payload = json.loads(evidence.split(": ", 1)[1])
        self.assertEqual(payload["summary"], "AI Engineer")
        self.assertNotIn("email", payload)


if __name__ == "__main__":
    unittest.main()
