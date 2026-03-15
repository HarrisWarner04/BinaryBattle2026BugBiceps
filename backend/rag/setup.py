"""
ChromaDB persistent client setup.
Provides a shared ChromaDB client and collection access.
"""

import os
import chromadb

CHROMA_DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "chroma_db")

_client = None


def get_chroma_client() -> chromadb.PersistentClient:
    """Get or create a persistent ChromaDB client."""
    global _client
    if _client is None:
        os.makedirs(CHROMA_DB_PATH, exist_ok=True)
        _client = chromadb.PersistentClient(path=CHROMA_DB_PATH)
    return _client


def get_job_roles_collection():
    """Get or create the job_roles collection in ChromaDB."""
    client = get_chroma_client()
    collection = client.get_or_create_collection(
        name="job_roles",
        metadata={"description": "Job role descriptions for semantic matching"},
    )
    return collection
