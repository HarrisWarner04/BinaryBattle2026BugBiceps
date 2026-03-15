"""
Semantic matching service using ChromaDB and OpenAI embeddings.
Performs semantic search to match resumes against job roles.
"""

import os
import json
import numpy as np
from dotenv import load_dotenv
from fastapi import HTTPException

load_dotenv()

from services.openai_client import chat_completion, chat_completion_json, embed_text
from rag.setup import get_job_roles_collection


def _cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """Calculate cosine similarity between two vectors."""
    a = np.array(vec_a, dtype=np.float64)
    b = np.array(vec_b, dtype=np.float64)
    dot_product = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(dot_product / (norm_a * norm_b))


def _build_resume_embedding_text(parsed_data: dict) -> str:
    """Build a comprehensive text from the resume for embedding."""
    parts = []

    summary = parsed_data.get("summary", "")
    if summary:
        parts.append(summary)

    # Skills
    skills = parsed_data.get("skills", {})
    all_skills = (
        skills.get("technical", []) + skills.get("tools", []) +
        skills.get("languages", []) + skills.get("soft_skills", [])
    )
    if all_skills:
        parts.append("Skills: " + ", ".join(all_skills))

    # Experience
    for exp in parsed_data.get("experience", []):
        exp_text = f"{exp.get('title', '')} at {exp.get('company', '')}"
        if exp.get("responsibilities"):
            exp_text += ". " + ". ".join(exp["responsibilities"])
        if exp.get("technologies_used"):
            exp_text += ". Technologies: " + ", ".join(exp["technologies_used"])
        parts.append(exp_text)

    # Projects
    for proj in parsed_data.get("projects", []):
        proj_text = f"Project: {proj.get('name', '')}. {proj.get('description', '')}"
        if proj.get("technologies"):
            proj_text += ". Technologies: " + ", ".join(proj["technologies"])
        if proj.get("impact"):
            proj_text += f". Impact: {proj['impact']}"
        parts.append(proj_text)

    # Education
    for edu in parsed_data.get("education", []):
        edu_text = f"{edu.get('degree', '')} from {edu.get('institution', '')}"
        if edu.get("relevant_courses"):
            edu_text += ". Courses: " + ", ".join(edu["relevant_courses"])
        parts.append(edu_text)

    # Certifications
    for cert in parsed_data.get("certifications", []):
        parts.append(f"Certification: {cert.get('name', '')} by {cert.get('issuer', '')}")

    return " | ".join(parts)


def _generate_targeted_job_description(company: str, job_title: str) -> str:
    """Generate a targeted job description for the specific company and role."""
    prompt = f"""Generate a detailed, realistic job description for the role of {job_title} at {company}.
Include the specific skills, qualifications, experience, and cultural fit aspects that {company} values.
Include technical requirements, soft skills, and any domain knowledge expected.
Write approximately 300 words. Return ONLY the description text, no markdown or formatting."""

    return chat_completion(prompt, temperature=0.0)


def _analyze_skill_gaps(parsed_data: dict, company: str, job_title: str) -> dict:
    """Analyze skill gaps between the resume and the target role using OpenAI."""
    skills = parsed_data.get("skills", {})
    all_skills = (
        skills.get("technical", []) + skills.get("tools", []) +
        skills.get("languages", [])
    )

    prompt = f"""You are a career advisor specializing in Indian campus placements.
Given a student's skills and their target role, analyze the skill gaps.

Student's Skills: {', '.join(all_skills)}

Target Role: {job_title} at {company}

Return a JSON object with exactly these three arrays:
{{
  "relevant_skills": ["skills the student has that are relevant to this role"],
  "missing_skills": ["critical skills the student is missing for this role"],
  "bonus_skills": ["skills the student has that are a bonus/differentiator for {company} specifically"]
}}

Return ONLY valid JSON, no markdown, no backticks, no explanation."""

    try:
        return chat_completion_json(prompt, temperature=0.0)
    except Exception:
        return {
            "relevant_skills": all_skills[:5],
            "missing_skills": [],
            "bonus_skills": [],
        }


def _generate_alignment_summary(parsed_data: dict, company: str, job_title: str, cosine_val: float) -> str:
    """Generate a role alignment summary using OpenAI."""
    skills = parsed_data.get("skills", {})
    all_skills = skills.get("technical", []) + skills.get("tools", [])

    exp_titles = [exp.get("title", "") for exp in parsed_data.get("experience", [])]
    proj_names = [proj.get("name", "") for proj in parsed_data.get("projects", [])]

    prompt = f"""Write a 3-4 sentence alignment summary for a student applying to {job_title} at {company}.
Their semantic match score is {round(cosine_val * 100)}%.
Their skills include: {', '.join(all_skills[:15])}
Their experience titles: {', '.join(exp_titles) if exp_titles else 'No prior work experience'}
Their project names: {', '.join(proj_names) if proj_names else 'No projects listed'}

Write a concise, encouraging but honest assessment. Return ONLY the summary text, no formatting."""

    return chat_completion(prompt, temperature=0.0)


def perform_semantic_match(parsed_data: dict, company: str, job_title: str) -> dict:
    """
    Perform full semantic matching between the resume and the target role.
    Uses ChromaDB retrieval + direct cosine similarity + Gemini-generated JD matching.

    Args:
        parsed_data: Parsed resume JSON.
        company: Target company name.
        job_title: Target job title.

    Returns:
        Dict with semantic_match_percentage, closest_role_found, skill_gap_analysis,
        role_alignment_summary, and cosine_similarity_raw.

    Raises:
        HTTPException: If semantic matching fails.
    """
    try:
        # 1. Build resume embedding text and embed it
        resume_text = _build_resume_embedding_text(parsed_data)
        resume_embedding = embed_text(resume_text)

        # 2. Query ChromaDB for closest matching role
        collection = get_job_roles_collection()
        results = collection.query(
            query_embeddings=[resume_embedding],
            n_results=3,
        )

        closest_role = "Unknown"
        closest_company = "Unknown"
        chromadb_cosine = 0.0

        if results and results["documents"] and results["documents"][0]:
            closest_meta = results["metadatas"][0][0]
            closest_role = closest_meta.get("title", "Unknown")
            closest_company = closest_meta.get("company", "Unknown")

            # Calculate cosine similarity with the closest match
            closest_doc = results["documents"][0][0]
            closest_embedding = embed_text(closest_doc)
            chromadb_cosine = _cosine_similarity(resume_embedding, closest_embedding)

        # 3. Generate a targeted JD for the specific company + role
        targeted_jd = _generate_targeted_job_description(company, job_title)
        targeted_jd_embedding = embed_text(targeted_jd)

        # 4. Calculate direct cosine similarity
        direct_cosine = _cosine_similarity(resume_embedding, targeted_jd_embedding)

        # Use the average of both for a balanced score
        avg_cosine = (chromadb_cosine + direct_cosine) / 2
        match_percentage = round(avg_cosine * 100, 1)
        match_percentage = min(100.0, max(0.0, match_percentage))

        # 5. Skill gap analysis
        skill_gap = _analyze_skill_gaps(parsed_data, company, job_title)

        # 6. Role alignment summary
        alignment_summary = _generate_alignment_summary(
            parsed_data, company, job_title, avg_cosine
        )

        return {
            "semantic_match_percentage": match_percentage,
            "closest_role_found": f"{closest_role} at {closest_company}",
            "cosine_similarity_raw": round(avg_cosine, 4),
            "chromadb_cosine": round(chromadb_cosine, 4),
            "targeted_cosine": round(direct_cosine, 4),
            "skill_gap_analysis": skill_gap,
            "role_alignment_summary": alignment_summary,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Semantic matching failed: {str(e)}"
        )
