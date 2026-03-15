"""
OpenAI embedding wrapper for generating embeddings.
Returns 1536-dimensional float vectors using text-embedding-3-small.
"""

from services.openai_client import embed_text, embed_text_batch


def embed(text: str) -> list[float]:
    """
    Embed a single text string using OpenAI embedding model.
    Returns a 1536-dimensional list of floats.
    """
    return embed_text(text)


def embed_query(text: str) -> list[float]:
    """
    Embed a query string using OpenAI embedding model.
    Same as embed() since OpenAI doesn't differentiate task types.
    """
    return embed_text(text)


def embed_batch(texts: list[str], task_type: str = "retrieval_document") -> list[list[float]]:
    """
    Embed multiple texts in a batch.
    Returns a list of 1536-dimensional float vectors.
    """
    return embed_text_batch(texts)
