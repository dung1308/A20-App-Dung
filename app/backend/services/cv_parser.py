import re
from typing import Any, Dict, List


SECTION_HEADERS = {
    "summary": r"(SUMMARY|PROFILE|T[OÓ]M T[AẮ]T|GI[ỚO]I THI[EỆ]U)",
    "career_goals": r"(CAREER OBJECTIVE|OBJECTIVE|M[UỤ]C TI[EÊ]U NGH[EỀ] NGHI[EỆ]P)",
    "skills": r"(SKILLS|K[YỸ] N[AĂ]NG|K[IĨ] N[AĂ]NG)",
    "education": r"(EDUCATION|H[OỌ]C V[AẤ]N|GI[AÁ]O D[UỤ]C)",
    "experience": r"(EXPERIENCE|WORK EXPERIENCE|KINH NGHI[EỆ]M|KINH NGHI[EỆ]M L[AÀ]M VI[EỆ]C)",
    "projects": r"(PROJECTS|D[UỰ] [AÁ]N)",
    "certifications": r"(CERTIFICATIONS|CH[UỨ]NG CH[IỈ])",
    "achievements": r"(ACHIEVEMENTS|AWARDS|TH[AÀ]NH T[IÍ]CH|GI[AẢ]I TH[ƯU][ỞO]NG)",
    "languages": r"(LANGUAGES|NG[OÔ]N NG[ƯỮ])",
}


def _extract_section(text: str, header_regex: str) -> str:
    headers = "|".join(SECTION_HEADERS.values())
    match = re.search(
        rf"^\s*(?:{header_regex})\s*:?\s*$\n(.*?)(?=^\s*(?:{headers})\s*:?\s*$|\Z)",
        text or "",
        re.IGNORECASE | re.MULTILINE | re.DOTALL,
    )
    return match.group(1).strip() if match else ""


def _split_items(value: str) -> List[str]:
    if not value:
        return []
    parts = re.split(r"[\n;,•]+", value)
    return [part.strip(" -\t") for part in parts if part.strip(" -\t")]


def parse_cv(text: str) -> Dict[str, Any]:
    """Deterministic fallback parser for structured CV profile fields."""
    text = text or ""
    personal_info: Dict[str, Any] = {}
    email_match = re.search(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", text)
    phone_match = re.search(r"(\+?\d[\d\s().-]{7,}\d)", text)
    gpa_match = re.search(r"\bGPA[:\s]*(\d(?:\.\d{1,2})?)(?:\s*/\s*\d(?:\.\d{1,2})?)?", text, re.IGNORECASE)
    if email_match:
        personal_info["email"] = email_match.group(0)
    if phone_match:
        personal_info["phone"] = phone_match.group(1).strip()

    structured = {
        "personal_info": personal_info,
        "summary": _extract_section(text, SECTION_HEADERS["summary"]),
        "career_goals": _extract_section(text, SECTION_HEADERS["career_goals"]),
        "skills": _split_items(_extract_section(text, SECTION_HEADERS["skills"])),
        "education": _split_items(_extract_section(text, SECTION_HEADERS["education"])),
        "experience": _split_items(_extract_section(text, SECTION_HEADERS["experience"])),
        "projects": _split_items(_extract_section(text, SECTION_HEADERS["projects"])),
        "certifications": _split_items(_extract_section(text, SECTION_HEADERS["certifications"])),
        "achievements": _split_items(_extract_section(text, SECTION_HEADERS["achievements"])),
        "languages": _split_items(_extract_section(text, SECTION_HEADERS["languages"])),
        "parse_metadata": {
            "method": "fallback",
            "warnings": [] if len(text.strip()) >= 200 else ["low_text_extraction"],
        },
    }
    if gpa_match:
        structured["gpa"] = float(gpa_match.group(1))
    return structured


class CVParser:
    """Compatibility wrapper for callers that expect a CVParser class."""

    def parse(self, text: str) -> Dict[str, Any]:
        return parse_cv(text)

    def run(self, text: str) -> Dict[str, Any]:
        return parse_cv(text)
