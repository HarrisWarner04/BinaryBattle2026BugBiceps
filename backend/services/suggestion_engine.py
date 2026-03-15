"""
AI-powered suggestion engine using OpenAI GPT-4o-mini.
Generates 10 highly specific, actionable improvement suggestions
tailored to the student's actual resume and target role.
"""

import os
import json
from dotenv import load_dotenv
from fastapi import HTTPException

load_dotenv()

from services.openai_client import chat_completion_json


def generate_suggestions(
    parsed_data: dict,
    ats_score: dict,
    semantic_match: dict,
    company: str,
    job_title: str,
) -> list[dict]:
    """
    Generate 10 highly specific, actionable improvement suggestions.
    Every suggestion references something specific from the student's actual resume.

    Args:
        parsed_data: Parsed resume JSON.
        ats_score: ATS score breakdown.
        semantic_match: Semantic match analysis.
        company: Target company name.
        job_title: Target job title.

    Returns:
        List of 10 suggestion dictionaries.

    Raises:
        HTTPException: If suggestion generation fails.
    """
    try:
        # Build context
        skills = parsed_data.get("skills", {})
        experience = parsed_data.get("experience", [])
        projects = parsed_data.get("projects", [])
        education = parsed_data.get("education", [])

        context = f"""
RESUME DATA:
Name: {parsed_data.get('personal', {}).get('name', 'Student')}
Summary: {parsed_data.get('summary', 'No summary provided')}

Skills:
- Technical: {', '.join(skills.get('technical', []))}
- Tools: {', '.join(skills.get('tools', []))}
- Languages: {', '.join(skills.get('languages', []))}
- Soft Skills: {', '.join(skills.get('soft_skills', []))}

Experience:
{chr(10).join([f"- {exp.get('title', '')} at {exp.get('company', '')} ({exp.get('duration', '')}): {'; '.join(exp.get('responsibilities', [])[:3])}" for exp in experience]) if experience else 'No work experience listed'}

Projects:
{chr(10).join([f"- {proj.get('name', '')}: {proj.get('description', '')} [Tech: {', '.join(proj.get('technologies', []))}]" for proj in projects]) if projects else 'No projects listed'}

Education:
{chr(10).join([f"- {edu.get('degree', '')} from {edu.get('institution', '')} ({edu.get('year', '')}), CGPA: {edu.get('cgpa_or_percentage', 'N/A')}" for edu in education]) if education else 'No education listed'}

Certifications:
{chr(10).join([f"- {cert.get('name', '')} ({cert.get('issuer', '')})" for cert in parsed_data.get('certifications', [])]) if parsed_data.get('certifications') else 'None'}

Achievements: {', '.join(parsed_data.get('achievements', [])) if parsed_data.get('achievements') else 'None listed'}

ATS SCORE BREAKDOWN:
Total Score: {ats_score.get('total_score', 0)}/100 (Grade: {ats_score.get('grade', 'N/A')})
- Keyword Match: {ats_score.get('sub_scores', {}).get('keyword_match', {}).get('score', 0)}/25
  Missing Keywords: {', '.join(ats_score.get('sub_scores', {}).get('keyword_match', {}).get('missing', [])[:10])}
- Semantic Similarity: {ats_score.get('sub_scores', {}).get('semantic_similarity', {}).get('score', 0)}/25
- Format & Structure: {ats_score.get('sub_scores', {}).get('format_structure', {}).get('score', 0)}/20
- Skills Coverage: {ats_score.get('sub_scores', {}).get('skills_coverage', {}).get('score', 0)}/15
  Missing Skills: {', '.join(ats_score.get('sub_scores', {}).get('skills_coverage', {}).get('missing', [])[:10])}
- Experience Relevance: {ats_score.get('sub_scores', {}).get('experience_relevance', {}).get('score', 0)}/10
- Education Match: {ats_score.get('sub_scores', {}).get('education_match', {}).get('score', 0)}/5

SEMANTIC MATCH ANALYSIS:
Match Percentage: {semantic_match.get('semantic_match_percentage', 0)}%
Closest Role Match: {semantic_match.get('closest_role_found', 'Unknown')}
Relevant Skills: {', '.join(semantic_match.get('skill_gap_analysis', {}).get('relevant_skills', []))}
Missing Skills: {', '.join(semantic_match.get('skill_gap_analysis', {}).get('missing_skills', []))}
Bonus Skills: {', '.join(semantic_match.get('skill_gap_analysis', {}).get('bonus_skills', []))}

TARGET: {job_title} at {company}
"""

        prompt = f"""You are an expert career coach specialising in Indian campus placements. Based on the resume analysis below, generate exactly 10 personalised improvement suggestions. Each suggestion must: (1) reference a specific part of the student's actual resume, (2) explain exactly what to change and why, (3) be actionable within 1 week, (4) be tailored to {company} and {job_title}. Format as a JSON array with fields: priority (high/medium/low), category (keywords/skills/experience/format/projects/education), suggestion (specific action), impact (why this will improve their score), example (show the before/after if applicable, or provide a concrete example of what to add). Return ONLY the JSON array, no markdown backticks, no explanation.

{context}"""

        suggestions = chat_completion_json(
            prompt,
            system_prompt="You are a career advisor specializing in resume optimization. Return ONLY valid JSON, no markdown.",
            temperature=0.7,
        )

        # Validate structure
        validated = []
        priority_order = {"high": 0, "medium": 1, "low": 2}
        for s in suggestions:
            validated.append({
                "priority": s.get("priority", "medium"),
                "category": s.get("category", "format"),
                "suggestion": s.get("suggestion", ""),
                "impact": s.get("impact", ""),
                "example": s.get("example", ""),
            })

        # Sort by priority: high first
        validated.sort(key=lambda x: priority_order.get(x["priority"], 1))

        # Ensure exactly 10
        if len(validated) > 10:
            validated = validated[:10]

        return validated

    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Gemini suggestions output was not valid JSON: {str(e)}"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Suggestion generation failed: {str(e)}"
        )
