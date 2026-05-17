#!/usr/bin/env python3
"""
create_db.py
------------
Script to create PostgreSQL database and tables for VinUni Admission Assistant.
Run this once after setting up PostgreSQL.
"""

from dotenv import load_dotenv
load_dotenv()

import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from models.schemas import Base, AdmissionsData
from config import get_database_url

def create_database():
    """Create all tables and insert sample admissions data."""
    engine = create_engine(get_database_url())

    # Enable pgcrypto extension for database-side password hashing
    if not get_database_url().startswith("sqlite"):
        with engine.connect() as conn:
            try:
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto;"))
                conn.commit()
                print("✅ PostgreSQL pgcrypto extension enabled.")
            except Exception as e:
                print(f"⚠️  Permission denied: Could not enable 'pgcrypto' extension: {e}")
                print("👉 Please ask your Database Admin to run: CREATE EXTENSION pgcrypto;")

    # Create all tables
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables created successfully.")

    # Insert sample admissions data
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    with SessionLocal() as session:
        # Check if data already exists
        if session.query(AdmissionsData).count() == 0:
            sample_data = [
                AdmissionsData(
                    major_id="cs",
                    requirements="GPA >= 3.5, IELTS >= 6.5, Math score >= 8.0",
                    description="Ngành Khoa học Máy tính yêu cầu nền tảng toán học vững và khả năng lập trình.",
                    official_url="https://admissions.vinuni.edu.vn/vi/dai-hoc/cau-hoi-thuong-gap/tuyen-sinh/"
                ),
                AdmissionsData(
                    major_id="ee",
                    requirements="GPA >= 3.2, IELTS >= 6.0, Physics/Math score >= 7.5",
                    description="Ngành Kỹ thuật Điện & Máy tính phù hợp với học sinh thích vật lý, mạch điện, hệ thống nhúng, lập trình và công nghệ máy tính.",
                    official_url="https://admissions.vinuni.edu.vn/vi/dai-hoc/cau-hoi-thuong-gap/tuyen-sinh/"
                ),
                AdmissionsData(
                    major_id="me",
                    requirements="GPA >= 3.2, IELTS >= 6.0, Math/Physics score >= 7.5",
                    description="Ngành Cơ khí dành cho học sinh yêu thích thiết kế và sản xuất.",
                    official_url="https://admissions.vinuni.edu.vn/vi/dai-hoc/cau-hoi-thuong-gap/tuyen-sinh/"
                ),
                AdmissionsData(
                    major_id="bme",
                    requirements="GPA >= 3.5, IELTS >= 6.5, Biology/Math score >= 8.0",
                    description="Ngành Y sinh kết hợp y học và kỹ thuật.",
                    official_url="https://admissions.vinuni.edu.vn/vi/dai-hoc/cau-hoi-thuong-gap/tuyen-sinh/"
                ),
                AdmissionsData(
                    major_id="ba",
                    requirements="GPA >= 3.0, IELTS >= 6.5, Essay score >= 8.0",
                    description="Ngành Quản trị Kinh doanh phát triển kỹ năng lãnh đạo.",
                    official_url="https://admissions.vinuni.edu.vn/vi/dai-hoc/cau-hoi-thuong-gap/tuyen-sinh/"
                ),
                AdmissionsData(
                    major_id="finance",
                    requirements="GPA >= 3.2, IELTS >= 6.5, Math score >= 7.5",
                    description="Ngành Tài chính tập trung vào phân tích và đầu tư.",
                    official_url="https://admissions.vinuni.edu.vn/vi/dai-hoc/cau-hoi-thuong-gap/tuyen-sinh/"
                ),
                AdmissionsData(
                    major_id="data_science",
                    requirements="GPA >= 3.5, IELTS >= 6.5, Math/Statistics score >= 8.0",
                    description="Ngành Khoa học Dữ liệu sử dụng AI và big data.",
                    official_url="https://admissions.vinuni.edu.vn/vi/dai-hoc/cau-hoi-thuong-gap/tuyen-sinh/"
                ),
                AdmissionsData(
                    major_id="liberal_arts",
                    requirements="GPA >= 3.0, IELTS >= 7.0, Essay score >= 8.5",
                    description="Ngành Khoa học Xã hội & Nhân văn phát triển tư duy phê phán.",
                    official_url="https://admissions.vinuni.edu.vn/vi/dai-hoc/cau-hoi-thuong-gap/tuyen-sinh/"
                ),
                AdmissionsData(
                    major_id="architecture",
                    requirements="GPA >= 3.2, IELTS >= 6.5, Portfolio required",
                    description="Ngành Kiến trúc yêu cầu sáng tạo và kỹ năng vẽ.",
                    official_url="https://admissions.vinuni.edu.vn/vi/dai-hoc/cau-hoi-thuong-gap/tuyen-sinh/"
                ),
            ]
            session.add_all(sample_data)
            session.commit()
            print("✅ Sample admissions data inserted.")
        else:
            print("ℹ️  Admissions data already exists.")

if __name__ == "__main__":
    create_database()
