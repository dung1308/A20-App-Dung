from agents.cv_agent import CVAgent


def test_cv_agent_extracts_signals_directly_from_raw_text():
    text = """Nguyen Van A - AI Engineer

EDUCATION
VinUni

WORK EXPERIENCE
Software Engineer

SKILLS
Python
SQL
Machine Learning
"""

    signals = CVAgent().analyze(text)

    assert signals["analysis_metadata"]["length"] == len(text)
    assert "Python" in signals["extracted_skills"]
    assert "SQL" in signals["extracted_skills"]
    assert "Machine Learning" in signals["extracted_skills"]
    assert "Engineer" in signals["extracted_job_titles"]
