"""
FastAPI main application for the HireReady Resume Intelligence API.
Wires all services together and exposes REST endpoints.
"""

import os
import time
import json
from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

load_dotenv()

from services.pdf_extractor import extract_text_from_pdf
from services.resume_parser import parse_resume
from services.latex_generator import generate_latex, generate_plain_text
from services.ats_scorer import calculate_ats_score
from services.semantic_matcher import perform_semantic_match
from services.suggestion_engine import generate_suggestions
from services.db_service import (
    ensure_user_profile,
    save_resume_analysis,
    get_user_resumes,
    get_resume_by_id,
    save_error_status,
)

# ---------- App Setup ----------

app = FastAPI(
    title="HireReady API",
    description="Resume Intelligence API — ATS scoring, semantic matching, and AI-powered suggestions",
    version="1.0.0",
)

# Support comma-separated origins for production (e.g. "https://hireready.com,https://www.hireready.com")
_frontend_origins = os.getenv("FRONTEND_URL", "http://localhost:5173")
ALLOWED_ORIGINS = [o.strip() for o in _frontend_origins.split(",") if o.strip()]
# Always include localhost for local dev
for _local in ["http://localhost:5173", "http://localhost:3000"]:
    if _local not in ALLOWED_ORIGINS:
        ALLOWED_ORIGINS.append(_local)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- RAG Auto-Seed on Startup ----------

@app.on_event("startup")
async def startup():
    """Auto-seed ChromaDB with job roles if empty."""
    try:
        from rag.setup import get_job_roles_collection
        collection = get_job_roles_collection()
        if collection.count() == 0:
            print("📦 ChromaDB is empty — seeding job roles...")
            import subprocess
            subprocess.run(["python", "-m", "rag.seed"], cwd=os.path.dirname(__file__))
            print("✅ ChromaDB seeded successfully.")
        else:
            print(f"✅ ChromaDB already has {collection.count()} job roles.")
    except Exception as e:
        print(f"⚠️ ChromaDB seed check failed (non-fatal): {e}")


# ---------- PlaceScore Auto-Update Helper ----------

async def _auto_update_placescore(uid: str):
    """Recalculate and persist PlaceScore after any segment completes."""
    try:
        from services.db_service import (
            get_latest_resume_scores,
            get_github_analysis,
            get_latest_interview_score,
            save_placescore,
        )
        resume_scores = await get_latest_resume_scores(uid)
        ats = resume_scores.get("ats_score", 0)

        gh = await get_github_analysis(uid)
        gh_score = gh.get("github_score", 0) if gh else 0

        iv_score = await get_latest_interview_score(uid)

        ps = round(ats * 0.3 + gh_score * 0.3 + iv_score * 0.4, 1)
        await save_placescore(uid, {
            "placescore": ps,
            "ats_score": ats,
            "github_score": gh_score,
            "interview_score": iv_score,
        })
        print(f"📊 PlaceScore auto-updated for {uid}: {ps}")
    except Exception as e:
        print(f"⚠️ PlaceScore auto-update failed (non-fatal): {e}")


# ---------- Routes ----------

@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "service": "HireReady Resume Intelligence API", "version": "1.0.0"}


@app.post("/analyse-resume")
async def analyse_resume(
    file: UploadFile = File(...),
    company: str = Form(...),
    job_title: str = Form(...),
    uid: str = Form(...),
):
    """
    Full resume analysis pipeline.
    Accepts a PDF file, company name, job title, and user ID.
    Runs: extract → parse → latex → ats_score → semantic_match → suggestions → save.
    Returns complete analysis JSON.
    """
    partial_data = {
        "original_filename": file.filename or "resume.pdf",
        "target_company": company,
        "target_job_title": job_title,
    }

    # Validate file type
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are accepted. Please upload a .pdf file."
        )

    try:
        # Step 1: Extract text from PDF
        pdf_bytes = await file.read()
        if len(pdf_bytes) == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")
        if len(pdf_bytes) > 10 * 1024 * 1024:  # 10MB limit
            raise HTTPException(status_code=400, detail="File too large. Maximum size is 10MB.")

        extracted_text = extract_text_from_pdf(pdf_bytes)

        # Step 1b: Compute resume hash for caching
        from services.ats_scorer import compute_resume_hash
        from services.db_service import get_cached_ats_result, save_cached_ats_result
        resume_hash = compute_resume_hash(extracted_text)
        from_cache = False

        # Step 2: Parse resume structure (1 API call)
        parsed_data = parse_resume(extracted_text)

        # Step 3: Generate LaTeX (no API calls)
        latex_code = generate_latex(parsed_data)
        plain_text = generate_plain_text(parsed_data)

        # Step 4-6: Check cache first
        cached = await get_cached_ats_result(resume_hash, company, job_title)
        if cached:
            ats_score = cached.get("ats_score", {})
            semantic_match = cached.get("semantic_match", {})
            suggestions = cached.get("suggestions", [])
            from_cache = True
            print(f"✅ ATS cache hit for {resume_hash[:8]}... — returning identical results")
        else:
            # Step 4: Calculate ATS score (2 API calls + 2 embeds — keywords now algorithmic)
            ats_score = calculate_ats_score(parsed_data, plain_text, company, job_title)

            # Step 5: Semantic matching (3 API calls + 2 embeds)
            semantic_match = perform_semantic_match(parsed_data, company, job_title)

            # Step 6: Generate suggestions (1 API call)
            suggestions = generate_suggestions(
                parsed_data, ats_score, semantic_match, company, job_title
            )

            # Cache the result for future identical submissions
            try:
                await save_cached_ats_result(resume_hash, company, job_title, {
                    "ats_score": ats_score,
                    "semantic_match": semantic_match,
                    "suggestions": suggestions,
                })
            except Exception:
                pass

        # Step 7: Ensure user profile exists (non-blocking)
        resume_id = "local_" + str(int(time.time()))
        try:
            personal = parsed_data.get("personal", {})
            await ensure_user_profile(
                uid,
                name=personal.get("name", ""),
                email=personal.get("email", ""),
            )

            # Step 8: Save to Firestore
            save_data = {
                "original_filename": file.filename or "resume.pdf",
                "storage_url": "",
                "target_company": company,
                "target_job_title": job_title,
                "parsed_data": parsed_data,
                "latex_code": latex_code,
                "ats_score": ats_score,
                "semantic_match": semantic_match,
                "suggestions": suggestions,
                "processing_status": "complete",
                "resume_hash": resume_hash,
            }

            resume_id = await save_resume_analysis(uid, save_data)
            # Auto-update PlaceScore
            await _auto_update_placescore(uid)
        except Exception as db_err:
            print(f"Warning: Could not save to Firestore (analysis still returned): {db_err}")

        # Return complete analysis (even if DB save failed)
        return {
            "success": True,
            "resume_id": resume_id,
            "target_company": company,
            "target_job_title": job_title,
            "parsed_data": parsed_data,
            "latex_code": latex_code,
            "ats_score": ats_score,
            "semantic_match": semantic_match,
            "suggestions": suggestions,
            "from_cache": from_cache,
        }

    except HTTPException:
        raise
    except Exception as e:
        # Save error status to DB
        try:
            await save_error_status(uid, str(e), partial_data)
        except Exception:
            pass
        raise HTTPException(
            status_code=500,
            detail=f"Resume analysis pipeline failed: {str(e)}"
        )


@app.get("/resume-history/{uid}")
async def resume_history(uid: str):
    """
    Get all previous resume analyses for a user.
    Returns a list of analysis summaries ordered by submission date.
    """
    if not uid or uid.strip() == "":
        raise HTTPException(status_code=400, detail="User ID is required.")

    history = await get_user_resumes(uid)
    return {"success": True, "resumes": history}


@app.get("/resume/{uid}/{resume_id}")
async def get_resume(uid: str, resume_id: str):
    """
    Get full analysis for a specific resume submission.
    """
    if not uid or not resume_id:
        raise HTTPException(status_code=400, detail="User ID and Resume ID are required.")

    result = await get_resume_by_id(uid, resume_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Resume analysis not found.")

    return {"success": True, "data": result}


@app.post("/download-latex")
async def download_latex(uid: str = Form(...), resume_id: str = Form(...)):
    """
    Download the LaTeX file for a specific resume analysis.
    Returns the LaTeX as a downloadable .tex file.
    """
    if not uid or not resume_id:
        raise HTTPException(status_code=400, detail="User ID and Resume ID are required.")

    result = await get_resume_by_id(uid, resume_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Resume analysis not found.")

    latex_code = result.get("latex_code", "")
    if not latex_code:
        raise HTTPException(status_code=404, detail="No LaTeX code found for this resume.")

    filename = f"resume_{resume_id[:8]}.tex"

    return Response(
        content=latex_code.encode("utf-8"),
        media_type="application/x-tex",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


# ---------- GitHub Routes ----------

from services.github_service import (
    get_github_auth_url,
    exchange_code_for_token,
    run_github_pipeline,
)
from services.db_service import (
    save_github_token,
    get_github_token,
    save_github_analysis,
    get_github_analysis,
    save_placescore,
    get_placescore,
    get_latest_resume_scores,
)


@app.get("/github/auth")
async def github_auth():
    """Return the GitHub OAuth authorization URL."""
    try:
        url = get_github_auth_url()
        return {"success": True, "auth_url": url}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"GitHub auth setup failed: {str(e)}")


@app.get("/github/callback")
async def github_callback(code: str, state: str = ""):
    """Handle GitHub OAuth callback — exchange code for token."""
    try:
        token = await exchange_code_for_token(code)
        # Return HTML that sends the token to the opener window
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
        html = f"""
        <html><body><script>
            window.opener.postMessage({{ type: 'github-token', token: '{token}' }}, '{frontend_url}');
            window.close();
        </script><p>Authenticating... this window will close automatically.</p></body></html>
        """
        return Response(content=html, media_type="text/html")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"GitHub callback failed: {str(e)}")


@app.post("/github/sync")
async def github_sync(
    uid: str = Form(...),
    github_token: str = Form(...),
    target_company: str = Form("a top tech company"),
):
    """
    Sync GitHub repos, run AI code review, verify skills, calculate score.
    """
    if not uid or not github_token:
        raise HTTPException(status_code=400, detail="uid and github_token are required")

    try:
        # Save token
        await save_github_token(uid, github_token)

        # Get user's parsed resume for skill verification
        from services.db_service import get_user_resumes, get_resume_by_id
        resumes = await get_user_resumes(uid)
        parsed_resume = {}
        if resumes:
            latest = await get_resume_by_id(uid, resumes[0]["resume_id"])
            if latest:
                parsed_resume = latest.get("parsed_data", {})

        # Run pipeline
        result = await run_github_pipeline(github_token, parsed_resume, target_company)

        # Save to Firestore (non-blocking)
        try:
            await save_github_analysis(uid, result)
            # Save interview talking points for the interview engine
            from services.db_service import save_github_interview_context
            talking_points = result.get("interview_talking_points", [])
            if talking_points:
                await save_github_interview_context(uid, talking_points)
            # Auto-update PlaceScore
            await _auto_update_placescore(uid)
        except Exception as db_err:
            print(f"Warning: Could not save GitHub analysis: {db_err}")

        return {"success": True, **result}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"GitHub sync failed: {str(e)}")


@app.get("/github/results/{uid}")
async def github_results(uid: str):
    """Get stored GitHub analysis for a user."""
    try:
        result = await get_github_analysis(uid)
        if result is None:
            return {"success": True, "data": None, "message": "No GitHub analysis found. Sync your GitHub first."}
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch GitHub results: {str(e)}")


# ---------- PlaceScore Routes ----------

@app.get("/placescore/{uid}")
async def get_user_placescore(uid: str):
    """Get PlaceScore for a user. Calculates from all three segments."""
    try:
        # Get latest resume ATS score
        resume_scores = await get_latest_resume_scores(uid)
        ats_score = resume_scores.get("ats_score", 0)

        # Get GitHub score
        github_data = await get_github_analysis(uid)
        github_score = github_data.get("github_score", 0) if github_data else 0

        # Get interview score
        interview_score = await get_latest_interview_score(uid)

        # PlaceScore formula: (ATS×0.3) + (GitHub×0.3) + (Interview×0.4)
        placescore = round(ats_score * 0.3 + github_score * 0.3 + interview_score * 0.4, 1)

        score_data = {
            "placescore": placescore,
            "ats_score": ats_score,
            "github_score": github_score,
            "interview_score": interview_score,
            "breakdown": {
                "resume_contribution": round(ats_score * 0.3, 1),
                "github_contribution": round(github_score * 0.3, 1),
                "interview_contribution": round(interview_score * 0.4, 1),
            }
        }

        return {"success": True, **score_data}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PlaceScore calculation failed: {str(e)}")


@app.post("/placescore/{uid}/update")
async def update_user_placescore(uid: str):
    """Recalculate and save PlaceScore."""
    try:
        # Same calculation as GET
        resume_scores = await get_latest_resume_scores(uid)
        ats_score = resume_scores.get("ats_score", 0)

        github_data = await get_github_analysis(uid)
        github_score = github_data.get("github_score", 0) if github_data else 0

        interview_score = await get_latest_interview_score(uid)

        placescore = round(ats_score * 0.3 + github_score * 0.3 + interview_score * 0.4, 1)

        score_data = {
            "placescore": placescore,
            "ats_score": ats_score,
            "github_score": github_score,
            "interview_score": interview_score,
        }

        await save_placescore(uid, score_data)

        return {"success": True, **score_data}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PlaceScore update failed: {str(e)}")


# ---------- Interview Routes ----------

from services.interview_service import (
    generate_interview_questions,
    evaluate_answer,
    generate_session_report,
)
from services.db_service import (
    save_interview_session,
    get_interview_sessions,
    get_latest_interview_score,
)


@app.post("/interview/generate-questions")
async def interview_generate_questions(
    uid: str = Form(...),
    company: str = Form("Google"),
    job_title: str = Form("Software Engineer"),
    domain: str = Form("Software Engineering"),
    difficulty: str = Form("intermediate"),
):
    """Generate interview questions tailored to the user's resume + GitHub + skills."""
    try:
        # Get user's latest resume
        resumes = await get_user_resumes(uid)
        parsed_resume = {}
        if resumes:
            latest = await get_resume_by_id(uid, resumes[0]["resume_id"])
            if latest:
                parsed_resume = latest.get("parsed_data", {})

        # Fetch GitHub interview context and skill verification
        from services.db_service import get_github_interview_context, get_github_analysis
        github_context = await get_github_interview_context(uid)
        skill_verification = []
        try:
            gh_analysis = await get_github_analysis(uid)
            if gh_analysis:
                agg = gh_analysis.get("aggregated_assessment", {})
                skill_verification = agg.get("skill_verification", [])
        except Exception:
            pass

        questions = generate_interview_questions(
            parsed_resume, company, job_title, domain, difficulty,
            github_context=github_context,
            skill_verification=skill_verification,
        )
        return {"success": True, "questions": questions}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Question generation failed: {str(e)}")


@app.post("/interview/evaluate-answer")
async def interview_evaluate_answer(
    question: str = Form(...),
    hint: str = Form(""),
    transcript: str = Form(...),
    company: str = Form("Google"),
    ideal_points: str = Form(""),
):
    """Evaluate a single interview answer."""
    try:
        # Parse ideal_points if sent as JSON string
        parsed_points = []
        if ideal_points:
            try:
                parsed_points = json.loads(ideal_points)
            except json.JSONDecodeError:
                pass
        result = evaluate_answer(question, hint, transcript, company, ideal_points=parsed_points)
        return {"success": True, **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Answer evaluation failed: {str(e)}")


@app.post("/interview/submit-session")
async def interview_submit_session(
    uid: str = Form(...),
    company: str = Form(...),
    job_title: str = Form(...),
    scores_json: str = Form(...),
    eye_contact_pct: float = Form(0.0),
    filler_count: int = Form(0),
):
    """Submit a complete interview session and generate report."""
    try:
        question_scores = json.loads(scores_json)

        # Generate report
        report = generate_session_report(
            company, job_title, question_scores, eye_contact_pct, filler_count
        )

        # Save session
        session_data = {
            "company": company,
            "job_title": job_title,
            "question_scores": question_scores,
            "eye_contact_pct": eye_contact_pct,
            "filler_count": filler_count,
            "report": report,
        }
        session_id = await save_interview_session(uid, session_data)

        # Auto-update PlaceScore
        await _auto_update_placescore(uid)

        return {"success": True, "session_id": session_id, "report": report}

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="scores_json must be valid JSON")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Session submission failed: {str(e)}")


@app.get("/interview/sessions/{uid}")
async def interview_sessions(uid: str):
    """Get all interview sessions for a user."""
    try:
        sessions = await get_interview_sessions(uid)
        return {"success": True, "sessions": sessions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get sessions: {str(e)}")


# ---------- Job Recommendations Routes ----------

@app.post("/recommendations")
async def get_recommendations(payload: dict):
    """
    Generate job role and company recommendations based on resume analysis.
    Accepts parsed_data and ats_score, returns 5 roles + 6 companies.
    """
    from services.openai_client import chat_completion_json

    parsed_data = payload.get("parsed_data", {})
    ats_score = payload.get("ats_score", {})

    # Build compact resume summary for the prompt
    skills = parsed_data.get("skills", {})
    tech_skills = skills.get("technical", [])
    tools = skills.get("tools", [])
    experience = parsed_data.get("experience", [])
    education = parsed_data.get("education", [])
    projects = parsed_data.get("projects", [])

    resume_summary = {
        "skills": tech_skills[:10] + tools[:5],
        "experience": [{"title": e.get("title", ""), "company": e.get("company", "")} for e in experience[:3]],
        "education": [{"degree": ed.get("degree", ""), "institution": ed.get("institution", "")} for ed in education[:2]],
        "projects": [{"name": p.get("name", ""), "tech": p.get("technologies", [])} for p in projects[:4]],
        "ats_score": ats_score.get("total_score", 0),
    }

    prompt = f"""Based on this candidate's resume profile, recommend job roles and companies.
Profile: {json.dumps(resume_summary)}

Return ONLY valid JSON:
{{
  "recommended_roles": [
    {{
      "title": "string",
      "match_percentage": 0-100,
      "salary_range_inr": "string (e.g. 6-12 LPA)",
      "why_match": "string",
      "skills_you_have": ["string"],
      "skills_to_learn": ["string"]
    }}
  ],
  "recommended_companies": [
    {{
      "name": "string",
      "match_percentage": 0-100,
      "why_fit": "string",
      "roles_hiring": ["string"],
      "culture_match": "string",
      "linkedin_search_query": "string (URL-safe query for LinkedIn jobs search)"
    }}
  ]
}}

Rules:
- Return exactly 5 recommended_roles and 6 recommended_companies
- Roles should be realistic for an Indian engineering student
- Companies should include mix of MNCs, Indian startups, and mid-size firms
- Salary ranges should be realistic Indian market ranges in LPA
- linkedin_search_query should be a URL-encoded search term for LinkedIn"""

    try:
        result = chat_completion_json(prompt, temperature=0.7)
        return {"success": True, **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Recommendations failed: {str(e)}")


# ---------- Leaderboard Routes ----------

from services.db_service import get_leaderboard


@app.get("/leaderboard")
async def leaderboard(company: str = ""):
    """
    Get the top 50 candidates ranked by PlaceScore.
    Optionally filter by target company name (partial match).
    This endpoint is public — companies can view without auth.
    """
    try:
        candidates = await get_leaderboard(company_filter=company)
        return {"success": True, "candidates": candidates, "total": len(candidates)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Leaderboard failed: {str(e)}")

@app.post("/leaderboard/match-jd")
async def leaderboard_match_jd(payload: dict):
    """
    Match a company's Job Description against all candidates.
    Embeds the JD, compares it to each candidate's stored resume data,
    and returns candidates ranked by a blended JD-match + PlaceScore.
    """
    job_description = payload.get("job_description", "").strip()
    if not job_description or len(job_description) < 20:
        raise HTTPException(status_code=400, detail="Job description must be at least 20 characters")

    try:
        from services.openai_client import embed_text
        from services.db_service import get_leaderboard, _get_db
        import numpy as np

        # 1. Embed the JD once
        jd_embedding = embed_text(job_description)

        # 2. Get all candidates with PlaceScore
        candidates = await get_leaderboard()

        if not candidates:
            return {"success": True, "candidates": [], "total": 0, "mode": "jd_match"}

        # 3. For each candidate, fetch their latest parsed_data and compute cosine sim
        db = _get_db()
        matched = []

        for c in candidates:
            uid = c["uid"]
            resume_text = ""

            try:
                # Fetch latest resume's parsed_data
                if db:
                    resumes = list(
                        db.collection("users").document(uid)
                        .collection("resumes")
                        .order_by("submitted_at", direction="DESCENDING")
                        .limit(1)
                        .stream()
                    )
                    if resumes:
                        r_data = resumes[0].to_dict()
                        parsed = r_data.get("parsed_data", {})

                        # Build quick summary text for embedding
                        parts = []
                        if parsed.get("summary"):
                            parts.append(parsed["summary"])
                        skills = parsed.get("skills", {})
                        all_skills = (
                            skills.get("technical", []) + skills.get("tools", []) +
                            skills.get("languages", [])
                        )
                        if all_skills:
                            parts.append("Skills: " + ", ".join(all_skills))
                        for proj in parsed.get("projects", []):
                            parts.append(f"{proj.get('name','')}: {proj.get('description','')}")
                        for exp in parsed.get("experience", []):
                            parts.append(f"{exp.get('title','')} at {exp.get('company','')}")
                        resume_text = " | ".join(parts)
            except Exception:
                pass

            if not resume_text:
                continue

            # Embed resume text and compute cosine similarity
            try:
                resume_embedding = embed_text(resume_text)
                a = np.array(jd_embedding, dtype=np.float64)
                b = np.array(resume_embedding, dtype=np.float64)
                cosine = float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))
                jd_match = round(max(0, min(100, cosine * 100)), 1)
            except Exception:
                jd_match = 0.0

            # Blended score: 60% JD match + 40% PlaceScore
            blended = round(jd_match * 0.6 + c["placescore"] * 0.4, 1)
            c["jd_match_score"] = jd_match
            c["blended_score"] = blended
            matched.append(c)

        # Sort by blended score descending
        matched.sort(key=lambda x: x["blended_score"], reverse=True)

        # Re-rank
        for i, c in enumerate(matched):
            c["rank"] = i + 1

        return {"success": True, "candidates": matched[:50], "total": len(matched), "mode": "jd_match"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"JD match failed: {str(e)}")


# ---------- Run ----------

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
