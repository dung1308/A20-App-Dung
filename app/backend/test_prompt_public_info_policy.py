import unittest
from unittest.mock import patch

from agents.judge import JudgeAgent
from agents.rag import RAGAgent


class TestPublicInfoPromptPolicy(unittest.TestCase):
    @patch("agents.rag.PromptService")
    @patch("agents.rag.RAGService")
    @patch("agents.rag.get_openai_model")
    def test_rag_appends_public_info_policy_to_loaded_prompt(
        self,
        mock_get_openai_model,
        mock_rag_service,
        mock_prompt_service,
    ):
        mock_prompt_service.return_value.get_prompt.return_value = "legacy rag prompt"

        agent = RAGAgent()

        self.assertIn("legacy rag prompt", agent.system_prompt)
        self.assertIn("Các câu hỏi về học phí", agent.system_prompt)

    @patch("agents.judge.PromptService")
    @patch("agents.judge.LLMClient")
    def test_judge_appends_public_info_policy_to_loaded_prompt(
        self,
        mock_llm_client,
        mock_prompt_service,
    ):
        mock_prompt_service.return_value.get_prompt.return_value = "legacy judge prompt"

        agent = JudgeAgent()

        self.assertIn("legacy judge prompt", agent.system_prompt)
        self.assertIn("Public admissions information is allowed", agent.system_prompt)


if __name__ == "__main__":
    unittest.main()
