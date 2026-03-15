"""
Resume parser service using OpenAI GPT-4o-mini.
Parses extracted resume text into a structured JSON format with Pydantic validation.
"""

import json
import os
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from fastapi import HTTPException

load_dotenv()

from services.openai_client import chat_completion_json


# ---------- Pydantic Models ----------

class PersonalInfo(BaseModel):
    name: str = ""
    email: str = ""
    phone: str = ""
    location: str = ""
    linkedin: str = ""
    github: str = ""


class Education(BaseModel):
    degree: str = ""
    institution: str = ""
    year: str = ""
    cgpa_or_percentage: str = ""
    relevant_courses: list[str] = Field(default_factory=list)


class Experience(BaseModel):
    title: str = ""
    company: str = ""
    duration: str = ""
    responsibilities: list[str] = Field(default_factory=list)
    technologies_used: list[str] = Field(default_factory=list)


class Project(BaseModel):
    name: str = ""
    description: str = ""
    technologies: list[str] = Field(default_factory=list)
    impact: str = ""
    github_link: str = ""


class Skills(BaseModel):
    technical: list[str] = Field(default_factory=list)
    tools: list[str] = Field(default_factory=list)
    soft_skills: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)


class Certification(BaseModel):
    name: str = ""
    issuer: str = ""
    year: str = ""


class ParsedResume(BaseModel):
    personal: PersonalInfo = Field(default_factory=PersonalInfo)
    summary: str = ""
    education: list[Education] = Field(default_factory=list)
    experience: list[Experience] = Field(default_factory=list)
    projects: list[Project] = Field(default_factory=list)
    skills: Skills = Field(default_factory=Skills)
    certifications: list[Certification] = Field(default_factory=list)
    achievements: list[str] = Field(default_factory=list)


# ---------- Parser ----------

PARSE_PROMPT = """You are a resume parsing expert. Extract all information from the following resume text into the exact JSON structure specified below. Return ONLY valid JSON with no markdown, no backticks, no explanation. If a field is not found, use an empty string or empty array. Never invent data that is not in the resume.

Required JSON structure:
{
  "personal": {
    "name": "",
    "email": "",
    "phone": "",
    "location": "",
    "linkedin": "",
    "github": ""
  },
  "summary": "",
  "education": [
    {
      "degree": "",
      "institution": "",
      "year": "",
      "cgpa_or_percentage": "",
      "relevant_courses": []
    }
  ],
  "experience": [
    {
      "title": "",
      "company": "",
      "duration": "",
      "responsibilities": [],
      "technologies_used": []
    }
  ],
  "projects": [
    {
      "name": "",
      "description": "",
      "technologies": [],
      "impact": "",
      "github_link": ""
    }
  ],
  "skills": {
    "technical": [],
    "tools": [],
    "soft_skills": [],
    "languages": []
  },
  "certifications": [
    {
      "name": "",
      "issuer": "",
      "year": ""
    }
  ],
  "achievements": []
}

Resume text:
"""


def parse_resume(extracted_text: str) -> dict:
    """
    Parse extracted resume text into structured JSON using Gemini 2.0 Flash.

    Args:
        extracted_text: Raw text extracted from the PDF resume.

    Returns:
        Dictionary containing the parsed resume data matching the ParsedResume schema.

    Raises:
        HTTPException: If Gemini call fails or output is not valid JSON.
    """
    try:
        parsed_json = chat_completion_json(
            PARSE_PROMPT + extracted_text,
            system_prompt="You are a resume parser. Return ONLY valid JSON, no markdown, no explanation.",
            temperature=0.0,
        )

        # Validate with Pydantic
        validated = ParsedResume(**parsed_json)
        return validated.model_dump()

    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Gemini output was not valid JSON: {str(e)}"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Resume parsing failed: {str(e)}"
        )
