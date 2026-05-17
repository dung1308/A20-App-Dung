"""
utils/seed_majors.py
----------------------
Seeds the 'majors' table with official VinUni major definitions.
"""

import sys
from pathlib import Path

# Add backend directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from database import SessionLocal, init_database
from models.schemas import Major
from config import USE_MOCK
from utils.logger import get_logger

logger = get_logger(__name__)

MAJORS_DATA = [
    {
        "id": "ee", 
        "name": "Kỹ thuật Điện & Máy tính", 
        "description": "Sinh viên ECE học nền tảng kỹ thuật điện, kỹ thuật máy tính, lập trình, mạch điện, hệ thống nhúng, IoT, vi điện tử, viễn thông và các công nghệ năng lượng."
    },
    {
        "id": "me", 
        "name": "Kỹ thuật Cơ khí", 
        "description": "Sinh viên ME làm với CAD/CAM, in 3D, robotics và thực tập tại các nhà máy hoặc công ty sản xuất."
    },
    {
        "id": "ba", 
        "name": "Quản trị Kinh doanh", 
        "description": "Sinh viên BA làm case study thực tế, tham gia cuộc thi khởi nghiệp, thực tập tại công ty lớn hoặc startup."
    },
    {
        "id": "finance", 
        "name": "Tài chính", 
        "description": "Sinh viên Finance học mô hình tài chính, phân tích cổ phiếu, thực tập tại ngân hàng, quỹ đầu tư."
    },
    {
        "id": "economics",
        "name": "Kinh tế",
        "description": "Sinh viên Kinh tế học về thị trường, thể chế, đổi mới sáng tạo và phân tích chính sách."
    },
    {
        "id": "psychology",
        "name": "Tâm lý học",
        "description": "Sinh viên Tâm lý học nghiên cứu hành vi con người, giáo dục và ứng dụng trong tổ chức."
    },
    {
        "id": "multimedia_communication",
        "name": "Truyền thông Đa phương tiện",
        "description": "Sinh viên Truyền thông Đa phương tiện học truyền thông số, quan hệ công chúng và sản xuất nội dung."
    },
    {
        "id": "hospitality_management",
        "name": "Quản trị Khách sạn",
        "description": "Sinh viên Quản trị Khách sạn học vận hành dịch vụ, trải nghiệm khách hàng và quản lý khách sạn."
    },
    {
        "id": "data_science", 
        "name": "Khoa học Dữ liệu", 
        "description": "Sinh viên Data Science làm Python, SQL, xây model dự đoán và thực tập tại các công ty dữ liệu, fintech."
    },
]

def seed():
    db = SessionLocal()
    try:
        for entry in MAJORS_DATA:
            major = db.query(Major).filter(Major.id == entry["id"]).first()
            if not major:
                db.add(Major(**entry))
                logger.info(f"Seeded major: {entry['id']}")
            else:
                major.name = entry["name"]
                major.description = entry["description"]
        db.commit()
        logger.info("Majors seeded successfully.")
    finally:
        db.close()

if __name__ == "__main__":
    seed()
