"""
ATS (Applicant Tracking System) scoring engine.
Calculates a deterministic, reproducible, explainable ATS compatibility score
across 6 sub-scores summing to 100.

Determinism guarantees:
- Keyword matching uses algorithmic stemming — no LLM involved.
- Format/structure scoring is 100% regex/boolean — no LLM involved.
- Semantic similarity uses OpenAI embeddings (deterministic by nature).
- JD generation and experience/education scoring use temperature=0.
- Results are cached by resume_hash + company + role for instant replay.
"""

import os
import re
import json
import hashlib
import numpy as np
from dotenv import load_dotenv
from fastapi import HTTPException

load_dotenv()

from services.openai_client import chat_completion, chat_completion_json, embed_text


# ---------- Deterministic Stemmer + Keyword Extraction ----------

_STOP_WORDS = frozenset([
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "shall", "should", "may", "might", "can", "could", "must", "need",
    "this", "that", "these", "those", "it", "its", "we", "our", "you",
    "your", "they", "them", "their", "he", "she", "him", "her", "his",
    "not", "no", "nor", "as", "if", "then", "than", "so", "up", "out",
    "about", "into", "over", "after", "under", "between", "through",
    "during", "before", "above", "below", "each", "every", "all", "both",
    "few", "more", "most", "other", "some", "such", "only", "own", "same",
    "also", "very", "just", "because", "well", "even", "too", "any",
    "etc", "able", "across", "including", "using", "work", "working",
    "strong", "good", "new", "years", "year", "experience", "ability",
    "team", "role", "required", "preferred", "responsibilities",
    "qualifications", "requirements", "including", "skills",
])


def _simple_stem(word: str) -> str:
    """Simple suffix-stripping stemmer for deterministic keyword matching."""
    w = word.lower().strip()
    if len(w) <= 3:
        return w
    # Order matters — try longest suffixes first
    for suffix in ["-tion", "-ment", "-ness", "-able", "-ible", "-ment",
                   "ation", "tion", "ment", "ness", "able", "ible",
                   "ings", "ying", "ding", "ting", "ning", "ring",
                   "ing", "ied", "ies", "ted", "ers", "ist",
                   "ed", "er", "ly", "al", "es"]:
        if w.endswith(suffix) and len(w) - len(suffix) >= 3:
            return w[:-len(suffix)]
    # Strip trailing 's' if it leaves a word of 3+ chars
    if w.endswith("s") and len(w) > 3 and not w.endswith("ss"):
        return w[:-1]
    return w


def _tokenize_and_stem(text: str) -> set[str]:
    """Tokenize text into stemmed keyword set, removing stop words."""
    # Split on non-alphanumeric, keep words 2+ chars
    tokens = re.findall(r'[a-zA-Z][a-zA-Z0-9#+.\-]+', text.lower())
    stemmed = set()
    for token in tokens:
        if token not in _STOP_WORDS and len(token) >= 2:
            stemmed.add(_simple_stem(token))
            # Also keep original for exact matches (e.g. "react", "python")
            stemmed.add(token)
    return stemmed


def _extract_keywords_from_jd_algorithmic(job_description: str) -> list[str]:
    """
    Extract keywords from JD using pure algorithmic approach.
    No LLM involved — fully deterministic.
    """
    # Tokenize and stem
    tokens = re.findall(r'[a-zA-Z][a-zA-Z0-9#+.\-]+', job_description.lower())
    keywords = []
    seen_stems = set()

    for token in tokens:
        if token in _STOP_WORDS or len(token) < 2:
            continue
        stem = _simple_stem(token)
        if stem not in seen_stems:
            seen_stems.add(stem)
            keywords.append(token)  # Keep original form for readability

    return keywords


# ---------- Cosine Similarity ----------

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


# ---------- Hashing ----------

def compute_resume_hash(plain_text: str) -> str:
    """MD5 hash of resume text for caching."""
    return hashlib.md5(plain_text.encode("utf-8")).hexdigest()


# ---------- JD Generation (temperature=0 for determinism) ----------

def _generate_job_description(company: str, job_title: str) -> str:
    """Generate a detailed job description for the target role using OpenAI."""
    prompt = f"""Generate a detailed job description for the role of {job_title} at {company}.
Include: required technical skills, preferred qualifications, key responsibilities,
required experience level, educational requirements, and any specific technologies or tools.
Write it as a realistic job posting of about 300 words. Return ONLY the job description text,
no markdown formatting, no headers, no bullet point symbols."""

    return chat_completion(prompt, temperature=0.0)


# ---------- Resume Keyword Extraction (Algorithmic) ----------

def _extract_resume_keywords(parsed_data: dict) -> list[str]:
    """Extract all keywords from the parsed resume data."""
    keywords = set()

    # Skills
    skills = parsed_data.get("skills", {})
    for skill_list in [skills.get("technical", []), skills.get("tools", []),
                       skills.get("languages", []), skills.get("soft_skills", [])]:
        for skill in skill_list:
            keywords.add(skill.lower().strip())

    # Technologies from experience
    for exp in parsed_data.get("experience", []):
        for tech in exp.get("technologies_used", []):
            keywords.add(tech.lower().strip())

    # Technologies from projects
    for proj in parsed_data.get("projects", []):
        for tech in proj.get("technologies", []):
            keywords.add(tech.lower().strip())

    # Education keywords
    for edu in parsed_data.get("education", []):
        if edu.get("degree"):
            keywords.add(edu["degree"].lower().strip())
        for course in edu.get("relevant_courses", []):
            keywords.add(course.lower().strip())

    # Certifications
    for cert in parsed_data.get("certifications", []):
        if cert.get("name"):
            keywords.add(cert["name"].lower().strip())

    return list(keywords)


# ---------- Sub-Score Functions ----------

def _score_keyword_match(resume_keywords: list[str], jd_keywords: list[str]) -> dict:
    """Score 1: Keyword match using stemmed comparison (max 25 points). Fully deterministic."""
    if not jd_keywords:
        return {"score": 12, "max": 25, "matched": [], "missing": []}

    # Stem both sides for fuzzy-but-deterministic matching
    resume_stems = set()
    for kw in resume_keywords:
        resume_stems.add(_simple_stem(kw.lower().strip()))
        resume_stems.add(kw.lower().strip())  # Also keep exact

    matched = []
    missing = []

    for kw in jd_keywords:
        kw_stem = _simple_stem(kw.lower().strip())
        kw_lower = kw.lower().strip()
        # Check stem match or substring match
        found = False
        if kw_stem in resume_stems or kw_lower in resume_stems:
            found = True
        else:
            for rk in resume_stems:
                if kw_lower in rk or rk in kw_lower:
                    found = True
                    break
        if found:
            matched.append(kw)
        else:
            missing.append(kw)

    total = len(jd_keywords)
    score = round((len(matched) / total) * 25) if total > 0 else 0

    return {"score": min(score, 25), "max": 25, "matched": matched, "missing": missing}


def _score_semantic_similarity(parsed_data: dict, job_description: str) -> dict:
    """Score 2: Semantic similarity using embeddings (max 25 points). Deterministic — embeddings are non-random."""
    # Build resume summary text for embedding
    skills = parsed_data.get("skills", {})
    all_skills = (
        skills.get("technical", []) + skills.get("tools", []) +
        skills.get("languages", [])
    )
    summary = parsed_data.get("summary", "")

    exp_summaries = []
    for exp in parsed_data.get("experience", []):
        exp_text = f"{exp.get('title', '')} at {exp.get('company', '')}"
        if exp.get("responsibilities"):
            exp_text += ". " + ". ".join(exp["responsibilities"][:3])
        exp_summaries.append(exp_text)

    proj_summaries = []
    for proj in parsed_data.get("projects", []):
        proj_text = f"{proj.get('name', '')}: {proj.get('description', '')}"
        proj_summaries.append(proj_text)

    resume_text = f"""
    {summary}
    Skills: {', '.join(all_skills)}
    Experience: {' '.join(exp_summaries)}
    Projects: {' '.join(proj_summaries)}
    """.strip()

    resume_embedding = embed_text(resume_text)
    jd_embedding = embed_text(job_description)

    cosine_val = _cosine_similarity(resume_embedding, jd_embedding)
    score = round(cosine_val * 25)

    return {"score": min(score, 25), "max": 25, "cosine_value": round(cosine_val, 4)}


def _score_format_structure(parsed_data: dict, plain_text: str) -> dict:
    """Score 3: Format and structure (max 20 points). 100% algorithmic — no LLM."""
    checks = {}
    score = 0

    # Contact info (3 points)
    personal = parsed_data.get("personal", {})
    has_email = bool(re.search(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', personal.get("email", "")))
    has_phone = bool(re.search(r'[\d\s\-\+\(\)]{7,}', personal.get("phone", "")))
    has_name = bool(personal.get("name", "").strip())
    contact_score = sum([has_email, has_phone, has_name])
    checks["contact_info"] = {"score": contact_score, "max": 3,
                               "detail": f"Name: {'✓' if has_name else '✗'}, Email: {'✓' if has_email else '✗'}, Phone: {'✓' if has_phone else '✗'}"}
    score += contact_score

    # Clear sections (3 points)
    has_education = len(parsed_data.get("education", [])) > 0
    has_experience = len(parsed_data.get("experience", [])) > 0
    has_skills = any([
        parsed_data.get("skills", {}).get("technical"),
        parsed_data.get("skills", {}).get("tools")
    ])
    section_score = sum([has_education, has_experience, has_skills])
    checks["clear_sections"] = {"score": section_score, "max": 3,
                                 "detail": f"Education: {'✓' if has_education else '✗'}, Experience: {'✓' if has_experience else '✗'}, Skills: {'✓' if has_skills else '✗'}"}
    score += section_score

    # Measurable achievements with numbers (4 points) — regex for digits + % or x or impact words
    impact_pattern = re.compile(r'\d+\s*[%x×]|\d+\s*(?:percent|users|clients|customers|reduction|increase|improved|reduced|boosted|generated|served|processed)')
    number_pattern = re.compile(r'\d+[%+]?|\$\d+|#\d+')
    achievement_texts = []
    for exp in parsed_data.get("experience", []):
        achievement_texts.extend(exp.get("responsibilities", []))
    for proj in parsed_data.get("projects", []):
        if proj.get("impact"):
            achievement_texts.append(proj["impact"])
    achievements_with_numbers = [t for t in achievement_texts if number_pattern.search(t) or impact_pattern.search(t.lower())]
    num_ratio = len(achievements_with_numbers) / max(len(achievement_texts), 1)
    num_score = min(4, round(num_ratio * 4))
    checks["measurable_achievements"] = {"score": num_score, "max": 4,
                                          "detail": f"{len(achievements_with_numbers)} of {len(achievement_texts)} achievements contain metrics"}
    score += num_score

    # Spelling check (3 points)
    common_misspellings = [
        "responsiblity", "acheive", "managment", "developement", "experiance",
        "proficient", "refrences", "strenght", "succesful", "communiction"
    ]
    text_lower = plain_text.lower()
    misspellings_found = [w for w in common_misspellings if w in text_lower]
    spell_score = 3 if len(misspellings_found) == 0 else max(0, 3 - len(misspellings_found))
    spell_detail = "No common misspellings found" if not misspellings_found else "Found: " + ", ".join(misspellings_found)
    checks["spelling"] = {"score": spell_score, "max": 3, "detail": spell_detail}
    score += spell_score

    # Appropriate length by character count (3 points) — 2000-6000 chars recommended
    char_count = len(plain_text)
    word_count = len(plain_text.split())
    if 2000 <= char_count <= 6000:
        length_score = 3
    elif 1500 <= char_count <= 8000:
        length_score = 2
    else:
        length_score = 1
    checks["appropriate_length"] = {"score": length_score, "max": 3,
                                     "detail": f"{char_count} chars / {word_count} words ({'optimal' if length_score == 3 else 'acceptable' if length_score == 2 else 'too short or too long'})"}
    score += length_score

    # Relevant skills section (4 points)
    tech_skills = parsed_data.get("skills", {}).get("technical", [])
    tools = parsed_data.get("skills", {}).get("tools", [])
    total_skills = len(tech_skills) + len(tools)
    if total_skills >= 8:
        skills_score = 4
    elif total_skills >= 5:
        skills_score = 3
    elif total_skills >= 3:
        skills_score = 2
    else:
        skills_score = 1
    checks["skills_section"] = {"score": skills_score, "max": 4,
                                 "detail": f"{total_skills} technical skills and tools listed"}
    score += skills_score

    return {"score": min(score, 20), "max": 20, "checks": checks}


def _score_skills_coverage(resume_keywords: list[str], jd_keywords: list[str]) -> dict:
    """Score 4: Skills coverage with stemmed matching (max 15 points). Deterministic."""
    resume_stems = set()
    for kw in resume_keywords:
        resume_stems.add(_simple_stem(kw.lower().strip()))
        resume_stems.add(kw.lower().strip())

    covered = []
    missing = []

    for kw in jd_keywords:
        kw_stem = _simple_stem(kw.lower().strip())
        kw_lower = kw.lower().strip()
        found = False
        if kw_stem in resume_stems or kw_lower in resume_stems:
            found = True
        else:
            for rk in resume_stems:
                if kw_lower in rk or rk in kw_lower:
                    found = True
                    break
        if found:
            covered.append(kw)
        else:
            missing.append(kw)

    total = len(jd_keywords)
    score = round((len(covered) / total) * 15) if total > 0 else 0

    return {"score": min(score, 15), "max": 15, "covered": covered, "missing": missing}


def _score_experience_relevance(parsed_data: dict, company: str, job_title: str) -> dict:
    """Score 5: Experience relevance (max 10 points)."""
    exp_and_proj_text = ""
    for exp in parsed_data.get("experience", []):
        exp_and_proj_text += f"Role: {exp.get('title', '')} at {exp.get('company', '')}. "
        exp_and_proj_text += f"Responsibilities: {', '.join(exp.get('responsibilities', [])[:3])}. "
        exp_and_proj_text += f"Technologies: {', '.join(exp.get('technologies_used', []))}. "

    for proj in parsed_data.get("projects", []):
        exp_and_proj_text += f"Project: {proj.get('name', '')}. {proj.get('description', '')}. "
        exp_and_proj_text += f"Technologies: {', '.join(proj.get('technologies', []))}. "

    if not exp_and_proj_text.strip():
        return {"score": 2, "max": 10}

    prompt = f"""Rate how relevant the following experience and projects are to the role of {job_title} at {company}.
Return ONLY a single integer from 0 to 10, where 10 means perfectly relevant and 0 means completely irrelevant.
Return ONLY the number, nothing else.

Experience and Projects:
{exp_and_proj_text}"""

    raw = chat_completion(prompt, temperature=0.0)

    try:
        relevance_score = int(re.search(r'\d+', raw).group())
        relevance_score = min(10, max(0, relevance_score))
    except (ValueError, AttributeError):
        relevance_score = 5

    return {"score": relevance_score, "max": 10}


def _score_education_match(parsed_data: dict, job_title: str) -> dict:
    """Score 6: Education match (max 5 points)."""
    education = parsed_data.get("education", [])
    if not education:
        return {"score": 1, "max": 5}

    edu_text = ""
    for edu in education:
        edu_text += f"Degree: {edu.get('degree', '')} from {edu.get('institution', '')}. "
        if edu.get("relevant_courses"):
            edu_text += f"Courses: {', '.join(edu['relevant_courses'])}. "

    prompt = f"""Rate how well the following education matches the typical requirements for a {job_title} position.
Return ONLY a single integer: 5 for strong match, 3 for partial match, 1 for weak match.
Return ONLY the number, nothing else.

Education:
{edu_text}"""

    raw = chat_completion(prompt, temperature=0.0)

    try:
        edu_score = int(re.search(r'\d+', raw).group())
        if edu_score >= 4:
            edu_score = 5
        elif edu_score >= 2:
            edu_score = 3
        else:
            edu_score = 1
    except (ValueError, AttributeError):
        edu_score = 3

    return {"score": edu_score, "max": 5}


# ---------- Grade + Summary ----------

def _get_grade(total_score: int) -> str:
    """Return grade based on score thresholds."""
    if total_score >= 90:
        return "A"
    elif total_score >= 80:
        return "B+"
    elif total_score >= 70:
        return "B"
    elif total_score >= 60:
        return "C"
    else:
        return "D"


def _get_summary(total_score: int, sub_scores: dict) -> str:
    """Generate a human-readable summary of the ATS score."""
    grade = _get_grade(total_score)
    weakest = min(sub_scores.items(), key=lambda x: x[1]["score"] / x[1]["max"])
    strongest = max(sub_scores.items(), key=lambda x: x[1]["score"] / x[1]["max"])

    summaries = {
        "A": f"Excellent match! Your resume is very well-aligned with this role. Strongest area: {strongest[0].replace('_', ' ')}.",
        "B+": f"Strong match. Your resume is a good fit with room for improvement. Focus on: {weakest[0].replace('_', ' ')}.",
        "B": f"Good match. Your resume covers the basics but has notable gaps in {weakest[0].replace('_', ' ')}.",
        "C": f"Average match. Significant improvements needed, especially in {weakest[0].replace('_', ' ')}.",
        "D": f"Needs work. Your resume has major gaps for this role. Priority area: {weakest[0].replace('_', ' ')}.",
    }
    return summaries.get(grade, "Score calculated.")


# ---------- Main Scorer ----------

def calculate_ats_score(
    parsed_data: dict,
    plain_text: str,
    company: str,
    job_title: str
) -> dict:
    """
    Calculate a complete ATS compatibility score across 6 sub-scores.
    Uses algorithmic keyword matching + stemming for determinism.
    Results are identical for the same input every time.
    """
    try:
        # Generate job description for the target role (temperature=0)
        job_description = _generate_job_description(company, job_title)

        # Extract keywords — ALGORITHMIC, no LLM
        jd_keywords = _extract_keywords_from_jd_algorithmic(job_description)
        resume_keywords = _extract_resume_keywords(parsed_data)

        # Calculate all 6 sub-scores
        keyword_match = _score_keyword_match(resume_keywords, jd_keywords)
        semantic_similarity = _score_semantic_similarity(parsed_data, job_description)
        format_structure = _score_format_structure(parsed_data, plain_text)
        skills_coverage = _score_skills_coverage(resume_keywords, jd_keywords)
        experience_relevance = _score_experience_relevance(parsed_data, company, job_title)
        education_match = _score_education_match(parsed_data, job_title)

        # Sum up total
        total_score = (
            keyword_match["score"] +
            semantic_similarity["score"] +
            format_structure["score"] +
            skills_coverage["score"] +
            experience_relevance["score"] +
            education_match["score"]
        )
        total_score = min(100, max(0, total_score))

        sub_scores = {
            "keyword_match": keyword_match,
            "semantic_similarity": semantic_similarity,
            "format_structure": format_structure,
            "skills_coverage": skills_coverage,
            "experience_relevance": experience_relevance,
            "education_match": education_match,
        }

        # Top missing keywords from both keyword match and skills coverage
        all_missing = set(keyword_match.get("missing", []) + skills_coverage.get("missing", []))
        top_missing = list(all_missing)[:15]

        return {
            "total_score": total_score,
            "grade": _get_grade(total_score),
            "sub_scores": sub_scores,
            "summary": _get_summary(total_score, sub_scores),
            "top_missing_keywords": top_missing,
            "job_description_used": job_description,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"ATS scoring failed: {str(e)}"
        )
