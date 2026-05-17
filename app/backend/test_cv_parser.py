from services.cv_parser import parse_cv


def test_parse_cv_extracts_section_bodies_instead_of_repeating_headers():
    text = """Giang Tran
gianggbgt@gmail.com
0392304628

EDUCATION
FPT University

WORK EXPERIENCE
Java Backend Intern

CERTIFICATIONS
IBM AI Certificate

HONORS & AWARDS
Scholarship

SKILLS
Python
SQL

LANGUAGE
IELTS Academic 6.0

PROJECTS
Hospital Feedback Assistant
"""

    parsed = parse_cv(text)

    assert parsed["education"] == ["FPT University"]
    assert parsed["experience"] == ["Java Backend Intern"]
    assert parsed["certifications"] == ["IBM AI Certificate"]
    assert parsed["achievements"] == ["Scholarship"]
    assert parsed["skills"] == ["Python", "SQL"]
    assert parsed["languages"] == ["IELTS Academic 6.0"]
    assert parsed["projects"] == ["Hospital Feedback Assistant"]
