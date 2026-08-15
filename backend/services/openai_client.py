"""
Universal AI client supporting Groq, Google Gemini, and OpenAI.
Priority order for LLM & Speech: Groq -> Gemini -> OpenAI.
Priority order for Embeddings: Gemini -> OpenAI -> Local Fallback.
"""

import os
import json
import time
import math
import hashlib
from typing import Optional, Union, List, Dict, Any
from dotenv import load_dotenv
from fastapi import HTTPException

load_dotenv()

# Global cached clients
_openai_client = None
_groq_client = None
_gemini_genai_configured = False


def get_active_provider() -> str:
    """Detect which provider is available for LLM."""
    if os.getenv("GROQ_API_KEY"):
        return "groq"
    if os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"):
        return "gemini"
    if os.getenv("OPENAI_API_KEY"):
        return "openai"
    return "none"


def _get_openai_client():
    """Get standard OpenAI client."""
    global _openai_client
    if _openai_client is None:
        from openai import OpenAI
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise HTTPException(
                status_code=503,
                detail="No AI API key found. Please set GROQ_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY in backend/.env or Render environment variables."
            )
        _openai_client = OpenAI(api_key=api_key)
    return _openai_client


def _get_groq_client():
    """Get Groq client via OpenAI-compatible endpoint."""
    global _groq_client
    if _groq_client is None:
        from openai import OpenAI
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise HTTPException(
                status_code=503,
                detail="GROQ_API_KEY is not set. Get a free API key at https://console.groq.com"
            )
        _groq_client = OpenAI(
            base_url="https://api.groq.com/openai/v1",
            api_key=api_key
        )
    return _groq_client


def _init_gemini_genai():
    """Configure google.generativeai if available."""
    global _gemini_genai_configured
    if not _gemini_genai_configured:
        import google.generativeai as genai
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise HTTPException(
                status_code=503,
                detail="GEMINI_API_KEY is not set. Get a free API key at https://aistudio.google.com"
            )
        genai.configure(api_key=api_key)
        _gemini_genai_configured = True


def chat_completion(
    prompt: str,
    system_prompt: str = "You are a helpful assistant.",
    temperature: float = 0.0,
    max_retries: int = 3,
) -> str:
    """
    Call AI Chat Completion with automatic retry and provider fallback.
    Supports Groq (Llama 3.3 70B), Gemini (Gemini 2.0 / 1.5 Flash), and OpenAI (GPT-4o-mini).
    """
    provider = get_active_provider()
    if provider == "none":
        raise HTTPException(
            status_code=503,
            detail="No AI API key configured. Set GROQ_API_KEY (free), GEMINI_API_KEY (free), or OPENAI_API_KEY in environment variables."
        )

    last_err = None

    for attempt in range(max_retries + 1):
        try:
            if provider == "groq":
                client = _get_groq_client()
                response = client.chat.completions.create(
                    model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=temperature,
                    max_tokens=4096,
                )
                return response.choices[0].message.content.strip()

            elif provider == "gemini":
                _init_gemini_genai()
                import google.generativeai as genai
                model_name = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
                model = genai.GenerativeModel(
                    model_name=model_name,
                    system_instruction=system_prompt if system_prompt else None,
                    generation_config=genai.types.GenerationConfig(
                        temperature=temperature,
                        max_output_tokens=4096,
                    )
                )
                response = model.generate_content(prompt)
                return response.text.strip()

            else:  # openai
                client = _get_openai_client()
                response = client.chat.completions.create(
                    model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
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
                print(f"[AI Retry] {provider.upper()} attempt {attempt + 1}/{max_retries} failed: {str(e)[:80]}. Retrying in {wait}s...")
                time.sleep(wait)
            else:
                raise HTTPException(
                    status_code=503,
                    detail=f"AI service ({provider}) temporarily unavailable: {str(e)[:200]}"
                )

    raise HTTPException(status_code=503, detail=f"AI call failed after {max_retries} retries: {str(last_err)[:200]}")


def chat_completion_json(
    prompt: str,
    system_prompt: str = "You are a helpful assistant. Return ONLY valid JSON, no markdown, no explanation.",
    temperature: float = 0.0,
    max_retries: int = 3,
) -> Union[dict, list]:
    """
    Call AI and parse the response as JSON.
    Strips markdown code fences and cleans output.
    """
    raw = chat_completion(prompt, system_prompt, temperature, max_retries)

    if "```" in raw:
        lines = raw.split("\n")
        cleaned_lines = []
        inside_fence = False
        for line in lines:
            if line.strip().startswith("```"):
                inside_fence = not inside_fence
                continue
            cleaned_lines.append(line)
        raw = "\n".join(cleaned_lines).strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start_obj = raw.find("{")
        end_obj = raw.rfind("}") + 1
        if start_obj >= 0 and end_obj > start_obj:
            try:
                return json.loads(raw[start_obj:end_obj])
            except json.JSONDecodeError:
                pass

        start_arr = raw.find("[")
        end_arr = raw.rfind("]") + 1
        if start_arr >= 0 and end_arr > start_arr:
            try:
                return json.loads(raw[start_arr:end_arr])
            except json.JSONDecodeError:
                pass

        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse AI response as JSON: {raw[:150]}"
        )


def _local_fallback_embedding(text: str, dim: int = 768) -> list[float]:
    """Deterministic hash-based dense vector for zero-dependency fallback."""
    if not text or not text.strip():
        return [0.0] * dim
    
    words = text.lower().split()
    vec = [0.0] * dim
    for word in words:
        h = int(hashlib.md5(word.encode("utf-8")).hexdigest(), 16)
        idx = h % dim
        vec[idx] += 1.0

    norm = math.sqrt(sum(x * x for x in vec))
    if norm > 0:
        vec = [x / norm for x in vec]
    return vec


def embed_text(text: str) -> list[float]:
    """
    Generate an embedding for a single text.
    Uses Gemini embedding if available, OpenAI if available, or local fallback.
    """
    if not text or not text.strip():
        return [0.0] * 768

    # Option 1: Google Gemini Embedding (Free)
    if os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"):
        try:
            _init_gemini_genai()
            import google.generativeai as genai
            for model_name in ["models/embedding-001", "models/text-embedding-004"]:
                try:
                    result = genai.embed_content(
                        model=model_name,
                        content=text,
                        task_type="retrieval_document"
                    )
                    return result['embedding']
                except Exception:
                    continue
        except Exception as e:
            print(f"[Embedding Warning] Gemini embedding: {str(e)[:80]}. Using fallback.")

    # Option 2: OpenAI Embedding
    if os.getenv("OPENAI_API_KEY"):
        try:
            client = _get_openai_client()
            response = client.embeddings.create(
                model="text-embedding-3-small",
                input=text,
            )
            return response.data[0].embedding
        except Exception as e:
            print(f"[Embedding Warning] OpenAI embedding: {str(e)[:80]}. Using fallback.")

    # Option 3: Local Fallback (Guaranteed to work without API keys or costs)
    return _local_fallback_embedding(text, dim=768)


def embed_text_batch(texts: list[str]) -> list[list[float]]:
    """
    Generate embeddings for multiple texts in a batch.
    """
    if not texts:
        return []

    if os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"):
        try:
            _init_gemini_genai()
            import google.generativeai as genai
            for model_name in ["models/embedding-001", "models/text-embedding-004"]:
                try:
                    result = genai.embed_content(
                        model=model_name,
                        content=texts,
                        task_type="retrieval_document"
                    )
                    return result['embedding']
                except Exception:
                    continue
        except Exception:
            pass

    if os.getenv("OPENAI_API_KEY"):
        try:
            non_empty = [(i, t) for i, t in enumerate(texts) if t and t.strip()]
            if not non_empty:
                return [[0.0] * 1536 for _ in texts]
            client = _get_openai_client()
            response = client.embeddings.create(
                model="text-embedding-3-small",
                input=[t for _, t in non_empty],
            )
            results = [[0.0] * 1536 for _ in texts]
            for idx, (orig_idx, _) in enumerate(non_empty):
                results[orig_idx] = response.data[idx].embedding
            return results
        except Exception:
            pass

    return [embed_text(t) for t in texts]


def transcribe_audio(file_path: str) -> str:
    """
    Transcribe audio file using Groq Whisper (ultra-fast & free), OpenAI Whisper, or Gemini.
    """
    # 1. Try Groq Whisper (free, instantaneous)
    if os.getenv("GROQ_API_KEY"):
        try:
            client = _get_groq_client()
            with open(file_path, "rb") as f:
                transcription = client.audio.transcriptions.create(
                    model="whisper-large-v3-turbo",
                    file=f,
                    language="en",
                    prompt="Interview answer about software engineering, projects, and technical skills.",
                )
            return transcription.text.strip()
        except Exception as e:
            print(f"[Transcribe Warning] Groq Whisper: {e}")

    # 2. Try OpenAI Whisper
    if os.getenv("OPENAI_API_KEY"):
        try:
            client = _get_openai_client()
            with open(file_path, "rb") as f:
                transcription = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=f,
                    language="en",
                    prompt="Interview answer about software engineering, projects, and technical skills.",
                )
            return transcription.text.strip()
        except Exception as e:
            print(f"[Transcribe Warning] OpenAI Whisper: {e}")

    # 3. Try Gemini multimodal audio transcription
    if os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"):
        try:
            _init_gemini_genai()
            import google.generativeai as genai
            audio_file = genai.upload_file(path=file_path)
            model = genai.GenerativeModel(model_name="gemini-1.5-flash")
            response = model.generate_content([
                "Please transcribe this audio clip accurately. Output ONLY the transcribed English text, nothing else.",
                audio_file
            ])
            return response.text.strip()
        except Exception as e:
            print(f"[Transcribe Warning] Gemini audio transcription: {e}")

    raise HTTPException(
        status_code=503,
        detail="Audio transcription failed: No valid Groq, Gemini, or OpenAI API key available."
    )
