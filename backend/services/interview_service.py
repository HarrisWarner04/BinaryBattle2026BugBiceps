"""
AI Interview service using OpenAI GPT-4o-mini.
Enhanced: fetches all 3 data sources (resume, GitHub context, skill verification),
generates deeply personalized questions with type-specific distribution,
context-aware evaluation with follow-up triggers, and detailed session reports.
"""

import os
import json
from typing import Optional
from dotenv import load_dotenv
from fastapi import HTTPException

load_dotenv()

from services.openai_client import chat_completion_json, chat_completion


def generate_interview_questions(
    parsed_resume: dict,
    company: str,
    job_title: str,
    domain: str = "Software Engineering",
    difficulty: str = "intermediate",
    github_context: Optional[list[str]] = None,
    skill_verification: Optional[list[dict]] = None,
) -> list[dict]:
    """
    Generate 8 interview questions deeply personalized using resume + GitHub + skills data.
    Distribution: 2 project-specific, 1 GitHub weakness, 2 company technical, 2 STAR, 1 career.
    """
    # Extract project info from resume
    projects = parsed_resume.get("projects", [])
    project1 = projects[0] if len(projects) > 0 else {"name": "a personal project", "technologies": ["Python"]}
    project2 = projects[1] if len(projects) > 1 else {"name": "a team project", "technologies": ["JavaScript"]}

    p1_name = project1.get("name", "Project 1")
    p1_tech = ", ".join(project1.get("technologies", project1.get("tech_stack", ["Python"])))
    p1_desc = project1.get("description", "")
    p2_name = project2.get("name", "Project 2")
    p2_tech = ", ".join(project2.get("technologies", project2.get("tech_stack", ["JavaScript"])))
    p2_desc = project2.get("description", "")

    skills = parsed_resume.get("skills", {})
    tech_skills = skills.get("technical", [])[:8]

    # Build GitHub context section
    github_section = ""
    if github_context:
        github_section = f"\nGitHub Insights (from their actual code review):\n" + "\n".join(f"- {point}" for point in github_context[:6])

    # Build skill verification section
    skill_section = ""
    if skill_verification:
        verified = [s["skill"] for s in skill_verification if s.get("verified_in_code")]
        unverified = [s["skill"] for s in skill_verification if s.get("claimed_on_resume") and not s.get("verified_in_code")]
        if verified:
            skill_section += f"\nVerified skills (found in code): {', '.join(verified[:8])}"
        if unverified:
            skill_section += f"\nUnverified claims (on resume but not in code): {', '.join(unverified[:5])}"

    resume_json_str = json.dumps({
        "summary": parsed_resume.get("summary", ""),
        "skills": tech_skills,
        "projects": [{"name": p.get("name"), "tech": p.get("technologies", []), "desc": p.get("description", "")} for p in projects[:4]],
        "experience": [{"title": e.get("title"), "company": e.get("company")} for e in parsed_resume.get("experience", [])[:3]],
    })

    prompt = f"""You are a {difficulty}-level interviewer at {company} hiring for {job_title}.
You have access to the candidate's full background. Generate exactly 8 interview questions following this exact distribution:

2 questions directly referencing specific projects from their resume (use the actual project names and tech stack):
  - Project 1: '{p1_name}' built with {p1_tech}. {p1_desc}
  - Project 2: '{p2_name}' built with {p2_tech}. {p2_desc}

1 question about a specific weakness found in their GitHub code review or an unverified skill claim
{github_section}
{skill_section}

2 technical questions specific to {company}'s known interview patterns for {job_title}

2 behavioural STAR questions relevant to {company}'s culture and values

1 question about their career goals and why {company} specifically

For each question include: the exact question text, why you're asking this (internal reasoning based on their profile), what a strong answer should cover, and a follow-up question to use if their first answer is shallow.

Return ONLY valid JSON:
{{
  "questions": [
    {{
      "id": 1,
      "text": "question text",
      "type": "project/technical/behavioural/culture/github",
      "internal_reasoning": "why this question based on their profile",
      "ideal_answer_points": ["point 1", "point 2", "point 3"],
      "follow_up": "follow-up question if answer is shallow",
      "ideal_answer_hint": "brief guidance"
    }}
  ]
}}

Candidate profile: resume={resume_json_str}"""

    try:
        result = chat_completion_json(prompt, temperature=0.7)
        questions = result.get("questions", result if isinstance(result, list) else [])
        # Ensure IDs and type field
        for i, q in enumerate(questions):
            q["id"] = i + 1
            if "type" not in q:
                q["type"] = "technical"
            if "ideal_answer_points" not in q:
                q["ideal_answer_points"] = []
            if "follow_up" not in q:
                q["follow_up"] = ""
        return questions
    except Exception as e:
        print(f"⚠️ Question generation failed: {e}")
        # Fallback questions
        return [
            {"id": 1, "text": f"Tell me about your experience with {', '.join(tech_skills[:3]) if tech_skills else 'programming'}.", "type": "technical", "ideal_answer_hint": "Discuss specific technologies and projects", "ideal_answer_points": ["Technical depth", "Real examples"], "follow_up": "Can you give a specific example?"},
            {"id": 2, "text": "Explain the concept of time complexity and give an example.", "type": "technical", "ideal_answer_hint": "Big-O notation, examples like sorting algorithms", "ideal_answer_points": ["Big-O notation", "Practical examples"], "follow_up": "What's the time complexity of merge sort?"},
            {"id": 3, "text": "What is the difference between SQL and NoSQL databases?", "type": "technical", "ideal_answer_hint": "Relational vs document stores, use cases", "ideal_answer_points": ["Schema differences", "Use cases"], "follow_up": "When would you choose one over the other?"},
            {"id": 4, "text": "Tell me about a time you worked on a challenging team project.", "type": "behavioural", "ideal_answer_hint": "STAR format: situation, task, action, result", "ideal_answer_points": ["STAR format", "Clear outcome"], "follow_up": "What was your specific contribution?"},
            {"id": 5, "text": "Describe a situation where you had to meet a tight deadline.", "type": "behavioural", "ideal_answer_hint": "Time management, prioritization, outcome", "ideal_answer_points": ["Prioritization", "Result"], "follow_up": "What would you do differently?"},
            {"id": 6, "text": f"Walk me through your project '{p1_name}'. What was the architecture?", "type": "project", "ideal_answer_hint": "Technical decisions, challenges, impact", "ideal_answer_points": ["Architecture choice", "Challenges faced"], "follow_up": "What would you improve?"},
            {"id": 7, "text": f"What challenges did you face building '{p2_name}' and how did you solve them?", "type": "project", "ideal_answer_hint": "Problem-solving, debugging, learning", "ideal_answer_points": ["Problem identification", "Solution approach"], "follow_up": "What did you learn from this?"},
            {"id": 8, "text": f"Why do you want to work at {company}?", "type": "culture", "ideal_answer_hint": "Company values, products, personal alignment", "ideal_answer_points": ["Company knowledge", "Personal alignment"], "follow_up": "How does this align with your 5-year plan?"},
        ]


def evaluate_answer(
    question: str,
    hint: str,
    transcript: str,
    company: str,
    ideal_points: Optional[list[str]] = None,
    skill_context: str = "",
) -> dict:
    """
    Evaluate a single interview answer with context-aware scoring.
    Returns scores, feedback, and follow_up_triggered flag.
    """
    if not transcript or len(transcript.strip()) < 10:
        return {
            "relevance": 2, "communication": 2, "technical_accuracy": 2,
            "depth": 2, "overall": 2,
            "strengths": [], "improvements": ["Answer was too short or missing"],
            "brief_feedback": "Please provide a more detailed answer.",
            "follow_up_triggered": True,
        }

    context_section = ""
    if skill_context:
        context_section = f"\nContext: {skill_context}"
    if ideal_points:
        context_section += f"\nIdeal points to cover: {json.dumps(ideal_points)}"

    prompt = f"""You are an interview evaluator at {company}.
{context_section}
Question: '{question}'
Ideal answer guidance: '{hint}'
Candidate answered: '{transcript}'

Return ONLY valid JSON:
{{
  "relevance": 0-10,
  "communication": 0-10,
  "technical_accuracy": 0-10,
  "depth": 0-10,
  "overall": 0-10,
  "strengths": ["string"],
  "improvements": ["string"],
  "follow_up_triggered": true/false (true if answer was shallow or missed key points),
  "brief_feedback": "string"
}}"""

    try:
        return chat_completion_json(prompt, temperature=0.0)
    except Exception as e:
        print(f"⚠️ Answer evaluation failed: {e}")
        return {
            "relevance": 5, "communication": 5, "technical_accuracy": 5,
            "depth": 5, "overall": 5,
            "strengths": ["Attempted an answer"],
            "improvements": ["Could not evaluate — AI service error"],
            "brief_feedback": "Evaluation unavailable, please retry.",
            "follow_up_triggered": False,
        }


def generate_session_report(
    company: str,
    job_title: str,
    question_scores: list[dict],
    eye_contact_pct: float = 0.0,
    filler_count: int = 0,
) -> dict:
    """
    Generate a detailed post-interview performance report.
    """
    scores_summary = []
    for i, qs in enumerate(question_scores):
        scores_summary.append(f"Q{i+1}: overall={qs.get('overall', 0)}, relevance={qs.get('relevance', 0)}, communication={qs.get('communication', 0)}, depth={qs.get('depth', 0)}")

    prompt = f"""Generate a detailed performance report for a {company} {job_title} interview.

Question scores: {json.dumps(scores_summary)}
Eye contact percentage: {eye_contact_pct}%
Filler word count: {filler_count}

Return ONLY valid JSON:
{{
  "overall_score": number (0-100),
  "performance_level": "Excellent/Good/Average/Needs Improvement",
  "top_strengths": ["string"],
  "key_improvements": ["string"],
  "company_readiness": "string",
  "communication_feedback": "string",
  "recommended_resources": [{{ "title": "string", "type": "string", "url": "string" }}]
}}"""

    try:
        result = chat_completion_json(prompt, temperature=0.7)
        # Calculate overall from actual scores if AI didn't
        if question_scores:
            actual_avg = sum(qs.get("overall", 0) for qs in question_scores) / len(question_scores)
            result["calculated_score"] = round(actual_avg * 10, 1)
        return result
    except Exception as e:
        print(f"⚠️ Report generation failed: {e}")
        avg = sum(qs.get("overall", 0) for qs in question_scores) / max(len(question_scores), 1) if question_scores else 0
        return {
            "overall_score": round(avg * 10, 1),
            "performance_level": "Average",
            "top_strengths": ["Completed the interview"],
            "key_improvements": ["Practice more mock interviews"],
            "company_readiness": "Needs more preparation",
            "communication_feedback": f"Eye contact: {eye_contact_pct}%, Filler words: {filler_count}",
            "recommended_resources": [],
        }
