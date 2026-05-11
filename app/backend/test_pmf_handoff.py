import unittest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from main import app, create_access_token

class TestPMFAndHandoffAPI(unittest.TestCase):
    """
    Unit tests for PMF Metrics and Human Handoff Summary endpoints.
    Ensures correct data structure and role-based access control.
    """

    def setUp(self):
        self.client = TestClient(app)
        self.admin_email = "admin_test@vinuni.edu.vn"
        self.staff_email = "staff_test@vinuni.edu.vn"
        self.user_email = "student_test@vinuni.edu.vn"

    def get_headers(self, email, role):
        """Helper to generate JWT headers for testing."""
        token = create_access_token({"sub": email, "role": role})
        return {"Authorization": f"Bearer {token}"}

    @patch("main.MetricService")
    def test_get_metrics_success(self, MockMetricService):
        """Verify that an admin can successfully retrieve PMF metrics."""
        # Mock the service response based on the structure in metric_service.py
        mock_instance = MockMetricService.return_value
        mock_data = {
            "period_hours": 336,
            "total_requests": 150,
            "avg_response_time_ms": 1250.0,
            "ai_resolution_rate": 0.85,
            "human_fallback_rate": 0.10,
            "route_distribution": {"rag": 100, "crm": 30, "advisor": 15, "fallback": 5},
            "generated_at": "2023-10-27T10:00:00Z"
        }
        mock_instance.get_pmf_metrics.return_value = mock_data

        headers = self.get_headers(self.admin_email, "admin")
        response = self.client.get("/api/metrics?hours=336", headers=headers)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), mock_data)

    def test_get_metrics_forbidden_for_user(self):
        """Verify that a regular user is blocked from viewing system metrics."""
        headers = self.get_headers(self.user_email, "user")
        response = self.client.get("/api/metrics", headers=headers)
        self.assertEqual(response.status_code, 403)

    @patch("main.pipeline")
    def test_handoff_summary_success(self, mock_pipeline):
        """Verify that staff (editor/admin) can retrieve a student's context for human handoff."""
        test_student = "candidate@example.com"
        # Mock profile and history used in the manual extraction logic
        mock_pipeline.crm.get_profile.return_value = {"full_name": "Test Student", "gpa": "3.8"}
        mock_pipeline.db_service.get_history.return_value = [{"role": "user", "content": "Hello AI"}]

        # 'staff_required' in main.py includes 'editor'
        headers = self.get_headers(self.staff_email, "editor")
        response = self.client.get(f"/api/handoff-summary?user_id={test_student}", headers=headers)

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["user_id"], test_student)
        self.assertIn("Test Student", data["handoff_summary"])
        self.assertIn("Hello AI", data["handoff_summary"])

    @patch("main.pipeline")
    def test_handoff_summary_not_found(self, mock_pipeline):
        """Verify 404 response when no summary exists for a user id."""
        # Mock missing data to trigger 404
        mock_pipeline.crm.get_profile.return_value = None
        mock_pipeline.db_service.get_history.return_value = []

        headers = self.get_headers(self.staff_email, "editor")
        response = self.client.get("/api/handoff-summary?user_id=unknown_user", headers=headers)

        self.assertEqual(response.status_code, 404)

    @patch("main.MetricService")
    @patch("main.metrics_limiter")
    def test_get_metrics_rate_limit_exceeded(self, mock_limiter, MockMetricService):
        """Verify that the metrics endpoint returns 429 when rate limit is reached."""
        # Mock the rate limiter to reject the request
        mock_limiter.allow.return_value = False

        headers = self.get_headers(self.admin_email, "admin")
        response = self.client.get("/api/metrics", headers=headers)

        # 1. Check status code
        self.assertEqual(response.status_code, 429)
        # 2. Check localized error message
        self.assertIn("Yêu cầu quá thường xuyên", response.json()["detail"])
        # 3. Verify limiter was checked for the specific admin user
        mock_limiter.allow.assert_called_once_with(self.admin_email)
        # 4. Ensure service was NOT called (protection against resource abuse)
        MockMetricService.return_value.get_pmf_metrics.assert_not_called()

    @patch("main.pipeline")
    def test_handoff_summary_with_none_fields(self, mock_pipeline):
        """Verify that handoff summary doesn't crash when profile fields are None (SQL null)."""
        test_student = "none_fields@vinuni.edu.vn"
        # Simulate a profile where keys exist but values are explicitly None (common in SQL)
        mock_pipeline.crm.get_profile.return_value = {
            "full_name": "None User",
            "test_scores": None,
            "preferred_majors": None
        }
        mock_pipeline.db_service.get_history.return_value = []

        headers = self.get_headers(self.staff_email, "editor")
        response = self.client.get(f"/api/handoff-summary?user_id={test_student}", headers=headers)

        self.assertEqual(response.status_code, 200)
        self.assertIn("IELTS: N/A", response.json()["handoff_summary"])
        self.assertIn("Ngành quan tâm: Chưa xác định", response.json()["handoff_summary"])

if __name__ == "__main__":
    unittest.main()