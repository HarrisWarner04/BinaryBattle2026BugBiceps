"""
Unit tests for the ATS scoring engine and deterministic keyword matching algorithms.
"""

import unittest
from services.ats_scorer import (
    _simple_stem,
    _tokenize_and_stem,
    _extract_keywords_from_jd_algorithmic,
    _score_format_structure,
    _score_keyword_match,
    _score_skills_coverage,
    _get_grade,
    compute_resume_hash,
)


class TestATSScorer(unittest.TestCase):
    def test_simple_stem(self):
        """Verify that stemmer correctly reduces suffixes deterministically."""
        self.assertEqual(_simple_stem("engineering"), "engineer")
        self.assertEqual(_simple_stem("applications"), "applic")
        self.assertEqual(_simple_stem("developed"), "develop")
        self.assertEqual(_simple_stem("testing"), "test")
        self.assertEqual(_simple_stem("developer"), "develop")
        self.assertEqual(_simple_stem("services"), "service")
        self.assertEqual(_simple_stem("ai"), "ai")

    def test_tokenize_and_stem(self):
        """Verify stop words removal and tokenization."""
        text = "Developed a scalable React and Python web application for the team."
        tokens = _tokenize_and_stem(text)
        
        self.assertIn("react", tokens)
        self.assertIn("python", tokens)
        self.assertTrue("scale" in tokens or "scalable" in tokens)
        self.assertNotIn("the", tokens)
        self.assertNotIn("and", tokens)
        self.assertNotIn("for", tokens)

    def test_extract_keywords_from_jd_algorithmic(self):
        """Verify deterministic algorithmic keyword extraction from job descriptions."""
        jd = "Looking for a Software Engineer with expertise in Python, FastAPI, Docker, and Kubernetes."
        keywords = _extract_keywords_from_jd_algorithmic(jd)
        
        self.assertIn("software", keywords)
        self.assertIn("engineer", keywords)
        self.assertIn("python", keywords)
        self.assertIn("fastapi", keywords)
        self.assertIn("docker", keywords)
        self.assertIn("kubernetes", keywords)
        # Stop words should not be included
        self.assertNotIn("for", keywords)
        self.assertNotIn("with", keywords)
        self.assertNotIn("in", keywords)

    def test_score_format_structure(self):
        """Test format and structure compliance checking."""
        good_parsed_data = {
            "personal": {"name": "Jane Doe", "email": "jane@example.com", "phone": "1234567890"},
            "education": [{"degree": "B.Tech Computer Science", "institution": "Top University"}],
            "experience": [{"title": "Software Engineer", "company": "Tech Corp", "responsibilities": ["Built APIs with 99.9% uptime"]}],
            "projects": [{"name": "AI Platform", "technologies": ["Python", "FastAPI"], "impact": "Served 100k users"}],
            "skills": {"technical": ["Python", "JavaScript", "SQL", "Docker", "FastAPI"], "tools": ["Git", "Linux", "VSCode"]},
        }
        plain_text = "Jane Doe jane@example.com 1234567890 B.Tech Computer Science " * 50
        
        result = _score_format_structure(good_parsed_data, plain_text)
        self.assertGreaterEqual(result["score"], 15)
        self.assertEqual(result["max"], 20)
        self.assertIn("checks", result)

    def test_score_keyword_match(self):
        """Test deterministic keyword match scoring."""
        resume_keywords = ["python", "fastapi", "docker", "react", "postgresql"]
        jd_keywords = ["python", "fastapi", "docker", "kubernetes", "aws"]
        
        result = _score_keyword_match(resume_keywords, jd_keywords)
        self.assertEqual(result["max"], 25)
        self.assertIn("python", result["matched"])
        self.assertIn("fastapi", result["matched"])
        self.assertIn("docker", result["matched"])
        self.assertIn("kubernetes", result["missing"])
        self.assertIn("aws", result["missing"])
        self.assertEqual(result["score"], round((3 / 5) * 25))

    def test_score_skills_coverage(self):
        """Test skills coverage scoring with stemmed match."""
        resume_kws = ["developer", "machine learning", "python", "fastapi"]
        jd_kws = ["developing", "python", "golang"]
        
        result = _score_skills_coverage(resume_kws, jd_kws)
        self.assertEqual(result["max"], 15)
        self.assertIn("developing", result["covered"])  # matched via stem
        self.assertIn("python", result["covered"])
        self.assertIn("golang", result["missing"])

    def test_get_grade(self):
        """Test grade bucket mapping."""
        self.assertEqual(_get_grade(95), "A")
        self.assertEqual(_get_grade(85), "B+")
        self.assertEqual(_get_grade(75), "B")
        self.assertEqual(_get_grade(65), "C")
        self.assertEqual(_get_grade(45), "D")

    def test_compute_resume_hash(self):
        """Verify that identical text produces identical hashes and changes produce different hashes."""
        text1 = "Jane Doe\nSoftware Engineer\nPython, FastAPI"
        text2 = "Jane Doe\nSoftware Engineer\nPython, FastAPI"
        text3 = "Jane Doe\nSenior Software Engineer\nPython, FastAPI"

        hash1 = compute_resume_hash(text1)
        hash2 = compute_resume_hash(text2)
        hash3 = compute_resume_hash(text3)

        self.assertEqual(hash1, hash2)
        self.assertNotEqual(hash1, hash3)
        self.assertEqual(len(hash1), 32)  # MD5 hex length


if __name__ == "__main__":
    unittest.main()
