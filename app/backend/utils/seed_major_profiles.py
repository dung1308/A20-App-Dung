"""Seed detailed VinUni major profiles from source-backed JSON files."""

import json
import sys
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

sys.path.insert(0, str(Path(__file__).parent.parent))

import database
from database import init_database
from models.schemas import AdmissionsData, MajorContentSection

DATA_DIR = Path(__file__).parent.parent / "data" / "majors"

PROFILE_FILES = {
    "ba": ("vinuni_sections_full_QTKD.json", "Viện Kinh doanh Quản trị", "Cử nhân Quản trị Kinh doanh"),
    "finance": ("vinuni_sections_full_TCNH.json", "Viện Kinh doanh Quản trị", "Cử nhân Tài chính Ngân hàng"),
    "hospitality_management": ("vinuni_sections_full_QTKS.json", "Viện Kinh doanh Quản trị", "Cử nhân Quản trị Khách sạn"),
    "data_science": ("vinuni_sections_full_KHDL.json", "Viện Kỹ thuật và Khoa học Máy tính", "Cử nhân Khoa học Dữ liệu"),
    "ee": ("vinuni_sections_full_KTĐ.json", "Viện Kỹ thuật và Khoa học Máy tính", "Cử nhân Kỹ thuật Điện & Máy tính"),
    "me": ("vinuni_sections_full_KTCK.json", "Viện Kỹ thuật và Khoa học Máy tính", "Cử nhân Kỹ thuật Cơ khí"),
    "economics": ("vinuni_sections_full_KinhTe.json", "Viện Khoa học và Giáo dục Khai phóng", "Cử nhân Kinh tế"),
    "psychology": ("vinuni_sections_full_TamLy.json", "Viện Khoa học và Giáo dục Khai phóng", "Cử nhân Tâm lý học"),
    "multimedia_communication": ("vinuni_sections_full_TTĐPT.json", "Viện Khoa học và Giáo dục Khai phóng", "Cử nhân Truyền thông Đa phương tiện"),
}

DEFAULT_ENTRY_REQUIREMENTS = (
    "H\u1ed3 s\u01a1 \u1ee9ng tuy\u1ec3n \u0111\u1ea1i h\u1ecdc n\u0103m nh\u1ea5t c\u1ea7n chu\u1ea9n b\u1ecb:\n"
    "1. Th\u00f4ng tin c\u00e1 nh\u00e2n.\n"
    "2. CV m\u1ed9t trang.\n"
    "3. M\u1ed9t b\u00e0i tr\u1ea3 l\u1eddi ng\u1eafn theo \u0111\u1ec1 c\u1ee7a VinUni.\n"
    "4. H\u1ed3 s\u01a1 h\u1ecdc thu\u1eadt: \u0111i\u1ec3m l\u1edbp 10, 11, 12; gi\u1ea3i th\u01b0\u1edfng; k\u1ef3 thi chu\u1ea9n h\u00f3a n\u1ebfu c\u00f3.\n"
    "5. Th\u00e0nh t\u00edch ngo\u00e0i h\u1ecdc thu\u1eadt.\n"
    "6. Th\u00f4ng tin li\u00ean h\u1ec7 c\u1ee7a hai ng\u01b0\u1eddi tham chi\u1ebfu.\n\n"
    "Y\u00eau c\u1ea7u ti\u1ebfng Anh t\u1ed1i thi\u1ec3u \u0111\u1ec3 nh\u1eadp h\u1ecdc kh\u00f4ng \u0111i\u1ec1u ki\u1ec7n:\n"
    "- IELTS Academic 6.5 t\u1ed5ng, kh\u00f4ng k\u1ef9 n\u0103ng n\u00e0o d\u01b0\u1edbi 6.0; ho\u1eb7c ch\u1ee9ng ch\u1ec9 t\u01b0\u01a1ng \u0111\u01b0\u01a1ng \u0111\u01b0\u1ee3c VinUni ch\u1ea5p nh\u1eadn nh\u01b0 TOEFL iBT, PTE Academic, Cambridge English, VSTEP theo quy \u0111\u1ecbnh hi\u1ec7n h\u00e0nh.\n\n"
    "VinUni \u0111\u00e1nh gi\u00e1 h\u1ed3 s\u01a1 to\u00e0n di\u1ec7n theo c\u00e1c ti\u00eau ch\u00ed AACC v\u00e0 EXCEL, sau \u0111\u00f3 c\u00f3 v\u00f2ng ph\u1ecfng v\u1ea5n/\u0111\u00e1nh gi\u00e1 c\u00e1 nh\u00e2n \u0111\u1ed1i v\u1edbi \u1ee9ng vi\u00ean \u0111\u01b0\u1ee3c ch\u1ecdn v\u00e0o danh s\u00e1ch ng\u1eafn."
)


def _official_url(sections):
    for section in sections:
        for link in section.get("links") or []:
            href = link.get("href")
            if href and "vinuni.edu.vn" in href:
                parts = urlsplit(href)
                return urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))
    return None


def seed_major_profiles():
    from utils.seed_majors import seed as seed_majors

    seed_majors()
    with database.SessionLocal() as session:
        for major_id, (filename, school, degree_name) in PROFILE_FILES.items():
            sections = json.loads((DATA_DIR / filename).read_text(encoding="utf-8"))
            first_paragraphs = next((section.get("paragraphs") or [] for section in sections if section.get("paragraphs")), [])
            overview = first_paragraphs[0] if first_paragraphs else None

            admissions = session.query(AdmissionsData).filter(AdmissionsData.major_id == major_id).first()
            if admissions is None:
                admissions = AdmissionsData(major_id=major_id)
                session.add(admissions)
            admissions.description = overview or admissions.description
            admissions.requirements = admissions.requirements or DEFAULT_ENTRY_REQUIREMENTS
            admissions.official_url = _official_url(sections) or admissions.official_url
            admissions.school_or_college = school
            admissions.degree_name = degree_name
            admissions.source_file = filename
            admissions.raw_sections = sections

            session.query(MajorContentSection).filter(MajorContentSection.major_id == major_id).delete()
            for section in sections:
                session.add(
                    MajorContentSection(
                        major_id=major_id,
                        section_index=section.get("section_index") or 0,
                        title=section.get("title"),
                        paragraphs=section.get("paragraphs") or [],
                        list_items=section.get("list_items") or [],
                        links=section.get("links") or [],
                        images=section.get("images") or [],
                        tables=section.get("tables") or [],
                    )
                )
        session.commit()


if __name__ == "__main__":
    init_database()
    seed_major_profiles()
