"""
Shared OpenAI client for all AI calls.
Replaces Gemini — uses GPT-4o-mini for text generation and text-embedding-3-small for embeddings.
"""

import os
import json
import time
from openai import OpenAI
from dotenv import load_dotenv
from fastapi import HTTPException

load_dotenv()

_client = None


def _get_client() -> OpenAI:
    """Get or create the OpenAI client singleton."""
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise HTTPException(
                status_code=503,
                detail="OPENAI_API_KEY is not set in backend/.env. Get your key from https://platform.openai.com/api-keys"
            )
        _client = OpenAI(api_key=api_key)
    return _client


def chat_completion(
    prompt: str,
    system_prompt: str = "You are a helpful assistant.",
    temperature: float = 0.0,
    max_retries: int = 3,
) -> str:
    """
    Call OpenAI Chat Completion with automatic retry.
    Returns the raw text response.
    """
    client = _get_client()
    last_err = None

    for attempt in range(max_retries + 1):
        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
                temperature=temperature,
                max_tokens=4096,
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            last_err = e
            if attempt < max_retries:
                wait = 2 ** (attempt + 1)
                print(f"  ⏳ OpenAI error (attempt {attempt + 1}/{max_retries}): {str(e)[:80]}. Retrying in {wait}s...")
                time.sleep(wait)
            else:
                raise HTTPException(
                    status_code=503,
                    detail=f"AI service temporarily unavailable: {str(e)[:200]}"
                )

    raise HTTPException(status_code=503, detail=f"OpenAI call failed after {max_retries} retries: {str(last_err)[:200]}")


def chat_completion_json(
    prompt: str,
    system_prompt: str = "You are a helpful assistant. Return ONLY valid JSON, no markdown, no explanation.",
    temperature: float = 0.0,
    max_retries: int = 3,
) -> dict | list:
    """
    Call OpenAI and parse the response as JSON.
    Strips markdown fences if present.
    """
    raw = chat_completion(prompt, system_prompt, temperature, max_retries)

    # Strip markdown code fences if present
    if raw.startswith("```"):
        lines = raw.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        raw = "\n".join(lines)

    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        # Try to find JSON within the response
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(raw[start:end])
            except json.JSONDecodeError:
                pass
        # Try array
        start = raw.find("[")
        end = raw.rfind("]") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(raw[start:end])
            except json.JSONDecodeError:
                pass
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse AI response as JSON: {str(e)}"
        )


def embed_text(text: str) -> list[float]:
    """
    Generate an embedding for a single text using OpenAI text-embedding-3-small.
    Returns a 1536-dimensional vector.
    """
    if not text or not text.strip():
        return [0.0] * 1536

    client = _get_client()
    try:
        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=text,
        )
        return response.data[0].embedding
    except Exception as e:
        print(f"  ⚠️ Embedding error: {str(e)[:80]}. Returning zero vector.")
        return [0.0] * 1536


def embed_text_batch(texts: list[str]) -> list[list[float]]:
    """
    Generate embeddings for multiple texts in a single batch call.
    Much more efficient than calling embed_text individually.
    """
    if not texts:
        return []

    # Filter empty texts, track their positions
    non_empty = [(i, t) for i, t in enumerate(texts) if t and t.strip()]
    if not non_empty:
        return [[0.0] * 1536 for _ in texts]

    client = _get_client()
    try:
        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=[t for _, t in non_empty],
        )

        # Map embeddings back to original positions
        results = [[0.0] * 1536 for _ in texts]
        for idx, (orig_idx, _) in enumerate(non_empty):
            results[orig_idx] = response.data[idx].embedding
        return results
    except Exception as e:
        print(f"  ⚠️ Batch embedding error: {str(e)[:80]}. Returning zero vectors.")
        return [[0.0] * 1536 for _ in texts]
