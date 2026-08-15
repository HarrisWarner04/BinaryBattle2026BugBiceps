"""
Integration and route smoke tests for the FastAPI application.
"""

import unittest
from fastapi.testclient import TestClient
from main import app


class TestAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_health_check(self):
        """Verify the root health check endpoint returns 200 and expected metadata."""
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")
        self.assertIn("HireReady", data["service"])
        self.assertEqual(data["version"], "1.0.0")

    def test_invalid_file_upload(self):
        """Verify that uploading non-PDF file returns a 400 bad request."""
        files = {"file": ("test.txt", b"Invalid content", "text/plain")}
        data = {
            "company": "Google",
            "job_title": "Software Engineer",
            "uid": "test_user_123",
        }
        response = self.client.post("/analyse-resume", files=files, data=data)
        self.assertEqual(response.status_code, 400)
        self.assertIn("Only PDF files are accepted", response.json()["detail"])

    def test_empty_user_id_validation(self):
        """Verify validation for missing user IDs."""
        response = self.client.get("/resume-history/   ")
        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
