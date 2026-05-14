import re
from typing import Dict, Any
from datetime import datetime
from utils.logger import get_logger

logger = get_logger(__name__)

class CVAgent:
    """
    CVAgent is responsible for transforming raw, unstructured CV text into 
    structured 'signals' used by the matching engine and RAG services.
    """

    def analyze(self, text: str, structured_data: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Analyzes the extracted CV text and returns structured signals.
        Logs the input text length to assist in verifying parser performance.
        """
        structured_data = structured_data or {}
        text_length = len(text) if text else 0
        
        # Audit log to verify data flow from the PDF parser
        logger.info(f"[CV_AGENT] Analyzing CV text. Received length: {text_length} characters.")

        # Helper to extract content within specific sections
        def _extract_section(full_text: str, header_regex: str) -> str:
            match = re.search(header_regex + r"\s*\n(.*?)(?=\n\s*[A-Z\s]{4,}:?|\Z)", (full_text if full_text is not None else ""), re.DOTALL | re.IGNORECASE)
            if match:
                # Remove any sub-headers that might be caught
                section_content = re.sub(r"^[A-Z\s]+:?\s*\n", "", (match.group(1) or ""), flags=re.MULTILINE).strip()
                return section_content
            return ""

        # Extract content from key sections
        skills_section = _extract_section(text, r"KỸ NĂNG|KĨ NĂNG|KỸ NĂNG CHUYÊN MÔN|SKILLS")
        education_section = _extract_section(text, r"HỌC VẤN|GIÁO DỤC|EDUCATION")
        experience_section = _extract_section(text, r"KINH NGHIỆM LÀM VIỆC|KINH NGHIỆM|EXPERIENCE")
        references_section = _extract_section(text, r"NGƯỜI THAM KHẢO|REFERENCES")

        # Enhanced Skill Extraction
        common_skills = [
            "Python", "Java", "C\\+\\+", "SQL", "Product Management", "Scrum", "Agile",
            "Machine Learning", "AI", "Software Development", "Data Analysis", "Project Management",
            "Strategic Planning", "Market Research", "Financial Analysis", "Leadership",
            "Communication", "Teamwork", "Problem Solving", "Critical Thinking", "Presentation"
        ]
        extracted_skills = list(dict.fromkeys(structured_data.get("skills") or []))
        # Prioritize skills from the dedicated section, otherwise search globally
        skill_search_text = skills_section if skills_section else text
        for skill in common_skills:
            if re.search(rf"\b{skill}\b", skill_search_text, re.IGNORECASE):
                extracted_skills.append(skill.replace("\\", ""))  # Remove regex escapes for the result
        extracted_skills = list(dict.fromkeys(extracted_skills))
        
        # Attempt to find GPA (e.g., GPA: 3.8 or 3.5/4.0)
        # Prioritize GPA from the education section
        gpa_search_text = education_section if education_section else text
        gpa_match = re.search(r"GPA[:\s]*(\d\.\d{1,2}|[0-4](?:\.\d{1,2})?/\d(?:\.\d{1,2})?)", gpa_search_text, re.IGNORECASE)
        gpa_estimate = structured_data.get("gpa")
        if gpa_match:
            gpa_raw = gpa_match.group(1)
            if '/' in gpa_raw: # Convert X.X/Y.Y to X.X
                gpa_estimate = float(gpa_raw.split('/')[0])
            else:
                gpa_estimate = float(gpa_raw)

        # Reusable title pattern for professional roles
        title_pattern = r"(?:(Senior|Lead|Junior|Manager|Specialist|Analyst|Technical|QC|Event)\s+)?(?:(Product|Software|Data|Marketing|Business|Operations|Team|Project)\s+)?(Manager|Engineer|Analyst|Consultant|Developer|Specialist|Owner|Leader|Lead)\b"

        # 1. Candidate Job Titles (Experience section ONLY)
        candidate_job_titles = []
        
        # Scan header (first 1000 chars) for high-level titles
        header_titles = re.findall(title_pattern, text[:1000], re.IGNORECASE)
        for title_parts in header_titles:
            candidate_job_titles.append(" ".join(filter(None, title_parts)))

        if experience_section:
            exp_titles = re.findall(r"^\s*" + title_pattern, experience_section, re.MULTILINE | re.IGNORECASE)
            for title_parts in exp_titles:
                candidate_job_titles.append(" ".join(filter(None, title_parts)))

        # 2. Referrer Titles (References section ONLY)
        referrer_titles = []
        if references_section:
            ref_titles = re.findall(title_pattern, references_section, re.MULTILINE | re.IGNORECASE)
            for title_parts in ref_titles:
                referrer_titles.append(" ".join(filter(None, title_parts)))

        # Suggested Majors with Logic-based Explanations
        explanations = {}
        if "Product Management" in extracted_skills:
            explanations["Computer Science"] = "Kỹ năng Quản lý sản phẩm kết hợp tốt với nền tảng công nghệ tại VinUni."
            explanations["Business Administration"] = "Kinh nghiệm điều phối sản phẩm là lợi thế lớn cho ngành Quản trị."
        if any("Product Owner" in t for t in candidate_job_titles):
            explanations["Business Administration"] = "Vai trò Product Owner thể hiện tư duy vận hành và quản trị dự án."
        if education_section and re.search(r"Software Development|Computer Science", education_section, re.I):
            explanations["Computer Science"] = "Bạn đã có nền tảng học vấn sẵn có trong lĩnh vực Công nghệ thông tin."

        # Generate a Persona Summary for LLM Context Enrichment
        # This helps other agents (Advisor/RAG) communicate more personally.
        titles_str = ", ".join(list(set(candidate_job_titles)))
        skills_str = ", ".join(extracted_skills[:5])
        persona_parts = []
        if titles_str:
            persona_parts.append(f"bạn có kinh nghiệm dày dặn trong vai trò {titles_str}")
        if skills_str:
            persona_parts.append(f"sở hữu bộ kỹ năng ấn tượng về {skills_str}")

        # Highlight high academic achievement
        if gpa_estimate and (gpa_estimate >= 3.5 or gpa_estimate >= 8.5):
            persona_parts.append(f"thành tích học tập xuất sắc (GPA {gpa_estimate})")

        # Highlight degree/education background
        if education_section:
            degree_match = re.search(r"(Bachelor|Cử nhân|Engineer|Kỹ sư|Master|Thạc sĩ)[^.\n]+", education_section, re.I)
            if degree_match:
                persona_parts.append(f"nền tảng học thuật {degree_match.group(0).strip()}")

        # Formatted as a direct reply to the user
        persona_summary = f"Dựa trên CV, tôi thấy {', '.join(persona_parts)}. Đây là một nền tảng rất tốt để phát triển tại VinUni!" if persona_parts else "Tôi đã nhận được CV của bạn. Hãy cùng khám phá những ngành học phù hợp nhất với thế mạnh của bạn nhé!"

        # Placeholder for structured signals
        signals = {
            "analysis_metadata": {
                "length": text_length,
                "timestamp": datetime.utcnow().isoformat()
            },
            "extracted_skills": extracted_skills,
            "suggested_majors": list(explanations.keys()),
            "major_explanations": explanations,
            "persona_summary": persona_summary,
            "gpa_estimate": gpa_estimate,
            "extracted_job_titles": list(set(candidate_job_titles)), # Strictly the candidate's roles
            "referrer_titles": list(set(referrer_titles)) # Titles of people referring the candidate
        }
        
        return signals
