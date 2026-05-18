# Nhật ký tuần - VinUni Admission Assistant

**Thành viên nhóm:** Nguyễn Tiến Dũng, Hoàng Đức Nghĩa, Hoàng Vĩnh Giang

File này là báo cáo hàng tuần cho quá trình xây dựng sản phẩm VinUni Admission Assistant từ Chủ nhật 05/04/2026 đến Chủ nhật 17/05/2026. Mỗi tuần ghi lại mục tiêu, kết quả, khó khăn, cách nhóm dùng AI coding tools, bài học và kế hoạch tiếp theo.

---

## Tuần 1: 05/04/2026 - 11/04/2026

### Mục tiêu

Khởi động dự án, chọn workflow dùng AI coding tools, so sánh các hướng sản phẩm khả thi và xác định MVP đầu tiên cho bài toán tư vấn chọn ngành.

### Đã làm

- Bắt đầu journal và thống nhất cách ghi lại quá trình làm sản phẩm.
- So sánh GitHub Copilot, Gemini Code Assist và OpenAI Codex cho workflow của nhóm.
- Quyết định dùng Copilot cho autocomplete/code nhỏ, Gemini cho brainstorm/debug/so sánh hướng làm, Codex cho thay đổi lớn cần hiểu repo và viết tài liệu.
- So sánh các track sản phẩm: chấm tài liệu, theo dõi bằng camera, trợ lý gợi ý/chọn ngành.
- Chọn hướng chính là Major Choosing/Admission Assistant vì giải quyết trực tiếp pain point của học sinh.
- Định nghĩa MVP tối thiểu:
  - Thu thập sở thích/thế mạnh/phong cách học sinh.
  - Gợi ý ngành phù hợp.
  - Giải thích lý do match.
  - Có chat/advisor đơn giản.
  - Có backend API ban đầu.
- Bắt đầu tạo skeleton frontend/backend và các service gọi API đầu tiên.

### Khó khăn

Khó nhất là giữ phạm vi nhỏ. Nhóm có nhiều ý tưởng AI khác nhau, nhưng nếu làm quá rộng thì sản phẩm sẽ thiếu trọng tâm. Tuần này nhóm phải chọn một vấn đề đủ rõ: giúp học sinh chọn ngành VinUni có căn cứ.

### AI tools đã dùng

| Tool | Dùng để làm gì | Kết quả |
|---|---|---|
| GitHub Copilot | Gợi ý code nhanh, component nhỏ, helper API | Tăng tốc các phần triển khai lặp lại |
| Gemini Code Assist | So sánh track sản phẩm, brainstorm MVP | Giúp làm rõ pros/cons |
| OpenAI Codex | Lập kế hoạch, chia MVP, viết tài liệu ban đầu | Giúp biến ý tưởng thành backlog có thứ tự |

### Bài học

- AI coding tools hữu ích nhất khi nhóm đã có mục tiêu rõ.
- MVP cần chứng minh giá trị chính trước khi thêm admin, CV, RAG hoặc handoff.
- Với sản phẩm tư vấn tuyển sinh, giải thích "vì sao" quan trọng không kém kết quả gợi ý.

### Kế hoạch tuần sau

- Xây dựng app shell, Wizard, Report và contract backend/frontend đầu tiên.
- Bắt đầu nghĩ về dữ liệu profile và RAG để câu trả lời không chỉ dựa vào prompt.

---

## Tuần 2: 12/04/2026 - 18/04/2026

### Mục tiêu

Mở rộng MVP thành trải nghiệm dùng được: frontend app shell, Wizard flow, API contracts, recommendation đầu tiên, định hướng Advisor/RAG và profile data.

### Đã làm

- Thiết kế dữ liệu profile học sinh nên lưu: GPA, IELTS/test scores, preferred majors, interests, strengths, profile data.
- Xây app shell frontend với các route chính: dashboard, wizard, consultant, report, profile.
- Tách API calls ra service layer để frontend dễ đồng bộ với backend.
- Thiết kế contract cho `/api/match` và `/api/chat`.
- Xử lý các lỗi UI/state ban đầu như form reset, loading spinner, map undefined khi majors chưa load.
- Tạo recommendation flow đầu tiên cho Top 3 ngành.
- Bắt đầu định hướng RAG/advisor: câu hỏi tuyển sinh nên có nguồn, câu hỏi chọn ngành nên dùng profile context.
- Bắt đầu nghĩ theo framework Trust, Control, Recovery, Clarity, Safety để tránh app chỉ là chatbot chung chung.

### Khó khăn

Frontend và backend thay đổi cùng lúc nên dễ lệch field response. Nhóm nhận ra cần có một API boundary ổn định thay vì để từng component tự parse response.

### AI tools đã dùng

| Tool | Dùng để làm gì | Kết quả |
|---|---|---|
| GitHub Copilot | Component UI, helper, validation, state fixes | Hoàn thành nhanh các phần nhỏ |
| Gemini Code Assist | Brainstorm profile fields và RAG/advisor tradeoff | Giúp định hướng data model |
| OpenAI Codex | API contract, frontend/backend alignment, docs | Giúp giảm lệch contract |

### Bài học

- Profile data là nền tảng để tư vấn ngành cá nhân hóa hơn.
- Service layer frontend giúp giảm lỗi khi backend đổi contract.
- Recommendation cần có match reason, không chỉ trả major name.

### Kế hoạch tuần sau

- Thiết kế CV parsing, RAG knowledge base, guardrails và human handoff.
- Mở rộng app từ MVP thành hệ thống có safety/recovery.

---

## Tuần 3: 19/04/2026 - 25/04/2026

### Mục tiêu

Thiết kế các lớp tin cậy: CV parsing, RAG, guardrails, staff handoff và admin operations.

### Đã làm

- Xác định CV upload cần parse an toàn, không ghi đè profile cũ một cách mù quáng.
- Thiết kế RAG cho admissions data để câu trả lời tuyển sinh có nguồn và dễ cập nhật.
- Thiết kế guardrails: blocked topics, prompt injection, fabricated claims, PII leakage, overcommitment.
- Định nghĩa escalation/handoff: khi AI không chắc hoặc câu hỏi cần xác nhận, hệ thống chuyển sang tư vấn viên.
- Thiết kế staff handoff flow: pending job, staff accept/busy, xem context, gửi human reply.
- Định hướng admin operations: audit logs, metrics, token usage, prompt versioning, RAG sync.
- Cải thiện text nút handoff và các trạng thái pending cho dễ hiểu hơn.

### Khó khăn

Bài toán tuyển sinh có rủi ro cao hơn chatbot thông thường. AI không được hứa chắc chắn đậu, học bổng hoặc chính sách chưa có nguồn. Nhóm phải ưu tiên "AI biết dừng lại" thay vì cố trả lời mọi thứ.

### AI tools đã dùng

| Tool | Dùng để làm gì | Kết quả |
|---|---|---|
| Gemini Code Assist | Guardrail strategy, RAG update flow, admin needs | Giúp so sánh các hướng safety |
| GitHub Copilot | UI text, navigation icons, frontend helper | Tăng tốc chỉnh UI |
| OpenAI Codex | Staff handoff design, audit/admin planning | Biến recovery flow thành thiết kế rõ ràng |

### Bài học

- Với admissions, truthful uncertainty tốt hơn false confidence.
- Human handoff không phải fallback thất bại, mà là một phần của thiết kế an toàn.
- RAG cần có source labels để user biết thông tin đến từ đâu.

### Kế hoạch tuần sau

- Bổ sung database/auth/roles, prompt architecture và các trang Profile/Resources/Report rõ hơn.
- Chuẩn bị mở rộng backend từ mock logic sang persistence.

---

## Tuần 4: 26/04/2026 - 02/05/2026

### Mục tiêu

Chuyển từ prototype sang hệ thống có persistence, auth/roles, prompt/agent architecture và kế hoạch CV nhiều version.

### Đã làm

- Định hướng Report page: hiển thị Top 3 ngành, match score, rationale, evidence và next actions.
- Lên kiến trúc agent/prompt: Router, Advisor, RAG, CRM/Profile, Judge.
- Thiết kế database và migration cho user, student profile, chat session, audit log, major/admissions data.
- Thêm authentication/roles để phân biệt user, editor/staff và admin.
- Lên kế hoạch OCR fallback cho CV scan.
- Thiết kế lưu CV nhiều version để không mất dữ liệu profile cũ.
- Bắt đầu review-before-merge cho dữ liệu CV: user xem và xác nhận trước khi merge vào Profile.
- Thêm helper gọi profile readiness và các trạng thái liên quan.

### Khó khăn

CV extraction là phần dễ gây hỏng trust. Nếu AI parse sai rồi ghi thẳng vào profile, user sẽ mất kiểm soát. Vì vậy nhóm quyết định dữ liệu CV cần có review-before-merge và chỉ merge field không rỗng.

### AI tools đã dùng

| Tool | Dùng để làm gì | Kết quả |
|---|---|---|
| OpenAI Codex | Thiết kế CV versioning, review-before-merge, agent architecture | Tạo hướng implementation rõ ràng |
| GitHub Copilot | UI/helper cho profile readiness và report | Giảm thời gian code lặp |
| Gemini Code Assist | Kiểm tra hướng lưu CV nhiều version | Giúp phát hiện rủi ro mất profile cũ |

### Bài học

- Dữ liệu do AI trích xuất phải có bước xác nhận của người dùng.
- Role-based access cần xuất hiện sớm vì staff/admin có workflow khác học sinh.
- Audit log là nền để làm metrics và compliance sau này.

### Kế hoạch tuần sau

- Triển khai fallback card, recovery actions, staff dashboard, audit và metrics.
- Tăng độ an toàn của pipeline.

---

## Tuần 5: 03/05/2026 - 09/05/2026

### Mục tiêu

Hoàn thiện recovery UX, human handoff, audit/metrics và kết nối các agent chính vào pipeline vận hành.

### Đã làm

- Sửa các lỗi nhỏ trong CV upload và API response.
- Triển khai fallback card và recovery actions cho ChatBox theo hướng TCR.
- Đồng bộ frontend service với response backend để giảm lỗi lệch field.
- Thiết kế staff handoff để tư vấn viên xem context học sinh và trả lời riêng.
- Thêm nhãn tiếng Việt cho trạng thái pending handoff.
- Cải thiện parse JSON fallback card.
- Bắt đầu triển khai audit, metrics và staff dashboard cho admin/editor.
- Tạo cấu trúc để AuditLog lưu route, fallback, ai_resolved, response time, judge result và handoff status.

### Khó khăn

Khó nhất là làm fallback không giống lỗi hệ thống. User cần thấy lý do, hành động tiếp theo và lựa chọn recovery rõ ràng. Staff cũng cần đủ context để xử lý handoff chứ không chỉ thấy một câu hỏi rời rạc.

### AI tools đã dùng

| Tool | Dùng để làm gì | Kết quả |
|---|---|---|
| OpenAI Codex | Fallback card, recovery actions, staff handoff, audit/metrics | Đẩy mạnh luồng recovery và vận hành |
| GitHub Copilot | CSS/table, labels, JSON parsing fixes | Sửa nhanh các lỗi UI nhỏ |

### Bài học

- Recovery UX cần được thiết kế như một luồng chính, không phải text báo lỗi.
- Metrics phải sinh ra từ audit log ngay trong pipeline thì mới đáng tin.
- Staff dashboard cần context học sinh, session và lý do fallback.

### Kế hoạch tuần sau

- Harden guardrails, hoàn thiện multi-agent flow, CV extraction/OCR và chuẩn bị deploy Railway.

---

## Tuần 6: 10/05/2026 - 16/05/2026

### Mục tiêu

Final push: hoàn thiện multi-agent system, CV/Profile, guardrails, admin/staff operations, deployment readiness và bộ tài liệu nộp.

### Đã làm

- Hoàn thiện multi-agent orchestration giữa Advisor, RAG, CRM/Profile và Judge.
- Harden guardrails: InputGuard trước route/RAG/LLM, homoglyph normalization, OutputGuard trước final response.
- Thêm security events cho guardrail/rate-limit.
- Tự động migrate các cột thiếu của `audit_logs`.
- Normalize `/api/chat` response trong frontend service.
- Bổ sung profile readiness, CV merge preview, contextual resources, handoff status, fallback card, recovery actions, source labels và system health.
- Triển khai CV extraction với text-based parsing, OCR fallback và fail-soft behavior.
- Hoàn thiện staff dashboard, admin metrics, prompt versioning, RAG ingestion và token usage visibility.
- Cập nhật Dockerfile/backend/frontend cho Railway readiness.
- Deploy production:
  - Frontend: `https://spirited-manifestation-production.up.railway.app/`
  - Backend: `https://a20-app-dung-production.up.railway.app/`
  - Database: Railway PostgreSQL qua `DATABASE_URL`.
- Thay README template bằng README sản phẩm thật.
- Tạo `Diagrams_showcase.md`, `Pitch_deck.md`, cập nhật `evaluation_evidence.md`, `WORKLOG.md`, `JOURNAL.md`.
- Cập nhật AI manual logs và mapping student của Giang/Zengggggg thành `fixnow2025@gmail.com`.

### Khó khăn

Tuần này khó nhất là integration. Nhiều feature đã tồn tại riêng lẻ, nhưng để demo tốt thì frontend, backend, database, RAG, guardrails, handoff và admin metrics phải nói cùng một contract. Ngoài ra, deployment cần tách frontend/backend/database trên Railway và không để lộ mật khẩu database trong tài liệu public.

### AI tools đã dùng

| Tool | Dùng để làm gì | Kết quả |
|---|---|---|
| OpenAI Codex | Multi-agent integration, guardrails, API contract, docs, README, diagrams, evidence | Hoàn thiện gói submission |
| Gemini Code Assist | CV/OCR planning, QA checklist, safety review | Hỗ trợ kiểm tra rủi ro |
| GitHub Copilot | UI text/CSS fixes và helper nhỏ | Tăng tốc polish frontend |

### Bài học

- Một sản phẩm AI tốt cần cả phần chạy được và phần giải thích được.
- README phải có link live, setup, architecture và evidence ngay từ đầu.
- Golden eval hiện cho thấy guardrail có lúc quá chặt; đây là tín hiệu tốt để cải thiện RAG/prompt sau submission.
- Không nên commit database password thật vào README; chỉ ghi dạng masked và dùng Railway env/local `.env`.

### Verification

- Frontend `npm run build` đã pass trong quá trình Railway readiness, còn warning chunk-size lớn của Vite.
- `AI-LOG_Manual/sessions.jsonl` validate JSONL 62 dòng hợp lệ.
- Mapping `Zengggggg -> fixnow2025@gmail.com` đã cập nhật và không còn entry `student: "Zengggggg"`.
- `eval_results_report.json` có 4 golden-eval cases, pass 0/4, average score 20.0. Đây là baseline cho cải thiện chất lượng sau này.
- README đã có live frontend/backend links và link tới diagrams, pitch deck, evidence, worklog, journal, AI logs.

### Kế hoạch tuần sau/ngày nộp

- Kiểm tra lại live frontend/backend trước khi nộp form.
- Mở quyền truy cập công khai cho các link ngoài repo nếu có video demo/slide.
- Đảm bảo repo có README, architecture, AI logs, journal, worklog, evaluation evidence và pitch deck đúng yêu cầu.

---

## Chủ nhật 17/05/2026 - Submission Day

### Mục tiêu

Nộp dự án với đầy đủ link và minh chứng: source code, README, live URL, architecture, AI logs, journal, worklog, evaluation evidence và pitch deck.

### Checklist trước khi nộp

- Repository/source code đã có frontend, backend, database integration, AI agents, API, config và deploy resources.
- README đặt ở root, có mô tả, mục tiêu, tính năng chính, công nghệ, cài đặt, chạy, sử dụng và link quan trọng.
- Live URL đã ghi trong README:
  - Frontend: `https://spirited-manifestation-production.up.railway.app/`
  - Backend: `https://a20-app-dung-production.up.railway.app/`
- Architecture đã có trong README và chi tiết hơn ở `Diagrams_showcase.md`.
- AI logs nằm ở `AI-LOG_Manual/sessions.jsonl`.
- Weekly journal là file này.
- Worklog nằm ở `WORKLOG.md`.
- Evaluation evidence nằm ở `evaluation_evidence.md`.
- Pitch deck nằm ở `Pitch_deck.md`.

### Ghi chú trung thực về chất lượng

Sản phẩm đã có luồng end-to-end và deployment, nhưng vẫn còn điểm cần cải thiện:

- Golden eval hiện tại cho thấy một số câu hỏi tuyển sinh bị từ chối quá mức vì guardrail còn chặt.
- Cần tiếp tục cải thiện RAG corpus, prompt và expected-answer coverage.
- Cần kiểm thử thêm với CV scan thật, nhiều profile thiếu dữ liệu và nhiều tình huống handoff đồng thời.

### Bài học cuối

Nhóm học được rằng xây một AI app không chỉ là gọi model. Một sản phẩm đáng tin cần có dữ liệu, nguồn, guardrails, recovery, human handoff, audit, metrics và tài liệu đủ rõ để người khác kiểm tra được.
