import json
import re
from typing import Any, Dict, List

from config import get_openai_model
from utils.logger import get_logger


logger = get_logger(__name__)


SECTION_HEADERS = {
    "summary": r"(SUMMARY|PROFILE|T[OÓ]M T[AẮ]T|GI[ỚO]I THI[EỆ]U)",
    "career_goals": r"(CAREER OBJECTIVE|OBJECTIVE|M[UỤ]C TI[EÊ]U NGH[EỀ] NGHI[EỆ]P)",
    "skills": r"(SKILLS|K[YỸ] N[AĂ]NG|K[IĨ] N[AĂ]NG)",
    "education": r"(EDUCATION|H[OỌ]C V[AẤ]N|GI[AÁ]O D[UỤ]C)",
    "experience": r"(EXPERIENCE|WORK EXPERIENCE|KINH NGHI[EỆ]M|KINH NGHI[EỆ]M L[AÀ]M VI[EỆ]C)",
    "projects": r"(PROJECTS|D[UỰ] [AÁ]N)",
    "certifications": r"(CERTIFICATIONS|CH[UỨ]NG CH[IỈ])",
    "achievements": r"(ACHIEVEMENTS|HONORS?\s*&\s*AWARDS?|AWARDS|TH[AÀ]NH T[IÍ]CH|GI[AẢ]I TH[ƯU][ỞO]NG)",
    "languages": r"(LANGUAGES?|NG[OÔ]N NG[ƯỮ])",
}


def _extract_section(text: str, header_regex: str) -> str:
    headers = "|".join(SECTION_HEADERS.values())
    match = re.search(
        # Keep whitespace around headers horizontal-only. `\s*` also consumes
        # newlines, which lets one header swallow the next line and causes
        # section values like ["SKILLS"], ["EDUCATION"], ...
        rf"^[ \t]*(?:{header_regex})[ \t]*:?[ \t]*\r?\n(?P<body>.*?)(?=^[ \t]*(?:{headers})[ \t]*:?[ \t]*(?:\r?\n|$)|\Z)",
        text or "",
        re.IGNORECASE | re.MULTILINE | re.DOTALL,
    )
    return match.group("body").strip() if match else ""


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
    ielts_match = re.search(r"\bIELTS(?:\s+Academic)?[:\s]*(\d(?:\.\d)?)\b", text, re.IGNORECASE)
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
    if ielts_match:
        structured["ielts"] = float(ielts_match.group(1))
    return structured


def _extract_json_object(raw_text: str) -> Dict[str, Any]:
    cleaned = (raw_text or "").strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("No JSON object found in CV parser response")
    return json.loads(cleaned[start:end + 1])


def _coerce_text(value: Any) -> str:
    return str(value).strip() if value not in (None, "") else ""


def _coerce_list(value: Any) -> List[Any]:
    if value in (None, ""):
        return []
    if isinstance(value, list):
        items = value
    else:
        items = [value]
    normalized = []
    for item in items:
        if isinstance(item, dict):
            if item:
                normalized.append(item)
            continue
        text = str(item).strip()
        if text:
            normalized.append(text)
    return normalized


def _normalize_llm_profile(payload: Dict[str, Any], fallback: Dict[str, Any]) -> Dict[str, Any]:
    payload = payload or {}
    personal = payload.get("personal_info") if isinstance(payload.get("personal_info"), dict) else {}
    fallback_personal = fallback.get("personal_info") or {}

    normalized = {
        "personal_info": {
            "email": _coerce_text(personal.get("email")) or fallback_personal.get("email"),
            "phone": _coerce_text(personal.get("phone")) or fallback_personal.get("phone"),
        },
        "summary": _coerce_text(payload.get("summary")),
        "career_goals": _coerce_text(payload.get("career_goals")),
        "skills": _coerce_list(payload.get("skills")),
        "education": _coerce_list(payload.get("education")),
        "experience": _coerce_list(payload.get("experience")),
        "projects": _coerce_list(payload.get("projects")),
        "certifications": _coerce_list(payload.get("certifications")),
        "achievements": _coerce_list(payload.get("achievements")),
        "languages": _coerce_list(payload.get("languages")),
        "parse_metadata": {
            "method": "llm",
            "warnings": [],
        },
    }

    if payload.get("gpa") not in (None, ""):
        try:
            normalized["gpa"] = float(payload["gpa"])
        except (TypeError, ValueError):
            pass
    elif fallback.get("gpa") is not None:
        normalized["gpa"] = fallback["gpa"]

    if payload.get("ielts") not in (None, ""):
        try:
            normalized["ielts"] = float(payload["ielts"])
        except (TypeError, ValueError):
            pass
    elif fallback.get("ielts") is not None:
        normalized["ielts"] = fallback["ielts"]

    # Keep deterministic fallback values only where the model returned nothing.
    for key in ["summary", "career_goals", "skills", "education", "experience", "projects", "certifications", "achievements", "languages"]:
        if not normalized.get(key):
            normalized[key] = fallback.get(key) or ([] if key not in {"summary", "career_goals"} else "")

    if not normalized["career_goals"]:
        normalized["career_goals"] = _infer_career_goals(normalized)

    return normalized


def _infer_career_goals(profile: Dict[str, Any]) -> str:
    """
    Build a conservative fallback career direction only when the parsed CV
    contains strong repeated evidence for a domain.
    """
    evidence = " ".join(
        [
            profile.get("summary") or "",
            " ".join(str(item) for item in profile.get("skills") or []),
            " ".join(str(item) for item in profile.get("experience") or []),
            " ".join(str(item) for item in profile.get("projects") or []),
        ]
    ).lower()

    ai_markers = ["ai", "machine learning", "deep learning", "nlp", "llm", "computer vision"]
    backend_markers = ["backend", "fastapi", "api", "java"]
    if sum(marker in evidence for marker in ai_markers) >= 2:
        return "Phát triển trong lĩnh vực AI và kỹ thuật phần mềm ứng dụng."
    if sum(marker in evidence for marker in backend_markers) >= 2:
        return "Phát triển trong lĩnh vực kỹ thuật phần mềm và backend engineering."
    return ""


def parse_cv_with_llm(text: str) -> Dict[str, Any]:
    """Parse CV profile fields from raw text with LLM-first extraction and regex fallback."""
    fallback = parse_cv(text)
    if not (text or "").strip():
        return fallback

    prompt = f"""
You are extracting profile fields from a student's CV.
Use only information supported by the CV text. Do not invent missing facts.
Return ONLY valid JSON matching this exact schema:
{{
  "personal_info": {{"email": "", "phone": ""}},
  "summary": "",
  "career_goals": "",
  "skills": [],
  "education": [],
  "experience": [],
  "projects": [],
  "certifications": [],
  "achievements": [],
  "languages": [],
  "gpa": null,
  "ielts": null
}}

Rules:
- Preserve the CV's language where practical.
- Use concise strings or compact objects for list items.
- `summary` should be a concise 1-2 sentence factual synthesis of the candidate's background even if the CV has no explicit SUMMARY section.
- `career_goals` should use an explicit objective if present; otherwise infer a concise career direction when the CV gives strong repeated evidence (for example repeated AI/backend work). If evidence is strong, do not leave this field empty.
- Extract numeric `gpa` and `ielts` when explicitly present anywhere in the CV text, including language/certification lines.
- If a field is absent, return an empty string, empty list, or null.
- Do not include markdown fences or commentary.

CV TEXT:
\"\"\"
{text}
\"\"\"
""".strip()

    try:
        response = get_openai_model().generate_content(prompt)
        payload = _extract_json_object(getattr(response, "text", ""))
        return _normalize_llm_profile(payload, fallback)
    except Exception as exc:
        logger.warning(f"LLM CV parsing failed; using fallback parser: {exc}")
        return fallback


class CVParser:
    """Compatibility wrapper for callers that expect a CVParser class."""

    def parse(self, text: str) -> Dict[str, Any]:
        return parse_cv_with_llm(text)

    def run(self, text: str) -> Dict[str, Any]:
        return parse_cv_with_llm(text)
