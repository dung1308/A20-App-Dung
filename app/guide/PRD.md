# PRD — VinUni Major Match

> **Nguồn gốc:** Dựa trên Day 17 Submission của Nguyễn Tiến Dũng (24/04/2026). File này bổ sung tech stack, data model, API surface và cấu trúc demo còn thiếu trong bản gốc. Nội dung sản phẩm giữ nguyên.

## Problem Statement

Học sinh THPT đứng trước quá nhiều lựa chọn ngành học tại VinUni nhưng không biết bắt đầu từ đâu, dẫn đến bị quá tải thông tin hoặc chọn sai ngành do chỉ nhìn vào tên gọi mà chưa hiểu bản chất công việc. App này là UX lab build — kiểm chứng pattern Wizard + inline audit cho AI định hướng ngành học, không production.

## Riskiest Assumption

Học sinh sẵn sàng sử dụng AI như một "Decision Support Tool" để thu hẹp lựa chọn trước khi tìm đến tư vấn viên — không phải để thay thế tư vấn viên.

## Target User

Học sinh THPT (lớp 10–12) đang quan tâm đến VinUni nhưng chưa quyết định được ngành học cụ thể.

## Users

- **Primary (Demo 1):** Học sinh THPT — trả lời wizard 4 bước, nhận Top 3 ngành + lý do match, share kết quả với phụ huynh
- **Secondary (Later):** Tư vấn viên VinUni — xem dashboard tổng hợp ngành được match nhiều nhất

## User Stories

1. **(Demo 1)** As a student, I want to share what I enjoy and what I hate, so that I can see a shortlist of majors that actually fit my personality instead of reading through 10+ brochures.
2. **(Later)** As a user who finished the session, I want to share this result with my parents so that we can have a structured discussion about my university choice.
3. **(Later)** Tư vấn viên xem dashboard: ngành nào được match nhiều nhất, học sinh nào click "Đăng ký tư vấn".

## Wizard Flow (4 bước — ~7 phút)

```
Bước 1 — Sở thích (Interests)
  "Bạn thích làm gì nhất khi có thời gian tự do?"
  Multi-select, 8 options + Other (free text)

Bước 2 — Thế mạnh (Strengths)
  "Bạn thường được khen về điều gì?"
  Multi-select, 8 options + Other

Bước 3 — Không thích (Dislikes)
  "Điều gì khiến bạn cảm thấy mệt mỏi hoặc không muốn làm?"
  Multi-select, 8 options + Other

Bước 4 — Phong cách làm việc (Work style)
  "Bạn thích làm việc theo kiểu nào?"
  Single-select, 4 options:
    - Một mình, tập trung sâu
    - Nhóm nhỏ, cộng tác chặt
    - Nhiều người, năng động
    - Linh hoạt, tuỳ bối cảnh
```

## Data Model

### Majors (static mock — 9 ngành VinUni, nhúng thẳng trong mockData.js)

```js
const VINUNI_MAJORS = [
  {
    id: "cs",
    name: "Khoa học Máy tính",
    college: "CECS",
    tagline: "Xây dựng phần mềm, AI và hệ thống số",
    what_students_do: "Sinh viên CS tại VinUni làm việc với AI, xây dựng ứng dụng, nghiên cứu thuật toán và thực tập tại các công ty công nghệ như VNG, KMS, FPT.",
    keywords: ["logic", "problem-solving", "code", "math", "research", "systems"]
  },
  {
    id: "ee",
    name: "Kỹ thuật Điện — Điện tử",
    college: "CECS",
    tagline: "Thiết kế phần cứng, hệ thống nhúng, IoT",
    what_students_do: "Sinh viên EE thiết kế mạch điện, lập trình vi điều khiển, làm dự án IoT và thực tập tại các nhà máy sản xuất điện tử.",
    keywords: ["hands-on", "hardware", "tinkering", "math", "physics", "systems"]
  },
  {
    id: "me",
    name: "Kỹ thuật Cơ khí",
    college: "CECS",
    tagline: "Thiết kế máy móc, robot, sản xuất",
    what_students_do: "Sinh viên ME làm với CAD/CAM, in 3D, robotics và thực tập tại các nhà máy hoặc công ty sản xuất.",
    keywords: ["hands-on", "design", "physics", "build", "robot", "manufacturing"]
  },
  {
    id: "bme",
    name: "Kỹ thuật Y sinh",
    college: "CECS",
    tagline: "Giao điểm của kỹ thuật và y tế",
    what_students_do: "Sinh viên BME thiết kế thiết bị y tế, nghiên cứu cùng bệnh viện, có thể học tiếp y khoa hoặc làm trong ngành dược/thiết bị y tế.",
    keywords: ["biology", "helping", "research", "medicine", "design", "science"]
  },
  {
    id: "ba",
    name: "Quản trị Kinh doanh",
    college: "CBM",
    tagline: "Chiến lược, marketing, khởi nghiệp",
    what_students_do: "Sinh viên BA làm case study thực tế, tham gia cuộc thi khởi nghiệp, thực tập tại công ty lớn hoặc startup.",
    keywords: ["leadership", "people", "strategy", "communication", "entrepreneurship", "flexible"]
  },
  {
    id: "finance",
    name: "Tài chính",
    college: "CBM",
    tagline: "Phân tích tài chính, đầu tư, ngân hàng",
    what_students_do: "Sinh viên Finance học mô hình tài chính, phân tích cổ phiếu, thực tập tại ngân hàng, quỹ đầu tư hoặc công ty tài chính.",
    keywords: ["numbers", "analysis", "math", "economics", "detail-oriented", "research"]
  },
  {
    id: "data_science",
    name: "Khoa học Dữ liệu",
    college: "CECS",
    tagline: "Phân tích dữ liệu, machine learning, thống kê",
    what_students_do: "Sinh viên Data Science làm Python, SQL, xây model dự đoán và thực tập tại các công ty dữ liệu, fintech hoặc healthcare.",
    keywords: ["math", "statistics", "research", "problem-solving", "code", "analysis"]
  },
  {
    id: "liberal_arts",
    name: "Khoa học Xã hội & Nhân văn",
    college: "CAS",
    tagline: "Tư duy phản biện, viết, nghiên cứu xã hội",
    what_students_do: "Sinh viên CAS viết nghiên cứu, tranh luận, phân tích xã hội — có thể đi theo hướng luật, báo chí, chính sách công.",
    keywords: ["writing", "reading", "discussion", "research", "social", "critical-thinking"]
  },
  {
    id: "architecture",
    name: "Kiến trúc",
    college: "CECS",
    tagline: "Thiết kế không gian, đô thị, sáng tạo",
    what_students_do: "Sinh viên Kiến trúc làm đồ án thiết kế, học AutoCAD/Revit, thực tập tại công ty kiến trúc trong và ngoài nước.",
    keywords: ["design", "creative", "visual", "art", "spatial", "build"]
  }
]
```

### Session (in-memory, trong Express mock)

```js
{
  session_id,           // uuid
  answers: {
    interests: [],      // string[]
    strengths: [],      // string[]
    dislikes: [],       // string[]
    work_style: ""      // string
  },
  result: {
    top3: [
      {
        major_id,
        major_name,
        match_reason,       // 2–3 câu, tiếng Việt, cụ thể với answers của user
        what_students_do,   // copy từ VINUNI_MAJORS
        match_score         // 0–100, AI tự đánh giá
      }
    ],
    fallback: false,        // true nếu AI không thể match
    disclaimer: "Kết quả do AI phân tích dựa trên câu trả lời của bạn — không thay thế buổi tư vấn trực tiếp."
  },
  created_at
}
```

## Tech Stack

- **Frontend:** React 18 + Vite + plain JSX + inline styles (không Tailwind, không TypeScript)
- **Backend:** Python + FastAPI (in-memory, không DB)
- **LLM:** OpenAI API (model `gpt-4o`) qua `llm_service.py`
- **Storage:** In-memory dict trong Python, không SQLite, không file persistence
- **Không dùng:** TypeScript, Tailwind, SQLite, authentication thật

## API Surface

- **POST /api/match** — gửi `{ session_id, answers }` → AI phân tích → lưu session → trả về `{ top3[], fallback, disclaimer }`

## Fallback UX

**Trigger:** AI không thể xác định Top 3 rõ ràng (answers quá mâu thuẫn hoặc quá chung chung).

**Response:** Không hiện Top 3 giả. Hiện message:
> "Câu trả lời của bạn cho thấy nhiều hướng tiềm năng khác nhau. Hãy nói chuyện trực tiếp với tư vấn viên để tìm ra lựa chọn phù hợp nhất."

**CTA:** Nút "Đăng ký gặp tư vấn viên" (link mock, `href="#"`).

## Success Metrics

**Core Value:**
- % user hoàn thành đủ 4 bước wizard và nhận được report
- % user nhấn "Chia sẻ kết quả với phụ huynh"
- % user đánh giá Usefulness > 8/10 (qua thumbs up/down đơn giản cuối report)

**Funnel:**
- % click "Đăng ký tư vấn chuyên sâu" ở cuối report
- % user quay lại refine trong 7 ngày (Later — cần persistence)

## Hypothesis

"Đưa ví dụ thực tế 'Sinh viên ngành này đang làm gì' giúp user nhận diện ngành tốt hơn mô tả học thuật."
Test: A/B giữa report lý thuyết vs. thực tế, đo tỷ lệ click đăng ký tư vấn.

## Open Questions

1. **AI không "nịnh" user:** Prompt GPT-4o phải yêu cầu: (a) chỉ chọn đúng 3 ngành từ danh sách 9 ngành cố định, (b) giải thích tại sao 6 ngành còn lại KHÔNG phù hợp dựa trên dislikes của user, (c) nếu không đủ tín hiệu → trả `fallback: true` thay vì nịnh. Validate ở `llm_service.py`: nếu `top3` có ngành không trong danh sách 9 → reject.
2. **Duy trì tương tác 7 ngày:** Cần persistence (Later). Baseline không giải quyết — ghi vào Out of Scope.

## Out of Scope

- So sánh giữa các ngành (No Compare)
- Tích hợp CRM
- Dữ liệu lương / triển vọng tài chính
- Auth / login
- Share report với phụ huynh (Later — cần persistent session URL)
- Persistent DB (sessions mất khi restart server)
- Mobile layout, dark mode, i18n
- Dashboard tư vấn viên (Later)
- Tích hợp lịch hẹn thật
- Refine / re-run session (Later)

## Update Notes - System Tokens, Database, Resources

### System / Tokens

- Add a `/system/tokens` dashboard for checking LLM token usage.
- Filters: time window, user email, and AI route/tool.
- Show summary cards for total tokens, prompt tokens, completion tokens, and request count.
- Add a frequency graph so admins/staff can see request volume and token usage over time.
- Use audit logs as the default source. If provider token counters are not stored yet, estimate tokens from input/output text length and label the data as estimated.

### System / Database - Prompt Versioning

- Extend `/system/database` beyond user management with prompt versioning controls.
- Admin can update or create a prompt with `agent_name`, version number/name, and prompt content.
- Admin can compare two prompt versions with the same test input and inspect the rendered output side by side.
- Admin can select a prompt version for immediate runtime use where the active backend agent supports live prompt replacement.
- Persist the selected prompt content under a `selected` alias so the chosen version is visible in PostgreSQL.

### Tai nguyen

- Add a `Tai nguyen` page for students.
- The page explains when to use Wizard, Profile/CV PDF, AI Consultant, and Report.
- Add a sidebar entry so students can find the usage docs without needing staff/admin access.

### Report

- Report should recover the latest generated result after page refresh for the logged-in user.
- Show a summary header with number of recommended majors, average match score, and verified-source count.
- Keep the Top 3 major cards focused on fit rationale, student experience, match score, and official source status.
- Add clear next actions: update Profile/CV, rerun Wizard, ask AI follow-up questions, or request human consultation.

### Staff / Human Fallback

- When AI fallback or safety escalation happens, create a pending handoff job for staff.
- `/staff` must show pending fallback jobs for both admin and editor roles.
- Staff can inspect the fallback question, handoff summary, and the student's latest chat session.
- Admin/editor can accept a job or mark it busy.
- After accepting, staff can send a human reply that is saved into the student's chat session as a human advisor message.
- Student chat should refresh periodically so human advisor replies appear without requiring a page reload.

### CV Extraction, OCR, and Profile Merge

- CV upload is a first-class profile feature, not only a one-time Wizard attachment.
- The backend should extract embedded PDF text first, then fall back to OCR when text is missing or too short.
- OCR must support English and Vietnamese CVs and be configurable through extraction settings such as minimum text length, OCR page limit, language list, render scale, and Tesseract command path.
- CV parsing should fail soft: if LLM parsing times out or returns weak output, local fallback extraction still returns useful structured data.
- Structured CV data should include personal info, summary, career goals, skills, GPA or GPA estimate, education, experience, projects, certifications, achievements, languages, and parsing metadata.
- CV signal extraction should use both raw text and structured data to produce skills, job titles, suggested majors, major explanations, GPA estimate, and persona summary.
- Upload response should return `cv_text`, `structured_data`, `cv_signals`, extraction metadata, and `cv_document_id`.
- Users should review and edit extracted fields before confirming them into Profile.
- Confirming a CV should merge only non-empty extracted fields so useful existing profile data is not overwritten by empty arrays or blank strings.
- Profile should show uploaded CV document versions and allow users to view, confirm, and delete CV documents.
- Wizard should keep `cv_document_id` and structured CV data, then pass them into `/api/match` so recommendations can use the selected CV.
- If `/api/match` does not receive CV text/signals directly, the backend should use the active confirmed CV/profile context when available.
- RAG retrieval should include the user's active CV collection when a `user_id` is available, using safe collection names and non-colliding document IDs for repeated uploads.
