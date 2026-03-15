"""
GitHub integration service.
Handles OAuth, repo fetching via GraphQL, AI code review, skill verification, and scoring.
Enhanced: deeper fetching (8 repos, file tree, topics), richer AI review with
interview_talking_points, aggregated company-specific assessment.
"""

import os
import json
import httpx
from dotenv import load_dotenv
from fastapi import HTTPException

load_dotenv()

from services.openai_client import chat_completion_json


# ---------- OAuth ----------

GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")
GITHUB_REDIRECT_URI = os.getenv("GITHUB_REDIRECT_URI", "http://localhost:8000/github/callback")


def get_github_auth_url() -> str:
    """Return the GitHub OAuth authorization URL."""
    if not GITHUB_CLIENT_ID:
        raise HTTPException(
            status_code=503,
            detail="GITHUB_CLIENT_ID not configured in backend/.env"
        )
    return (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={GITHUB_CLIENT_ID}"
        f"&redirect_uri={GITHUB_REDIRECT_URI}"
        f"&scope=read:user,repo"
    )


async def exchange_code_for_token(code: str) -> str:
    """Exchange an OAuth authorization code for an access token."""
    if not GITHUB_CLIENT_ID or not GITHUB_CLIENT_SECRET:
        raise HTTPException(
            status_code=503,
            detail="GitHub OAuth credentials not configured in backend/.env"
        )

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://github.com/login/oauth/access_token",
            json={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": GITHUB_REDIRECT_URI,
            },
            headers={"Accept": "application/json"},
        )

        data = response.json()
        if "access_token" not in data:
            error_desc = data.get("error_description", "Unknown OAuth error")
            raise HTTPException(status_code=400, detail=f"GitHub OAuth failed: {error_desc}")

        return data["access_token"]


# ---------- Enhanced GraphQL Repo Fetch ----------

GRAPHQL_QUERY = """
query {
  viewer {
    login
    repositories(first: 8, orderBy: {field: PUSHED_AT, direction: DESC}, privacy: PUBLIC) {
      nodes {
        name
        description
        url
        primaryLanguage { name }
        stargazerCount
        forkCount
        pushedAt
        repositoryTopics(first: 10) {
          nodes { topic { name } }
        }
        object(expression: "HEAD:README.md") {
          ... on Blob { text }
        }
        defaultBranchRef {
          name
          target {
            ... on Commit {
              tree {
                entries {
                  name
                  type
                  object {
                    ... on Tree {
                      entries {
                        name
                        type
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
"""


def _extract_file_tree(entries, prefix="") -> list[str]:
    """Recursively extract file names from tree entries."""
    files = []
    if not entries:
        return files
    for entry in entries:
        path = f"{prefix}{entry.get('name', '')}"
        files.append(path)
        if entry.get("type") == "tree" and entry.get("object"):
            sub_entries = entry["object"].get("entries", [])
            files.extend(_extract_file_tree(sub_entries, f"{path}/"))
    return files


async def fetch_github_repos(access_token: str) -> dict:
    """
    Fetch top 8 repos via GitHub GraphQL API.
    Returns user login and list of repos with READMEs, topics, and file structure.
    """
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.github.com/graphql",
            json={"query": GRAPHQL_QUERY},
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )

        if response.status_code != 200:
            raise HTTPException(
                status_code=503,
                detail=f"GitHub API error: {response.status_code} {response.text[:200]}"
            )

        data = response.json()

        if "errors" in data:
            error_msg = data["errors"][0].get("message", "Unknown GraphQL error")
            raise HTTPException(status_code=503, detail=f"GitHub GraphQL error: {error_msg}")

        viewer = data.get("data", {}).get("viewer", {})
        login = viewer.get("login", "unknown")
        repos_raw = viewer.get("repositories", {}).get("nodes", [])

        repos = []
        for repo in repos_raw:
            readme_text = ""
            if repo.get("object") and repo["object"].get("text"):
                readme_text = repo["object"]["text"][:2000]

            # Extract topics
            topics = []
            for t in repo.get("repositoryTopics", {}).get("nodes", []):
                topics.append(t.get("topic", {}).get("name", ""))

            # Extract file tree
            file_list = []
            try:
                branch_ref = repo.get("defaultBranchRef", {})
                if branch_ref:
                    target = branch_ref.get("target", {})
                    tree = target.get("tree", {})
                    entries = tree.get("entries", [])
                    file_list = _extract_file_tree(entries)
            except Exception:
                pass

            repos.append({
                "name": repo.get("name", ""),
                "description": repo.get("description", "") or "",
                "url": repo.get("url", ""),
                "language": repo.get("primaryLanguage", {}).get("name", "Unknown") if repo.get("primaryLanguage") else "Unknown",
                "stars": repo.get("stargazerCount", 0),
                "forks": repo.get("forkCount", 0),
                "pushed_at": repo.get("pushedAt", ""),
                "readme": readme_text,
                "topics": topics,
                "file_list": file_list[:100],  # Cap at 100 files
            })

        return {"login": login, "repos": repos}


# ---------- Enhanced AI Code Review ----------

def review_repo(repo: dict, target_company: str = "a top tech company") -> dict:
    """
    Generate a deep AI code review for a single repo using OpenAI.
    Returns structured review with scores, skills, issues, and interview talking points.
    """
    file_structure = ", ".join(repo.get("file_list", [])[:50]) or "unknown"
    topics = ", ".join(repo.get("topics", [])) or "none"

    prompt = f"""You are a senior {target_company} engineer conducting a code review.
Repository: '{repo['name']}', language: '{repo['language']}', topics: [{topics}],
file structure: [{file_structure}],
README: '{repo['readme'][:1500]}'

Analyse deeply and return ONLY valid JSON:
{{
  "code_quality": 0-10,
  "documentation": 0-10,
  "complexity": 0-10,
  "security": 0-10,
  "testing": 0-10,
  "overall_score": 0-10,
  "architecture_pattern": "string describing the architecture pattern used",
  "design_patterns_used": ["string"],
  "skills_demonstrated": [
    {{ "skill": "string", "proficiency": "beginner/intermediate/advanced", "evidence": "string" }}
  ],
  "issues": [
    {{ "severity": "high/medium/low", "category": "bugs/security/performance/style", "title": "string", "description": "string", "fix": "string" }}
  ],
  "strengths": ["string"],
  "what_this_shows_about_candidate": "string",
  "interview_talking_points": ["2-3 specific things about this repo that would make strong interview questions"]
}}"""

    try:
        result = chat_completion_json(prompt, temperature=0.0)
        return result
    except Exception as e:
        print(f"  ⚠️ Review failed for {repo['name']}: {e}")
        return {
            "code_quality": 5, "documentation": 5, "complexity": 5,
            "security": 5, "testing": 5, "overall_score": 5,
            "architecture_pattern": "unknown",
            "design_patterns_used": [],
            "skills_demonstrated": [{"skill": repo["language"], "proficiency": "intermediate", "evidence": "Primary language"}],
            "issues": [], "strengths": ["Code exists"],
            "what_this_shows_about_candidate": "Has coding experience",
            "interview_talking_points": [f"Tell me about your {repo['name']} project"],
        }


def review_all_repos(repos: list[dict], target_company: str = "a top tech company") -> list[dict]:
    """Review all repos and return a list of reviews."""
    reviews = []
    for repo in repos:
        print(f"  🔍 Reviewing: {repo['name']}...")
        review = review_repo(repo, target_company)
        review["repo_name"] = repo["name"]
        review["repo_url"] = repo.get("url", "")
        review["language"] = repo["language"]
        reviews.append(review)
    return reviews


# ---------- Aggregated Company Assessment ----------

def generate_aggregated_assessment(
    reviews: list[dict],
    parsed_resume: dict,
    target_company: str = "a top tech company",
    target_role: str = "Software Engineer",
) -> dict:
    """
    Generate an aggregated company-specific assessment with skill verification.
    Cross-references resume claims against actual GitHub code.
    """
    # Build summaries for the prompt
    repo_summaries = []
    for r in reviews:
        repo_summaries.append({
            "name": r.get("repo_name", ""),
            "language": r.get("language", ""),
            "score": r.get("overall_score", 0),
            "strengths": r.get("strengths", []),
            "skills": [s.get("skill", "") for s in r.get("skills_demonstrated", [])],
            "architecture": r.get("architecture_pattern", ""),
        })

    # Resume skills for cross-reference
    resume_skills = []
    skills = parsed_resume.get("skills", {})
    for cat in ["technical", "tools", "languages"]:
        resume_skills.extend(skills.get(cat, []))

    prompt = f"""Given these GitHub repository analyses for a student targeting {target_role} at {target_company}:
{json.dumps(repo_summaries, indent=2)}

Resume claimed skills: {json.dumps(resume_skills)}

Return ONLY valid JSON:
{{
  "overall_github_score": 0-100,
  "skill_verification": [
    {{ "skill": "string", "claimed_on_resume": true/false, "verified_in_code": true/false, "proficiency_level": "beginner/intermediate/advanced", "evidence_repo": "string" }}
  ],
  "company_fit_assessment": "string",
  "top_3_strengths": ["string"],
  "top_3_improvements": ["string"],
  "recommended_projects_to_build": ["string"]
}}"""

    try:
        return chat_completion_json(prompt, temperature=0.0)
    except Exception as e:
        print(f"  ⚠️ Aggregated assessment failed: {e}")
        return {
            "overall_github_score": calculate_github_score(reviews),
            "skill_verification": [],
            "company_fit_assessment": "Could not generate assessment",
            "top_3_strengths": [],
            "top_3_improvements": [],
            "recommended_projects_to_build": [],
        }


# ---------- Skill Verification ----------

def verify_skills(reviews: list[dict], parsed_resume: dict) -> dict:
    """
    Compare skills detected from code reviews against resume skills.
    Returns verified/unverified skill lists.
    """
    # Gather all detected skills from reviews
    detected = set()
    for review in reviews:
        for skill in review.get("skills_detected", []):
            detected.add(skill.lower().strip())
        # Also check skills_demonstrated
        for sd in review.get("skills_demonstrated", []):
            detected.add(sd.get("skill", "").lower().strip())

    # Gather resume skills
    skills = parsed_resume.get("skills", {})
    resume_skills = set()
    for category in ["technical", "tools", "languages", "soft_skills"]:
        for skill in skills.get(category, []):
            resume_skills.add(skill.lower().strip())

    # Classify
    verified = sorted([s for s in resume_skills if s in detected])
    unverified = sorted([s for s in resume_skills if s not in detected])
    new_from_code = sorted([s for s in detected if s not in resume_skills and s])

    return {
        "verified_skills": verified,
        "unverified_skills": unverified,
        "new_skills_from_code": new_from_code,
        "verification_rate": round(len(verified) / max(len(resume_skills), 1) * 100, 1),
    }


# ---------- GitHub Score ----------

def calculate_github_score(reviews: list[dict]) -> float:
    """
    Calculate GitHub score as average of all repo overall_scores, scaled to 100.
    """
    if not reviews:
        return 0.0

    total = sum(r.get("overall_score", 0) for r in reviews)
    avg = total / len(reviews)
    return round(avg * 10, 1)  # Scale 0-10 to 0-100


# ---------- Full Pipeline ----------

async def run_github_pipeline(
    access_token: str,
    parsed_resume: dict,
    target_company: str = "a top tech company",
    target_role: str = "Software Engineer",
) -> dict:
    """
    Full GitHub analysis pipeline:
    1. Fetch repos via GraphQL (includes file tree, topics)
    2. AI-review each repo (with interview_talking_points)
    3. Verify skills against resume
    4. Generate aggregated company-specific assessment
    5. Calculate GitHub score
    6. Extract interview context
    """
    # 1. Fetch repos
    print("📡 Fetching GitHub repos...")
    github_data = await fetch_github_repos(access_token)

    if not github_data["repos"]:
        return {
            "login": github_data["login"],
            "repos": [],
            "reviews": [],
            "skill_verification": {"verified_skills": [], "unverified_skills": [], "new_skills_from_code": [], "verification_rate": 0},
            "aggregated_assessment": {},
            "github_score": 0,
            "interview_talking_points": [],
            "error": "No public repositories found",
        }

    # 2. Review each repo
    print(f"🔍 Reviewing {len(github_data['repos'])} repos...")
    reviews = review_all_repos(github_data["repos"], target_company)

    # 3. Verify skills
    print("✅ Verifying skills...")
    skill_verification = verify_skills(reviews, parsed_resume)

    # 4. Aggregated assessment
    print("📊 Generating aggregated assessment...")
    aggregated = generate_aggregated_assessment(reviews, parsed_resume, target_company, target_role)

    # 5. Calculate score — prefer aggregated, fallback to computed
    github_score = aggregated.get("overall_github_score", calculate_github_score(reviews))
    if isinstance(github_score, str):
        try:
            github_score = float(github_score)
        except ValueError:
            github_score = calculate_github_score(reviews)
    print(f"📊 GitHub Score: {github_score}/100")

    # 6. Extract interview talking points across all repos
    interview_talking_points = []
    for review in reviews:
        points = review.get("interview_talking_points", [])
        if isinstance(points, list):
            interview_talking_points.extend(points)

    return {
        "login": github_data["login"],
        "repos": github_data["repos"],
        "reviews": reviews,
        "skill_verification": skill_verification,
        "aggregated_assessment": aggregated,
        "github_score": github_score,
        "interview_talking_points": interview_talking_points,
    }
