from agents.cv_agent import CVAgent


def test_cv_agent_carries_gpa_and_ielts_from_profile_fields():
    signals = CVAgent().analyze(
        "AI Engineer\n\nSKILLS\nPython\n\nIELTS Academic 8.0",
        {"gpa": 3.9, "ielts": 8.0},
    )

    assert signals["gpa_estimate"] == 3.9
    assert signals["ielts_estimate"] == 8.0
    assert "GPA 3.9" in signals["persona_summary"]
    assert "IELTS 8.0" in signals["persona_summary"]
