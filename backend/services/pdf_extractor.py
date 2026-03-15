"""
PDF text extraction service using pdfplumber.
Extracts and cleans text from uploaded PDF resumes.
"""

import io
import re
import pdfplumber
from fastapi import HTTPException


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """
    Extract all text from a PDF file provided as bytes.
    Cleans the extracted text by removing excessive whitespace and fixing encoding issues.
    Handles multi-page PDFs.

    Args:
        pdf_bytes: Raw bytes of the PDF file.

    Returns:
        Cleaned text string extracted from the PDF.

    Raises:
        HTTPException: If PDF extraction fails.
    """
    try:
        pdf_file = io.BytesIO(pdf_bytes)
        all_text = []

        with pdfplumber.open(pdf_file) as pdf:
            if len(pdf.pages) == 0:
                raise HTTPException(
                    status_code=400,
                    detail="The uploaded PDF has no pages."
                )

            for page_num, page in enumerate(pdf.pages):
                page_text = page.extract_text()
                if page_text:
                    all_text.append(page_text)

        if not all_text:
            raise HTTPException(
                status_code=400,
                detail="Could not extract any text from the PDF. The file may be image-based or corrupted. Please upload a text-based PDF resume."
            )

        raw_text = "\n".join(all_text)
        cleaned_text = _clean_text(raw_text)

        if len(cleaned_text.strip()) < 50:
            raise HTTPException(
                status_code=400,
                detail="Extracted text is too short. The PDF may not contain a valid resume."
            )

        return cleaned_text

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to extract text from PDF: {str(e)}"
        )


def _clean_text(text: str) -> str:
    """
    Clean extracted text by removing excessive whitespace,
    fixing common encoding issues, and normalizing formatting.
    """
    # Fix common encoding replacements
    text = text.replace("\u2019", "'")
    text = text.replace("\u2018", "'")
    text = text.replace("\u201c", '"')
    text = text.replace("\u201d", '"')
    text = text.replace("\u2013", "-")
    text = text.replace("\u2014", "-")
    text = text.replace("\u2022", "- ")
    text = text.replace("\uf0b7", "- ")
    text = text.replace("\uf0a7", "- ")

    # Replace tabs with spaces
    text = text.replace("\t", " ")

    # Collapse multiple spaces into one (but preserve newlines)
    text = re.sub(r"[^\S\n]+", " ", text)

    # Collapse more than 2 consecutive newlines into 2
    text = re.sub(r"\n{3,}", "\n\n", text)

    # Strip leading/trailing whitespace from each line
    lines = [line.strip() for line in text.split("\n")]
    text = "\n".join(lines)

    # Remove leading/trailing whitespace from the whole text
    text = text.strip()

    return text
