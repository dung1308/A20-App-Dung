from sqlalchemy import create_engine, inspect, text

from agents.advisor import AdvisorAgent
from database import _ensure_admissions_data_columns


def test_ensure_admissions_data_columns_adds_official_url():
    engine = create_engine("sqlite:///:memory:")
    with engine.connect() as conn:
        conn.execute(text(
            "CREATE TABLE admissions_data ("
            "id INTEGER PRIMARY KEY, major_id VARCHAR, requirements TEXT, description TEXT)"
        ))
        conn.commit()

    _ensure_admissions_data_columns(engine)

    columns = {column["name"] for column in inspect(engine).get_columns("admissions_data")}
    assert "official_url" in columns


def test_validate_and_enrich_prefers_db_official_url():
    advisor = object.__new__(AdvisorAgent)
    advisor._get_majors_lookup = lambda: {"cs": {"name": "Computer Science", "what_students_do": "Build software"}}
    advisor._get_valid_ids = lambda: {"cs"}
    advisor.db = type("FakeDB", (), {
        "get_admissions_data_by_major": lambda self: {
            "cs": {"official_url": "https://vinuni.example/cs"}
        }
    })()

    result = advisor._validate_and_enrich([{"major_id": "cs", "match_score": 90}])

    assert result[0]["source_url"] == "https://vinuni.example/cs"
    assert result[0]["verified_source"] is True


def test_validate_and_enrich_falls_back_when_db_url_missing():
    advisor = object.__new__(AdvisorAgent)
    advisor._get_majors_lookup = lambda: {"cs": {"name": "Computer Science", "what_students_do": "Build software"}}
    advisor._get_valid_ids = lambda: {"cs"}
    advisor.db = type("FakeDB", (), {
        "get_admissions_data_by_major": lambda self: {"cs": {"official_url": None}}
    })()

    result = advisor._validate_and_enrich([{"major_id": "cs", "match_score": 90}])

    assert result[0]["source_url"]
    assert result[0]["verified_source"] is True
