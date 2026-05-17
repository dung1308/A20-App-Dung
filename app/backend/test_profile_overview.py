import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app, create_access_token, _profile_readiness


class TestProfileOverviewAPI(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.user_email = "overview_student@vinuni.edu.vn"
        token = create_access_token({"sub": self.user_email, "role": "user"})
        self.headers = {"Authorization": f"Bearer {token}"}
        self.profile = {
            "user_id": self.user_email,
            "email": self.user_email,
            "summary": "Interested in AI",
            "career_goals": "Build useful products",
            "skills": ["Python"],
            "education": ["VinUni"],
            "experience": ["Internship"],
            "interests": ["AI"],
            "strengths": ["Logic"],
            "dislikes": ["Routine"],
            "work_style": "Independent",
        }
        self.documents = [
            {"id": "doc-1", "filename": "cv.pdf", "is_active": True},
            {"id": "doc-2", "filename": "old-cv.pdf", "is_active": False},
        ]

    @patch("main.pipeline")
    def test_profile_overview_returns_profile_documents_and_readiness(self, mock_pipeline):
        mock_pipeline.db_service.get_student_profile.return_value = self.profile
        mock_pipeline.db_service.list_cv_documents.return_value = self.documents

        response = self.client.get("/api/profile/me/overview", headers=self.headers)

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["profile"], self.profile)
        self.assertEqual(data["documents"], self.documents)
        self.assertEqual(data["readiness"], _profile_readiness(self.profile, self.documents))
        mock_pipeline.db_service.list_cv_documents.assert_called_once_with(self.user_email)

    @patch("main.pipeline")
    def test_profile_overview_uses_authenticated_user(self, mock_pipeline):
        mock_pipeline.db_service.get_student_profile.return_value = self.profile
        mock_pipeline.db_service.list_cv_documents.return_value = self.documents

        response = self.client.get("/api/profile/me/overview", headers=self.headers)

        self.assertEqual(response.status_code, 200)
        calls = mock_pipeline.db_service.get_student_profile.call_args_list
        self.assertGreaterEqual(len(calls), 2)
        self.assertTrue(all(call.args[0] == self.user_email for call in calls))

    @patch("main.pipeline")
    def test_profile_overview_returns_404_when_profile_missing(self, mock_pipeline):
        mock_pipeline.db_service.get_student_profile.return_value = None

        response = self.client.get("/api/profile/me/overview", headers=self.headers)

        self.assertEqual(response.status_code, 404)
        mock_pipeline.db_service.list_cv_documents.assert_not_called()


if __name__ == "__main__":
    unittest.main()
