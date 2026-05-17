#!/usr/bin/env python
"""
db_init.py
----------
Initialize the backend database. Run this script once to create all tables.

Usage:
    python db_init.py [--recreate]
    
Options:
    --recreate: Drop all existing tables and recreate them (development only)
    --seed:     Populate the database with initial major data
"""

from dotenv import load_dotenv
load_dotenv()

import sys
import os
import logging
from pathlib import Path

# Add backend directory to path
sys.path.insert(0, str(Path(__file__).parent))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

from database import init_database, recreate_database, get_engine
from config import USE_MOCK, get_database_url

def seed_admissions_data():
    """Seed the database with sample admissions requirements (synchronized with create_db.py)."""
    from models.schemas import AdmissionsData
    from database import SessionLocal
    
    with SessionLocal() as session:
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
                    major_id="architecture",
                    requirements="GPA >= 3.2, IELTS >= 6.5, Portfolio required",
                    description="Ngành Kiến trúc yêu cầu sáng tạo và kỹ năng vẽ.",
                    official_url="https://admissions.vinuni.edu.vn/vi/dai-hoc/cau-hoi-thuong-gap/tuyen-sinh/"
                ),
            ]
            # Note: In a real scenario, you'd include the full list from create_db.py here
            try:
                session.add_all(sample_data)
                session.commit()
                logger.info("✓ Sample admissions data seeded successfully")
            except Exception as e:
                session.rollback()
                logger.error(f"✗ Failed to seed admissions data: {e}")
        else:
            logger.info("ℹ Admissions data already exists, skipping seeding.")

def main():
    """Main initialization function."""
    
    if USE_MOCK:
        logger.warning("USE_MOCK=True — skipping database initialization")
        return
    
    db_url = get_database_url()
    masked_url = db_url.split('@')[-1] if '@' in db_url else db_url
    logger.info(f"Database URL: {masked_url}")
    
    # Check for --recreate flag
    recreate = "--recreate" in sys.argv
    
    if recreate:
        logger.warning("Recreating database (--recreate flag detected)")
        try:
            recreate_database()
            logger.info("✓ Database recreated successfully")
        except Exception as e:
            logger.error(f"✗ Failed to recreate database: {e}")
            sys.exit(1)
    else:
        try:
            init_database()
            logger.info("✓ Database initialized successfully")
        except Exception as e:
            logger.error(f"✗ Failed to initialize database: {e}")
            sys.exit(1)

    # Default seeding (AdmissionsData) + Optional custom seeding
    seed_admissions_data()

    if "--seed" in sys.argv:
        logger.info("Running custom database seeding...")
        try:
            from utils.seed_majors import seed
            seed()
        except Exception as e:
            logger.error(f"✗ Failed to seed database: {e}")
    
    # Verify tables were created
    try:
        engine = get_engine()
        if engine:
            from sqlalchemy import inspect
            inspector = inspect(engine)
            tables = inspector.get_table_names()
            logger.info(f"✓ Tables created: {', '.join(tables)}")
    except Exception as e:
        logger.error(f"Failed to verify tables: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
