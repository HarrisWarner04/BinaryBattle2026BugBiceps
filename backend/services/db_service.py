"""
Firebase Firestore database service.
Handles all database operations for user profiles and resume analyses.
"""

import os
import json
from datetime import datetime, timezone
from typing import Optional

import firebase_admin
from firebase_admin import credentials, firestore, storage
from fastapi import HTTPException


# Initialize Firebase Admin SDK
# Uses Application Default Credentials or service account JSON
_firebase_app = None
_db = None
_bucket = None


def _init_firebase():
    """Initialize Firebase Admin SDK if not already initialized."""
    global _firebase_app, _db, _bucket

    if _firebase_app is not None:
        return

    try:
        # Check if a service account JSON is available
        service_account_path = os.path.join(
            os.path.dirname(os.path.dirname(__file__)),
            "firebase-service-account.json"
        )

        if os.path.exists(service_account_path):
            cred = credentials.Certificate(service_account_path)
            _firebase_app = firebase_admin.initialize_app(cred, {
                "storageBucket": os.getenv("FIREBASE_STORAGE_BUCKET", ""),
            })
        else:
            # Use default credentials (for Cloud Run, etc.)
            try:
                _firebase_app = firebase_admin.get_app()
            except ValueError:
                _firebase_app = firebase_admin.initialize_app()

        _db = firestore.client()

    except Exception as e:
        print(f"Warning: Firebase initialization failed: {e}")
        print("Running without Firebase. Data will not be persisted.")
        _db = None


def _get_db():
    """Get the Firestore client, initializing if needed."""
    global _db
    if _db is None:
        _init_firebase()
    return _db


def _serialize_for_firestore(data: dict) -> dict:
    """
    Recursively convert data to Firestore-compatible format.
    Handles numpy types and other non-serializable objects.
    """
    import numpy as np

    if isinstance(data, dict):
        return {k: _serialize_for_firestore(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [_serialize_for_firestore(item) for item in data]
    elif isinstance(data, (np.integer,)):
        return int(data)
    elif isinstance(data, (np.floating,)):
        return float(data)
    elif isinstance(data, np.ndarray):
        return data.tolist()
    else:
        return data


async def ensure_user_profile(uid: str, name: str = "", email: str = ""):
    """
    Ensure a user profile exists in Firestore.
    Creates one if it doesn't exist, updates last_updated if it does.
    """
    db = _get_db()
    if db is None:
        return

    try:
        user_ref = db.collection("users").document(uid)
        doc = user_ref.get()

        if not doc.exists:
            user_ref.set({
                "profile": {
                    "name": name,
                    "email": email,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "last_updated": datetime.now(timezone.utc).isoformat(),
                }
            })
        else:
            user_ref.update({
                "profile.last_updated": datetime.now(timezone.utc).isoformat(),
            })
    except Exception as e:
        print(f"Warning: Could not update user profile: {e}")


async def save_resume_analysis(uid: str, data: dict) -> str:
    """
    Save a complete resume analysis to Firestore.
    Creates a new document under users/{uid}/resumes/ with a unique ID.

    Args:
        uid: Firebase user ID.
        data: Complete analysis data containing all fields.

    Returns:
        The generated resume document ID.

    Raises:
        HTTPException: If saving fails.
    """
    db = _get_db()
    if db is None:
        # Fallback: generate a local ID and skip DB save
        import uuid
        return str(uuid.uuid4())

    try:
        # Serialize data for Firestore
        serialized = _serialize_for_firestore(data)

        resumes_ref = db.collection("users").document(uid).collection("resumes")
        doc_ref = resumes_ref.document()
        resume_id = doc_ref.id

        doc_data = {
            "original_filename": serialized.get("original_filename", "resume.pdf"),
            "storage_url": serialized.get("storage_url", ""),
            "target_company": serialized.get("target_company", ""),
            "target_job_title": serialized.get("target_job_title", ""),
            "submitted_at": datetime.now(timezone.utc).isoformat(),
            "parsed_data": serialized.get("parsed_data", {}),
            "latex_code": serialized.get("latex_code", ""),
            "ats_score": serialized.get("ats_score", {}),
            "semantic_match": serialized.get("semantic_match", {}),
            "suggestions": serialized.get("suggestions", []),
            "processing_status": serialized.get("processing_status", "complete"),
        }

        doc_ref.set(doc_data)

        return resume_id

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save resume analysis to database: {str(e)}"
        )


async def get_user_resumes(uid: str) -> list[dict]:
    """
    Get all resume analyses for a user, ordered by submission date.

    Args:
        uid: Firebase user ID.

    Returns:
        List of resume analysis summaries.
    """
    db = _get_db()
    if db is None:
        return []

    try:
        resumes_ref = (
            db.collection("users")
            .document(uid)
            .collection("resumes")
            .order_by("submitted_at", direction=firestore.Query.DESCENDING)
        )

        docs = resumes_ref.stream()
        results = []

        for doc in docs:
            data = doc.to_dict()
            results.append({
                "resume_id": doc.id,
                "original_filename": data.get("original_filename", ""),
                "target_company": data.get("target_company", ""),
                "target_job_title": data.get("target_job_title", ""),
                "submitted_at": data.get("submitted_at", ""),
                "ats_score": data.get("ats_score", {}).get("total_score", 0),
                "grade": data.get("ats_score", {}).get("grade", "N/A"),
                "semantic_match_percentage": data.get("semantic_match", {}).get("semantic_match_percentage", 0),
                "processing_status": data.get("processing_status", "unknown"),
            })

        return results

    except Exception as e:
        print(f"Warning: Could not fetch user resumes: {e}")
        return []


async def get_resume_by_id(uid: str, resume_id: str) -> Optional[dict]:
    """
    Get a specific resume analysis by its ID.

    Args:
        uid: Firebase user ID.
        resume_id: Resume document ID.

    Returns:
        Full resume analysis dict, or None if not found.
    """
    db = _get_db()
    if db is None:
        return None

    try:
        doc_ref = (
            db.collection("users")
            .document(uid)
            .collection("resumes")
            .document(resume_id)
        )
        doc = doc_ref.get()

        if not doc.exists:
            return None

        data = doc.to_dict()
        data["resume_id"] = doc.id
        return data

    except Exception as e:
        print(f"Warning: Could not fetch resume: {e}")
        return None


async def save_error_status(uid: str, error_message: str, partial_data: dict = None) -> str:
    """
    Save a resume analysis with error status when the pipeline fails.

    Args:
        uid: Firebase user ID.
        error_message: Description of what went wrong.
        partial_data: Any partial data that was collected before the error.

    Returns:
        The generated resume document ID.
    """
    db = _get_db()
    if db is None:
        import uuid
        return str(uuid.uuid4())

    try:
        resumes_ref = db.collection("users").document(uid).collection("resumes")
        doc_ref = resumes_ref.document()

        doc_data = {
            "submitted_at": datetime.now(timezone.utc).isoformat(),
            "processing_status": "error",
            "error_message": error_message,
            "target_company": (partial_data or {}).get("target_company", ""),
            "target_job_title": (partial_data or {}).get("target_job_title", ""),
            "original_filename": (partial_data or {}).get("original_filename", ""),
        }

        doc_ref.set(doc_data)
        return doc_ref.id

    except Exception:
        import uuid
        return str(uuid.uuid4())


# ---------- GitHub Functions ----------

async def save_github_token(uid: str, token: str):
    """Save GitHub access token for a user."""
    db = _get_db()
    if db is None:
        return
    try:
        db.collection("users").document(uid).set(
            {"github_token": token}, merge=True
        )
    except Exception as e:
        print(f"Warning: Could not save GitHub token: {e}")


async def get_github_token(uid: str) -> Optional[str]:
    """Get stored GitHub access token for a user."""
    db = _get_db()
    if db is None:
        return None
    try:
        doc = db.collection("users").document(uid).get()
        if doc.exists:
            return doc.to_dict().get("github_token")
        return None
    except Exception as e:
        print(f"Warning: Could not get GitHub token: {e}")
        return None


async def save_github_analysis(uid: str, data: dict):
    """Save GitHub analysis results for a user."""
    db = _get_db()
    if db is None:
        return
    try:
        serialized = _serialize_for_firestore(data)
        serialized["updated_at"] = datetime.now(timezone.utc).isoformat()
        db.collection("users").document(uid).set(
            {"github_analysis": serialized}, merge=True
        )
    except Exception as e:
        print(f"Warning: Could not save GitHub analysis: {e}")


async def get_github_analysis(uid: str) -> Optional[dict]:
    """Get GitHub analysis for a user."""
    db = _get_db()
    if db is None:
        return None
    try:
        doc = db.collection("users").document(uid).get()
        if doc.exists:
            return doc.to_dict().get("github_analysis")
        return None
    except Exception as e:
        print(f"Warning: Could not get GitHub analysis: {e}")
        return None


# ---------- PlaceScore Functions ----------

async def save_placescore(uid: str, score_data: dict):
    """Save PlaceScore for a user."""
    db = _get_db()
    if db is None:
        return
    try:
        serialized = _serialize_for_firestore(score_data)
        serialized["updated_at"] = datetime.now(timezone.utc).isoformat()
        db.collection("users").document(uid).set(
            {"placescore": serialized}, merge=True
        )
    except Exception as e:
        print(f"Warning: Could not save PlaceScore: {e}")


async def get_placescore(uid: str) -> Optional[dict]:
    """Get PlaceScore for a user."""
    db = _get_db()
    if db is None:
        return None
    try:
        doc = db.collection("users").document(uid).get()
        if doc.exists:
            return doc.to_dict().get("placescore")
        return None
    except Exception as e:
        print(f"Warning: Could not get PlaceScore: {e}")
        return None


async def get_latest_resume_scores(uid: str) -> dict:
    """Get the latest resume ATS score for PlaceScore calculation."""
    db = _get_db()
    if db is None:
        return {"ats_score": 0}
    try:
        resumes_ref = (
            db.collection("users").document(uid).collection("resumes")
            .order_by("submitted_at", direction=firestore.Query.DESCENDING)
            .limit(1)
        )
        docs = list(resumes_ref.stream())
        if docs:
            data = docs[0].to_dict()
            return {
                "ats_score": data.get("ats_score", {}).get("total_score", 0),
            }
        return {"ats_score": 0}
    except Exception as e:
        print(f"Warning: Could not get resume scores: {e}")
        return {"ats_score": 0}


# ---------- Interview Functions ----------

async def save_interview_session(uid: str, session_data: dict) -> str:
    """Save an interview session. Returns session ID."""
    db = _get_db()
    if db is None:
        import uuid
        return str(uuid.uuid4())
    try:
        serialized = _serialize_for_firestore(session_data)
        serialized["created_at"] = datetime.now(timezone.utc).isoformat()
        sessions_ref = db.collection("users").document(uid).collection("interviews")
        doc_ref = sessions_ref.document()
        doc_ref.set(serialized)
        return doc_ref.id
    except Exception as e:
        print(f"Warning: Could not save interview session: {e}")
        import uuid
        return str(uuid.uuid4())


async def get_interview_sessions(uid: str) -> list[dict]:
    """Get all interview sessions for a user."""
    db = _get_db()
    if db is None:
        return []
    try:
        sessions_ref = (
            db.collection("users").document(uid).collection("interviews")
            .order_by("created_at", direction=firestore.Query.DESCENDING)
            .limit(10)
        )
        docs = list(sessions_ref.stream())
        results = []
        for doc in docs:
            data = doc.to_dict()
            data["session_id"] = doc.id
            results.append(data)
        return results
    except Exception as e:
        print(f"Warning: Could not get interview sessions: {e}")
        return []


async def get_latest_interview_score(uid: str) -> float:
    """Get the most recent interview overall score."""
    db = _get_db()
    if db is None:
        return 0.0
    try:
        sessions_ref = (
            db.collection("users").document(uid).collection("interviews")
            .order_by("created_at", direction=firestore.Query.DESCENDING)
            .limit(1)
        )
        docs = list(sessions_ref.stream())
        if docs:
            data = docs[0].to_dict()
            report = data.get("report", {})
            return report.get("calculated_score", report.get("overall_score", 0))
        return 0.0
    except Exception as e:
        print(f"Warning: Could not get interview score: {e}")
        return 0.0


# ---------- ATS Caching Functions ----------

async def get_cached_ats_result(resume_hash: str, company: str, role: str):
    """Lookup cached ATS result by resume_hash + company + role."""
    db = _get_db()
    if db is None:
        return None
    try:
        cache_key = f"{resume_hash}_{company.lower().strip()}_{role.lower().strip()}"
        doc = db.collection("ats_cache").document(cache_key).get()
        if doc.exists:
            return doc.to_dict()
        return None
    except Exception as e:
        print(f"Warning: ATS cache lookup failed: {e}")
        return None


async def save_cached_ats_result(resume_hash: str, company: str, role: str, result: dict):
    """Cache ATS result keyed by resume_hash + company + role."""
    db = _get_db()
    if db is None:
        return
    try:
        cache_key = f"{resume_hash}_{company.lower().strip()}_{role.lower().strip()}"
        serialized = _serialize_for_firestore(result)
        serialized["cached_at"] = datetime.now(timezone.utc).isoformat()
        serialized["resume_hash"] = resume_hash
        db.collection("ats_cache").document(cache_key).set(serialized)
    except Exception as e:
        print(f"Warning: ATS cache save failed: {e}")


# ---------- GitHub Interview Context Functions ----------

async def save_github_interview_context(uid: str, talking_points: list[str]):
    """Save github interview talking points as flat array."""
    db = _get_db()
    if db is None:
        return
    try:
        db.collection("users").document(uid).set(
            {"github_interview_context": talking_points}, merge=True
        )
    except Exception as e:
        print(f"Warning: Could not save GitHub interview context: {e}")


async def get_github_interview_context(uid: str) -> list[str]:
    """Get github interview talking points."""
    db = _get_db()
    if db is None:
        return []
    try:
        doc = db.collection("users").document(uid).get()
        if doc.exists:
            return doc.to_dict().get("github_interview_context", [])
        return []
    except Exception as e:
        print(f"Warning: Could not get GitHub interview context: {e}")
        return []

# ---------- Leaderboard Functions ----------

async def get_leaderboard(company_filter: str = "") -> list[dict]:
    """
    Get all users ranked by PlaceScore for the leaderboard.
    Optionally filter by target company from their latest resume.
    Returns top 50 candidates.
    """
    db = _get_db()
    if db is None:
        return []
    try:
        users_ref = db.collection("users").stream()
        candidates = []

        for user_doc in users_ref:
            data = user_doc.to_dict()
            profile = data.get("profile", {})
            ps_data = data.get("placescore", {})

            # Skip users without a PlaceScore
            if not ps_data or ps_data.get("placescore", 0) == 0:
                continue

            # Get target company from latest resume
            target_company = ""
            try:
                resumes = list(
                    db.collection("users").document(user_doc.id)
                    .collection("resumes")
                    .order_by("submitted_at", direction=firestore.Query.DESCENDING)
                    .limit(1)
                    .stream()
                )
                if resumes:
                    target_company = resumes[0].to_dict().get("target_company", "")
            except Exception:
                pass

            # Apply company filter if provided
            if company_filter and company_filter.lower() not in target_company.lower():
                continue

            candidates.append({
                "uid": user_doc.id,
                "name": profile.get("name", "Anonymous"),
                "email": profile.get("email", ""),
                "placescore": ps_data.get("placescore", 0),
                "ats_score": ps_data.get("ats_score", 0),
                "github_score": ps_data.get("github_score", 0),
                "interview_score": ps_data.get("interview_score", 0),
                "target_company": target_company,
            })

        # Sort by PlaceScore descending
        candidates.sort(key=lambda x: x["placescore"], reverse=True)

        # Add rank
        for i, c in enumerate(candidates):
            c["rank"] = i + 1

        return candidates[:50]

    except Exception as e:
        print(f"Warning: Could not get leaderboard: {e}")
        return []
