import unittest

from agents.rag import (
    PUBLIC_INFO_UPDATE_NOTE,
    RAGAgent,
)


class TestRAGPublicInfo(unittest.TestCase):
    def setUp(self):
        self.agent = object.__new__(RAGAgent)
        self.official_sources = [
            {
                "title": "FAQ",
                "url": "https://admissions.vinuni.edu.vn/vi/dai-hoc/cau-hoi-thuong-gap/hoc-phi-hoc-bong-va-ho-tro-tai-chinh/",
                "source_type": "official",
            }
        ]

    def test_numeric_public_info_gets_source_and_update_note(self):
        answer = "Học phí niêm yết cho các ngành là 815.850.000 VND mỗi năm."

        finalized = self.agent._finalize_answer(
            answer,
            self.official_sources,
            "cho tôi hỏi về học phí vinuni",
        )

        self.assertIn("Nguồn:", finalized)
        self.assertIn(self.official_sources[0]["url"], finalized)
        self.assertIn(PUBLIC_INFO_UPDATE_NOTE, finalized)

    def test_existing_grounding_is_not_duplicated(self):
        answer = (
            "Theo nguồn chính thức, học phí niêm yết là 815.850.000 VND mỗi năm.\n\n"
            f"Nguồn: {self.official_sources[0]['url']}\n\n"
            f"{PUBLIC_INFO_UPDATE_NOTE}"
        )

        finalized = self.agent._finalize_answer(
            answer,
            self.official_sources,
            "cho tôi hỏi về học phí vinuni",
        )

        self.assertEqual(finalized, answer)

    def test_non_numeric_answer_is_unchanged(self):
        answer = "VinUni có nhiều chương trình đào tạo bậc đại học."

        finalized = self.agent._finalize_answer(
            answer,
            self.official_sources,
            "vinuni có những chương trình nào",
        )

        self.assertEqual(finalized, answer)


if __name__ == "__main__":
    unittest.main()
