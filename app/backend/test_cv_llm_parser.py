from services import cv_parser


class _FakeResponse:
    def __init__(self, text: str):
        self.text = text


class _FakeModel:
    def generate_content(self, prompt: str):
        assert "CV TEXT" in prompt
        return _FakeResponse(
            """
            {
              "personal_info": {"email": "student@example.com", "phone": "0123456789"},
              "summary": "AI-focused student",
              "career_goals": "Become an AI engineer",
              "skills": ["Python", "Machine Learning"],
              "education": ["VinUni"],
              "experience": ["AI Intern"],
              "projects": ["RAG Assistant"],
              "certifications": ["IELTS 7.0"],
              "achievements": ["Scholarship"],
              "languages": ["English"],
              "gpa": 3.8,
              "ielts": 7.0
            }
            """
        )


def test_parse_cv_with_llm_prefers_model_output(monkeypatch):
    monkeypatch.setattr(cv_parser, "get_openai_model", lambda: _FakeModel())

    parsed = cv_parser.parse_cv_with_llm("student@example.com\nSKILLS\nPython")

    assert parsed["parse_metadata"]["method"] == "llm"
    assert parsed["personal_info"]["email"] == "student@example.com"
    assert parsed["summary"] == "AI-focused student"
    assert parsed["skills"] == ["Python", "Machine Learning"]
    assert parsed["gpa"] == 3.8
    assert parsed["ielts"] == 7.0


def test_parse_cv_with_llm_falls_back_when_model_output_is_invalid(monkeypatch):
    class _BrokenModel:
        def generate_content(self, prompt: str):
            return _FakeResponse("not json")

    monkeypatch.setattr(cv_parser, "get_openai_model", lambda: _BrokenModel())

    parsed = cv_parser.parse_cv_with_llm("student@example.com\n\nSKILLS\nPython\nSQL\n\nLANGUAGE\nIELTS Academic 7.5")

    assert parsed["parse_metadata"]["method"] == "fallback"
    assert parsed["personal_info"]["email"] == "student@example.com"
    assert parsed["skills"] == ["Python", "SQL"]
    assert parsed["ielts"] == 7.5


def test_parse_cv_with_llm_infers_career_goals_when_evidence_is_strong(monkeypatch):
    class _NoGoalModel:
        def generate_content(self, prompt: str):
            return _FakeResponse(
                """
                {
                  "personal_info": {"email": "", "phone": ""},
                  "summary": "AI engineer with machine learning and LLM project experience",
                  "career_goals": "",
                  "skills": ["Python", "Machine Learning", "LLMs"],
                  "education": [],
                  "experience": ["AI Engineer"],
                  "projects": ["RAG assistant"],
                  "certifications": [],
                  "achievements": [],
                  "languages": [],
                  "gpa": null,
                  "ielts": null
                }
                """
            )

    monkeypatch.setattr(cv_parser, "get_openai_model", lambda: _NoGoalModel())

    parsed = cv_parser.parse_cv_with_llm("AI Engineer")

    assert parsed["career_goals"] == "Phát triển trong lĩnh vực AI và kỹ thuật phần mềm ứng dụng."
