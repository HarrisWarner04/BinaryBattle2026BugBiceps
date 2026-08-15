"""
ChromaDB persistent client setup with graceful in-memory fallback.
Provides a shared ChromaDB client and collection access.
"""

import os
import shutil
import chromadb

CHROMA_DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "chroma_db")

_client = None


def get_chroma_client(reset: bool = False) -> chromadb.ClientAPI:
    """Get or create a ChromaDB client, falling back to in-memory if disk db fails."""
    global _client
    if reset or _client is None:
        if reset and os.path.exists(CHROMA_DB_PATH):
            try:
                shutil.rmtree(CHROMA_DB_PATH, ignore_errors=True)
            except Exception as e:
                print(f"[ChromaDB] Could not remove stale chroma_db directory: {e}")

        try:
            os.makedirs(CHROMA_DB_PATH, exist_ok=True)
            _client = chromadb.PersistentClient(path=CHROMA_DB_PATH)
        except Exception as e:
            print(f"[ChromaDB] PersistentClient failed: {e}. Falling back to EphemeralClient (in-memory)...")
            _client = chromadb.EphemeralClient()

    return _client


def get_job_roles_collection():
    """Get or create the job_roles collection in ChromaDB."""
    global _client
    try:
        client = get_chroma_client()
        collection = client.get_or_create_collection(
            name="job_roles",
            metadata={"description": "Job role descriptions for semantic matching"},
        )
        return collection
    except Exception as e:
        print(f"[ChromaDB] Collection error: {e}. Switching to clean in-memory EphemeralClient...")
        _client = chromadb.EphemeralClient()
        return _client.get_or_create_collection(
            name="job_roles",
            metadata={"description": "Job role descriptions for semantic matching"},
        )
