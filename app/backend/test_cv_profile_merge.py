from services.db_service import DBService


def test_merge_profile_from_cv_hydrates_profile_without_storing_structured_snapshot():
    service = object.__new__(DBService)
    captured = {}

    def capture_update(user_id, profile_update):
        captured["user_id"] = user_id
        captured["profile_update"] = profile_update

    service.upsert_student_profile = capture_update

    service.merge_profile_from_cv(
        user_id="student@example.com",
        structured_data={
            "personal_info": {"phone": "0123456789"},
            "skills": ["Python", "SQL"],
            "education": ["VinUni"],
            "experience": ["Software Engineer"],
            "gpa": 3.9,
            "ielts": 7.5,
        },
        cv_signals={"gpa_estimate": 3.8},
        document_id="doc-1",
        filename="cv.pdf",
        store_structured_snapshot=False,
    )

    update = captured["profile_update"]
    assert captured["user_id"] == "student@example.com"
    assert update["phone"] == "0123456789"
    assert update["skills"] == ["Python", "SQL"]
    assert update["education"] == ["VinUni"]
    assert update["experience"] == ["Software Engineer"]
    assert update["gpa"] == 3.9
    assert update["test_scores"] == {"ielts": 7.5}
    assert "cv_structured_data" not in update
