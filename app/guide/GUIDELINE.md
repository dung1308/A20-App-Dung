# GUIDELINE — VinUni Major Match

> Tech stack + constraints: xem `PRD §Tech Stack` và `PRD §Constraints`.
> Data model (9 ngành, session shape): xem `PRD §Data Model`.

---

## UI Pattern

**4. Wizard + Inline Audit**

Tại sao pattern này: user điền 4 bước (interests, strengths, dislikes, work style) → AI kiểm tra tổng hợp và trả ra Top 3 ngành với lý do cụ thể. Multi-step form với AI-generated output — không phải chat, không phải upload. Pattern 4 khớp chính xác.

Điểm khác với pattern 4 chuẩn: audit xảy ra ở cuối (tổng hợp 4 bước) thay vì per-field. Đây là biến thể hợp lệ.

---

## Visual Style

**Minimal clean** — Linear/Notion feel, professional nhưng thân thiện với học sinh.

Quy tắc:
- Nền trắng `#ffffff`, chữ chính `#1a1a1a`, chữ muted `#6b7280`
- Font: `system-ui, -apple-system, sans-serif`; base 15px; line-height 1.6
- Spacing unit: 16px; padding card: 24px; gap: 12–16px
- Border: `1px solid #e5e7eb`; border-radius: 10px (card), 6px (button/chip)
- Không shadow nặng — `box-shadow: 0 1px 4px rgba(0,0,0,0.08)` nếu cần
- Button chính: nền `#1a1a1a`, chữ trắng, hover `#333`
- Button chip (multi-select): border `#e5e7eb` nền trắng → selected: border `#1a1a1a` nền `#f9fafb`
- Màu match score: ≥70 → `#16a34a` / 40–69 → `#d97706` / <40 → `#dc2626`
- Progress bar wizard: `#1a1a1a` trên nền `#f3f4f6`

---

## User Flow

### Demo 1 — Học sinh (toàn bộ flow)

1. **Landing:** Học sinh thấy headline "Tìm 3 ngành VinUni phù hợp nhất với bạn — chỉ trong 7 phút." + nút "Bắt đầu".
2. **Wizard 4 bước:** Progress bar trên cùng (Bước 1/4 → 4/4). Mỗi bước là một câu hỏi multi-select hoặc single-select. Học sinh chọn xong bấm "Tiếp theo". Có thể bấm "Quay lại" mà không mất data.
3. **Loading:** Sau bước 4, màn hình loading ("Đang phân tích câu trả lời của bạn...") trong khi frontend POST đến `/api/match` → FastAPI gọi `llm_service.py` → GPT-4o trả về kết quả.
4. **Report:** Hiện Top 3 ngành, mỗi ngành có: tên, match score (dot màu + số), lý do match (2–3 câu cụ thể với answers của user), và box "Sinh viên ngành này đang làm gì". Disclaimer ở dưới mỗi ngành.
5. **Actions:** Nút "Đăng ký tư vấn chuyên sâu" (CTA chính) + nút "Bắt đầu lại" (reset wizard).

---

## T·C·R Checklist

### T — Transparency (AI đang làm gì thì hiện ra)

- [ ] Match score hiện với dot màu (xanh/vàng/đỏ) + số rõ ràng (VD: "Phù hợp: 78/100") trên mỗi ngành
- [ ] Lý do match cụ thể với answers của user — không được chung chung (VD: "Bạn chọn 'thích nghiên cứu' và 'ghét làm việc lặp lại' → CS phù hợp vì..." chứ không phải "CS là ngành tốt")
- [ ] Box "Sinh viên ngành này đang làm gì" — dữ liệu thực tế từ `what_students_do` trong mock_data.py, không hallucinate
- [ ] Loading state rõ ràng ("Đang phân tích...") — không để màn hình trắng
- [ ] Disclaimer trên mỗi ngành: *"Kết quả do AI phân tích dựa trên câu trả lời của bạn — không thay thế buổi tư vấn trực tiếp."*

### C — Control (học sinh can thiệp được)

- [ ] Nút "Quay lại" ở mỗi bước — giữ nguyên các lựa chọn đã chọn ở bước trước (không reset)
- [ ] "Bắt đầu lại" ở trang report — reset toàn bộ wizard, về bước 1
- [ ] Nút "Đăng ký tư vấn chuyên sâu" — CTA rõ ràng ở cuối report (link mock)

## CV Extraction / Profile Update

- CV upload must return raw extracted text, structured CV data, CV signals, extraction metadata, and a `cv_document_id`.
- PDF extraction should use embedded text first and OCR fallback when text is missing or too short.
- CV review should let the user inspect and edit extracted fields before confirming into Profile.
- Profile must preserve existing useful data when CV extraction returns empty fields.
- Profile should list uploaded CV versions and support view/confirm/delete actions.
- Wizard should pass `cv_document_id` and structured CV context into match requests when available.
- Chat/RAG should use active confirmed CV/profile context for user-specific answers.
- Backend implementation files: `services/pdf_loader.py`, `services/cv_parser.py`, `agents/cv_agent.py`, `models/schemas.py`, `services/db_service.py`, `main.py`, `services/rag_service.py`.
- Frontend implementation files: `components/CVUpload/CVUpload.jsx`, `pages/ProfilePage.jsx`, `pages/WizardPage.jsx`, `services/api.js`, `state/store.js`.

### R — Recovery (khi AI sai / mạng lỗi / input thiếu)

- [ ] **Fallback UX:** Nếu AI trả về `fallback: true` → không hiện Top 3 giả → hiện message fallback + CTA đăng ký tư vấn (xem `PRD §Fallback UX`)
- [ ] **LLM error:** try/catch ở frontend quanh POST /api/match → nếu lỗi mạng hoặc API fail: hiện màn hình lỗi "Có lỗi xảy ra. Vui lòng thử lại." + nút "Thử lại" (giữ nguyên answers trong React state, không bắt user điền lại)
- [ ] **Validation:** Mỗi bước phải chọn ít nhất 1 option trước khi bấm "Tiếp theo" — hiện cảnh báo inline nhẹ ("Hãy chọn ít nhất 1 lựa chọn"), KHÔNG block bằng alert/modal
- [ ] **Validate output:** `llm_service.py` phải kiểm tra `top3` chỉ chứa `major_id` thuộc danh sách 9 ngành — nếu AI trả ngành lạ → reject và trigger fallback

---

## Hinge Rule

Mọi LLM call đi qua `backend/llm_service.py`. Frontend và các module Python khác không bao giờ import OpenAI SDK trực tiếp. Đổi provider = edit 1 file duy nhất.

**Shape bắt buộc `llm_service.py` phải trả về:**

```python
# llm_service.py dùng openai Python SDK, model gpt-4o
# export một hàm duy nhất:

async def match_majors(answers: dict) -> dict:
    # Gọi GPT-4o với prompt được thiết kế để:
    # 1. Chỉ chọn từ 9 major_id cố định
    # 2. Giải thích match_reason cụ thể với answers (không chung chung)
    # 3. Trả về fallback: True nếu không đủ tín hiệu
    # 4. Trả về JSON thuần, không markdown

    # Shape trả về:
    return {
        "top3": [
            {
                "major_id": "cs",           # phải thuộc 9 id cố định
                "major_name": "Khoa học Máy tính",
                "match_reason": "...",      # 2–3 câu, tiếng Việt, cụ thể
                "match_score": 82           # 0–100
            },
            # ... 2 ngành nữa
        ],
        "fallback": False
    }
```

**Validation bắt buộc trong `llm_service.py`:**
```python
VALID_IDS = {"cs","ee","me","bme","ba","finance","data_science","liberal_arts","architecture"}
# Nếu bất kỳ major_id nào không thuộc VALID_IDS → raise ValueError → FastAPI trả fallback: true
```

---

## Cấu Trúc File (để Claude Code không phải đoán)

```
/
├── PRD.md
├── GUIDELINE.md
├── frontend/
│   ├── src/
│   │   ├── App.jsx                ← router đơn giản: / = Wizard flow
│   │   ├── LandingPage.jsx        ← headline + nút Bắt đầu
│   │   ├── Wizard.jsx             ← container giữ state 4 bước + progress bar
│   │   ├── WizardStep.jsx         ← 1 bước: question + options (multi/single select)
│   │   ├── LoadingScreen.jsx      ← "Đang phân tích..." khi đợi API
│   │   ├── ReportPage.jsx         ← hiện Top 3 + actions
│   │   └── MajorCard.jsx          ← 1 ngành: tên + score + reason + what_students_do
│   └── vite.config.js             ← proxy /api → localhost:8000
└── backend/
    ├── main.py                    ← FastAPI: POST /api/match
    ├── llm_service.py             ← hinge rule — toàn bộ GPT-4o call ở đây
    └── mock_data.py               ← VINUNI_MAJORS list (9 ngành) + in-memory sessions dict
```

---

## Không Build Những Thứ Này (Yet)

- Share report với phụ huynh (Later — cần persistent session URL)
- Auth / login — không cần cho demo
- Persistent DB — sessions mất khi restart server, chấp nhận được
- Mobile layout / responsive polish
- Dark mode
- Dashboard tư vấn viên (Later)
- Refine / re-run session từ cùng answers
- So sánh ngành side-by-side
- Dữ liệu lương, học bổng, điểm chuẩn
- T·C·R đầy đủ — build baseline trước, chạy `/tcr-apply` sau khi baseline chạy được
