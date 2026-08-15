"""
Unit tests for LaTeX resume code generation and text sanitization.
"""

import unittest
from services.latex_generator import _escape_latex, generate_latex, generate_plain_text


class TestLaTeXGenerator(unittest.TestCase):
    def test_escape_latex(self):
        """Verify special LaTeX characters are properly escaped."""
        raw_text = "50% increase in revenue & $100k savings with C# & C++ #1"
        escaped = _escape_latex(raw_text)
        
        self.assertIn(r"\%", escaped)
        self.assertIn(r"\&", escaped)
        self.assertIn(r"\$", escaped)
        self.assertIn(r"\#", escaped)
        # Ensure unescaped symbols are gone
        self.assertNotIn("%", escaped.replace(r"\%", ""))
        self.assertNotIn("$", escaped.replace(r"\$", ""))

    def test_generate_latex_structure(self):
        """Verify generated LaTeX document has standard preamble and sections."""
        parsed_data = {
            "personal": {
                "name": "Alex Smith",
                "email": "alex@example.com",
                "phone": "+1-555-0199",
                "linkedin": "https://linkedin.com/in/alexsmith",
                "github": "https://github.com/alexsmith",
            },
            "summary": "Full Stack & AI Engineer with deep experience in LLM pipelines.",
            "education": [
                {
                    "degree": "B.S. in Computer Science",
                    "institution": "Tech University",
                    "location": "Boston, MA",
                    "start_date": "2020",
                    "end_date": "2024",
                    "gpa": "3.9/4.0",
                }
            ],
            "experience": [
                {
                    "title": "AI Engineering Intern",
                    "company": "AI Labs",
                    "location": "Remote",
                    "start_date": "Jun 2023",
                    "end_date": "Aug 2023",
                    "responsibilities": [
                        "Built RAG pipeline using ChromaDB and FastAPI",
                        "Reduced retrieval latency by 40%",
                    ],
                }
            ],
            "projects": [
                {
                    "name": "HireReady",
                    "technologies": ["Python", "FastAPI", "React", "OpenAI"],
                    "description": "Multi-modal placement readiness platform.",
                    "link": "https://hireready.app",
                }
            ],
            "skills": {
                "technical": ["Python", "TypeScript", "FastAPI", "PyTorch"],
                "tools": ["Git", "Docker", "ChromaDB", "Firebase"],
            },
        }

        latex = generate_latex(parsed_data)

        self.assertIn(r"\documentclass", latex)
        self.assertIn("Alex Smith", latex)
        self.assertIn("alex@example.com", latex)
        self.assertIn("AI Labs", latex)
        self.assertIn("HireReady", latex)
        self.assertIn(r"\end{document}", latex)

    def test_generate_plain_text(self):
        """Verify plain text generation contains all key information without LaTeX syntax."""
        parsed_data = {
            "personal": {"name": "Alex Smith", "email": "alex@example.com"},
            "summary": "AI Engineer.",
            "skills": {"technical": ["Python", "FastAPI"]},
        }
        plain = generate_plain_text(parsed_data)

        self.assertIn("Alex Smith", plain)
        self.assertIn("alex@example.com", plain)
        self.assertIn("AI Engineer", plain)
        self.assertNotIn(r"\documentclass", plain)


if __name__ == "__main__":
    unittest.main()
