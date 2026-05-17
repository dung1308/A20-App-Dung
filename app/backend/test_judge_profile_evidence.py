import unittest
from unittest.mock import MagicMock

from agents.judge import JudgeAgent


class TestJudgeProfileEvidence(unittest.TestCase):
    def setUp(self):
        self.judge = JudgeAgent()
        self.judge.llm = MagicMock()

    def test_prompt_includes_profile_evidence_context(self):
        prompt = self.judge._build_judge_prompt(
            "Phân tích hồ sơ",
            "Bạn từng là Java Backend Intern tại FPT Software.",
            evidence_context='Stored student profile evidence: {"experience": ["FPT Software - Java Backend Intern"]}',
        )

        self.assertIn("Grounding evidence:", prompt)
        self.assertIn("Java Backend Intern", prompt)
        self.assertIn("Do not require official admissions sources", prompt)

    def test_grounded_profile_claim_can_pass(self):
        self.judge.llm.generate.return_value = (
            '{"pass": true, "reason": "Grounded in stored student profile evidence", "score": 95}'
        )

        result = self.judge.evaluate(
            "Phân tích hồ sơ",
            "Bạn từng là Java Backend Intern tại FPT Software.",
            evidence_context='Stored student profile evidence: {"experience": ["FPT Software - Java Backend Intern"]}',
        )

        self.assertTrue(result["pass"])
        self.assertEqual(result["escalation_level"], "NONE")


if __name__ == "__main__":
    unittest.main()
