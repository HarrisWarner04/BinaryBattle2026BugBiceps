"""
ChromaDB seeder for the job_roles collection.
Run this once before starting the server. Do not run again unless you want to re-seed.

Usage:
    cd backend
    python -m rag.seed
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from rag.setup import get_job_roles_collection
from rag.embedder import embed


def seed_job_roles():
    """Seed the job_roles ChromaDB collection with job role descriptions."""
    collection = get_job_roles_collection()

    # Check if already seeded
    existing_count = collection.count()
    if existing_count > 0:
        print(f"Collection 'job_roles' already has {existing_count} documents. Skipping seed.")
        print("To re-seed, delete the chroma_db/ folder and run again.")
        return

    # Load job roles from JSON
    data_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "job_roles.json")
    with open(data_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    roles = data["roles"]
    print(f"Seeding {len(roles)} job roles into ChromaDB...")

    ids = []
    documents = []
    metadatas = []
    embeddings = []

    for i, role in enumerate(roles):
        role_id = role["id"]
        title = role["title"]
        company = role["company"]
        description = role["description"]

        print(f"  [{i + 1}/{len(roles)}] Embedding: {title} at {company}...")

        embedding = embed(description)

        ids.append(role_id)
        documents.append(description)
        metadatas.append({
            "title": title,
            "company": company,
            "role_id": role_id,
        })
        embeddings.append(embedding)

    # Add all documents in one batch
    collection.add(
        ids=ids,
        documents=documents,
        metadatas=metadatas,
        embeddings=embeddings,
    )

    print(f"\nSuccessfully seeded {len(roles)} job roles.")
    print(f"Collection count: {collection.count()}")


if __name__ == "__main__":
    seed_job_roles()
