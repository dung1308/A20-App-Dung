# Nhật ký công việc

File này ghi lại các quyết định kỹ thuật, ghi chú lập kế hoạch và các mốc triển khai chính của ứng dụng VinUni Major Match từ ngày 05/04/2026 đến 15/05/2026.

## Định hướng dự án

Ở giai đoạn đầu, nhóm tập trung chọn các công cụ AI hỗ trợ lập trình và quyết định cách dùng chúng một cách có trách nhiệm. Nhóm đã so sánh GitHub Copilot, Gemini Code Assist và OpenAI Codex cho các việc như gợi ý code, lập kế hoạch, debug, viết tài liệu và triển khai các thay đổi lớn trong repo.

Sau khi chọn quy trình dùng AI, nhóm ưu tiên tạo kế hoạch rõ ràng, định nghĩa các kỹ năng cần có, viết đặc tả sản phẩm/triển khai, so sánh các hướng sản phẩm khả thi và chọn hướng cuối cùng: trợ lý chọn ngành cho sinh viên.

Lộ trình triển khai:

1. Chọn công cụ AI hỗ trợ code: Copilot cho gợi ý nhanh, Gemini cho so sánh/debug, Codex cho triển khai lớn có hiểu ngữ cảnh repo.
2. Tạo kế hoạch, kỹ năng và đặc tả triển khai.
3. So sánh các track sản phẩm và chọn track Chọn ngành làm hướng chính.
4. Tạo MVP tối thiểu.
5. Bổ sung tính năng theo kế hoạch.
6. Cải thiện độ tin cậy, khả năng khôi phục, tính minh bạch và luồng vận hành admin/staff.
7. Chuẩn bị triển khai và demo cuối kỳ.

---

## Dòng thời gian

### 05/04/2026 - Chọn công cụ AI hỗ trợ lập trình

**Mục tiêu:** Quyết định AI coding assistant sẽ hỗ trợ nhóm như thế nào.

**Các lựa chọn đã xem xét:**
- **GitHub Copilot:** Hữu ích cho autocomplete nhanh và các đoạn code nhỏ.
- **Gemini Code Assist:** Hữu ích để so sánh hướng triển khai, debug và tóm tắt log.
- **OpenAI Codex:** Hữu ích cho các thay đổi lớn cần hiểu codebase, lập kế hoạch triển khai, refactor, viết tài liệu và kiểm tra.

**Quyết định:** Dùng cả ba công cụ theo điểm mạnh riêng, trong đó Codex là trợ lý chính cho các thay đổi phức tạp.

**Kết quả:** Nhóm thống nhất quy trình AI hỗ trợ lập kế hoạch và triển khai, nhưng quyết định cuối cùng vẫn được kiểm tra theo mục tiêu sản phẩm và ràng buộc kỹ thuật.

---

### 06/04/2026 - Lập kế hoạch, kỹ năng và đặc tả

**Mục tiêu:** Biến ý tưởng ban đầu thành kế hoạch có thể triển khai.

**Đã làm:**
- Phác thảo định hướng sản phẩm đầu tiên.
- Liệt kê kỹ năng cần cho nhóm: UI responsive, thiết kế API backend, RAG, thiết kế prompt, guardrails, deployment và testing.
- Bắt đầu viết đặc tả triển khai để giảm mơ hồ trước khi code.
- Xác định cần có MVP rõ ràng trước khi thêm tính năng nâng cao.

**Quyết định:** Không bắt đầu bằng một sản phẩm quá lớn. Bắt đầu bằng luồng tối thiểu dùng được rồi mở rộng dần.

---

### 07/04/2026 - So sánh track sản phẩm

**Mục tiêu:** So sánh các hướng sản phẩm khả thi và chọn hướng mạnh nhất.

**Các track đã xem xét:**
- Chấm tài liệu.
- Theo dõi bằng camera.
- Trợ lý gợi ý/chọn ngành.

**Quyết định:** Chọn Major Choosing làm track chính vì giải quyết trực tiếp pain point của sinh viên và có thể kết hợp dữ liệu hồ sơ, CV, kiến thức tuyển sinh và tư vấn AI.

**Kết quả:** Sản phẩm tập trung vào việc giúp sinh viên chọn ngành VinUni phù hợp với phần giải thích minh bạch.

---

### 08/04/2026 - Phạm vi MVP

**Mục tiêu:** Xác định phiên bản nhỏ nhất nhưng hữu ích.

**MVP bao gồm:**
- Luồng nhập thông tin sở thích và hồ sơ học thuật của sinh viên.
- Kết quả gợi ý ngành.
- Giải thích AI cơ bản cho lý do ngành phù hợp.
- Trải nghiệm chat/advisor đơn giản.
- Cấu trúc API backend ban đầu.

**Tạm hoãn:**
- Parse CV đầy đủ.
- Dashboard admin.
- Handoff cho staff.
- Prompt versioning.
- Thống kê token.
- OCR fallback.

**Quyết định:** MVP phải chứng minh giá trị cốt lõi trước: giúp sinh viên hiểu ngành nào có thể phù hợp và vì sao.

---

### 09/04/2026 - Kế hoạch triển khai ban đầu

**Mục tiêu:** Chia MVP thành các task cụ thể.

| Task | Người phụ trách | Trạng thái |
|---|---|---|
| Xác định user flow cho Major Choosing | Cả nhóm | Xong |
| Tạo frontend app shell | Cả nhóm + AI assistants | Xong |
| Tạo backend API skeleton | Cả nhóm + AI assistants | Xong |
| Chuẩn bị data flow ban đầu | Cả nhóm | Xong |
| Ghi lại rủi ro và giả định | Cả nhóm | Xong |

**Ghi chú:** Nhóm thống nhất giữ contract frontend/backend đơn giản trước, sau đó normalize response khi cần.

---

### 10/04/2026 - Xây dựng MVP tối thiểu

**Mục tiêu:** Tạo phiên bản đầu tiên dùng được.

**Đã làm:**
- Triển khai luồng đầu tiên cho sinh viên.
- Thêm output gợi ý ngành cơ bản.
- Thêm tương tác chat/advisor đơn giản.
- Kết nối các trang frontend với service backend.

**Vấn đề phát hiện:** Một số tên field response giữa frontend và backend chưa nhất quán.

**Quyết định:** Tiếp tục hoàn thiện MVP, sau đó dọn lại API contract khi tính năng rõ hơn.

---

### 11/04/2026 - Định hướng Advisor và RAG

**Mục tiêu:** Quyết định advisor nên trả lời câu hỏi như thế nào.

**Các lựa chọn đã xem xét:**
- Trả lời hoàn toàn bằng LLM.
- Rule/FAQ tĩnh.
- RAG trên dữ liệu tuyển sinh và FAQ.
- Kết hợp RAG với ngữ cảnh hồ sơ sinh viên.

**Quyết định:** Dùng RAG và ngữ cảnh hồ sơ thay vì chỉ dựa vào LLM.

**Lý do:** Tư vấn chọn ngành cần bằng chứng, trích dẫn và phải khớp với dữ liệu sinh viên. Pure generation sẽ khó tin cậy hơn.

---

### 12/04/2026 - Chiến lược dữ liệu và hồ sơ

**Mục tiêu:** Quyết định ứng dụng nên dùng thông tin nào của sinh viên.

**Tín hiệu hồ sơ:**
- GPA và điểm mạnh học thuật.
- Năng lực tiếng Anh như IELTS.
- Sở thích.
- Mục tiêu nghề nghiệp.
- Kỹ năng.
- Học vấn và kinh nghiệm trích xuất từ CV.

**Quyết định:** Xây dựng dữ liệu hồ sơ dưới dạng field có cấu trúc để recommendation, chat và staff handoff có thể dùng chung một nguồn sự thật.

---

### 13/04/2026 - Kế hoạch mở rộng tính năng

**Mục tiêu:** Vượt qua MVP nhưng vẫn giữ sản phẩm tập trung.

**Nhóm tính năng dự kiến:**
- Trang Profile.
- Wizard flow.
- Trang Report/gợi ý ngành.
- AI Advisor chat.
- Upload và parse CV.
- Trang Resources.
- Staff dashboard.
- Admin dashboard.

**Quyết định:** Thêm tính năng dựa trên kế hoạch và pain point, không thêm chỉ vì kỹ thuật thú vị.

---

### 14/04/2026 - Nguyên tắc Trust, Control và Recovery

**Mục tiêu:** Định nghĩa cách sản phẩm AI hoạt động khi không chắc chắn.

**Nguyên tắc đã chọn:**
- **Trust:** Hiển thị bằng chứng và tránh khẳng định không có cơ sở.
- **Control:** Cho người dùng chỉnh sửa hoặc xác nhận dữ liệu AI trích xuất.
- **Recovery:** Có retry, edit, continue later hoặc human fallback.
- **Clarity:** Giải thích vì sao recommendation được đưa ra.
- **Safety:** Bảo vệ dữ liệu cá nhân và tránh hứa hẹn quá mức.

**Kết quả:** Các nguyên tắc này được đưa vào implementation guide và ảnh hưởng đến các tính năng sau.

---

### 15/04/2026 - Frontend app shell

**Mục tiêu:** Tạo cấu trúc UI lõi.

**Đã làm:**
- Xây dựng hướng app shell và navigation chính.
- Lên kế hoạch responsive layout cho student, staff và admin.
- Tổ chức page quanh workflow thực tế thay vì landing page marketing.

**Quyết định:** Màn hình đầu tiên nên là trải nghiệm app dùng được, không phải landing page.

---

### 16/04/2026 - Contract API backend

**Mục tiêu:** Xác định endpoint backend cần cho sản phẩm.

**Đã làm:**
- Lên kế hoạch endpoint cho chat, match, profile, CV upload, resources, staff handoff và admin tools.
- Xác định frontend nên dùng API service tập trung thay vì gọi fetch rải rác.

**Quyết định:** Normalize response backend ở biên service của frontend.

---

### 17/04/2026 - Luồng gợi ý ngành đầu tiên

**Mục tiêu:** Làm cho track Chọn ngành trở nên cụ thể.

**Đã làm:**
- Tạo luồng recommendation dựa trên input sinh viên.
- Thêm các field giải thích ban đầu.
- Bắt đầu thiết kế match score, matched signals, tradeoffs và evidence labels.

**Rủi ro:** Điểm số không có giải thích sẽ tạo cảm giác tùy tiện.

**Quyết định:** Luôn đi kèm kết quả recommendation với giải thích và ngữ cảnh.

---

### 18/04/2026 - Kế hoạch Chat và Context

**Mục tiêu:** Làm chat hữu ích sau khi có recommendation.

**Đã làm:**
- Lên kế hoạch để chat nhận context từ report.
- Quyết định chat cần biết profile và major context đã chọn/được gợi ý.
- Lên kế hoạch fallback UI khi AI không thể trả lời an toàn.

**Quyết định:** Chat không nên tách rời. Chat phải tiếp tục hành trình tư vấn của người dùng.

---

### 19/04/2026 - Định hướng parse CV

**Mục tiêu:** Quyết định CV upload hỗ trợ recommendation như thế nào.

**Các lựa chọn đã xem xét:**
- Chỉ lưu CV đã upload.
- Chỉ trích xuất plain text.
- Parse field có cấu trúc.
- Parse field có cấu trúc và cho người dùng review trước khi merge.

**Quyết định:** Parse CV thành dữ liệu có cấu trúc và bắt buộc review/edit trước khi merge vào profile.

**Lý do:** AI extraction có thể sai, nên người dùng cần kiểm soát trước khi dữ liệu trở thành thông tin chính thức trong profile.

---

### 20/04/2026 - Thiết kế tri thức RAG

**Mục tiêu:** Tổ chức nguồn tri thức.

**Đã làm:**
- Lên kế hoạch tách các vùng tri thức cho admissions, FAQ và thông tin CV/profile.
- Chọn ChromaDB cho vector search.
- Lên kế hoạch dùng OpenAI embeddings để nhất quán.

**Quyết định:** Tách kiến thức admissions/FAQ khỏi dữ liệu cá nhân của sinh viên.

---

### 21/04/2026 - Kế hoạch guardrails

**Mục tiêu:** Thêm lớp an toàn quanh hệ thống AI.

**Guardrails dự kiến:**
- Input guard trước routing/RAG/LLM.
- Output guard trước response cuối.
- Judge Agent để kiểm tra chất lượng câu trả lời.
- Rate limiting cho endpoint nhạy cảm.
- Audit logs cho sự kiện security và fallback.

**Quyết định:** Verdict của guardrail phải được enforce, không chỉ log.

---

### 22/04/2026 - Thiết kế Staff Handoff

**Mục tiêu:** Tạo cơ chế human recovery khi AI không đủ.

**Đã làm:**
- Thiết kế trạng thái fallback/handoff.
- Lên kế hoạch staff queue cho case cần hỗ trợ con người.
- Xác định yêu cầu handoff summary để staff hiểu nhanh context sinh viên.

**Quyết định:** Human fallback là một tính năng sản phẩm, không chỉ là trạng thái lỗi.

---

### 23/04/2026 - Định hướng vận hành admin

**Mục tiêu:** Xác định admin cần quản lý gì.

**Admin tools dự kiến:**
- RAG ingestion controls.
- Prompt versioning.
- Token usage và chi phí.
- Audit logs.
- System health badges.

**Quyết định:** Màn hình admin phải hỗ trợ vận hành thực tế, không chỉ debug cho developer.

---

### 24/04/2026 - Mở rộng Profile page

**Mục tiêu:** Làm profile hữu ích cho recommendation.

**Đã làm:**
- Lên kế hoạch các phần Profile: summary, career goals, skills, education và experience.
- Định nghĩa profile readiness để hướng dẫn người dùng cải thiện recommendation.

**Quyết định:** App nên cho biết thông tin nào còn thiếu thay vì âm thầm tạo recommendation yếu.

---

### 25/04/2026 - Định hướng Resources page

**Mục tiêu:** Giúp sinh viên tiếp tục sau khi nhận recommendation.

**Đã làm:**
- Lên kế hoạch contextual resources dựa trên profile/wizard/CV readiness.
- Thêm tư duy next-best-action vào product flow.

**Quyết định:** Resources nên có ngữ cảnh, không phải danh sách tĩnh.

---

### 26/04/2026 - Định hướng Report page

**Mục tiêu:** Cải thiện tính minh bạch của recommendation.

**Field report dự kiến:**
- Ngành được gợi ý.
- Match score hoặc confidence indicator.
- Match reason.
- Matched signals.
- Tradeoffs.
- Evidence/source labels.
- Action hỏi advisor về một ngành cụ thể.

**Quyết định:** Kết quả phải giải thích cả mức độ phù hợp và phần chưa chắc chắn.

---

### 27/04/2026 - Prompt và kiến trúc agent

**Mục tiêu:** Tổ chức hành vi AI theo từng trách nhiệm.

**Agent dự kiến:**
- Advisor Agent cho tư vấn tự nhiên.
- RAG service cho truy xuất tri thức.
- CRM/Profile logic cho dữ liệu cá nhân.
- Judge Agent cho kiểm tra chất lượng.
- Input/Output guards cho an toàn.

**Quyết định:** Tách prompt theo trách nhiệm thay vì dùng một prompt lớn cho tất cả.

---

### 28/04/2026 - Lập kế hoạch database và migration

**Mục tiêu:** Chuẩn bị cho thay đổi schema.

**Đã làm:**
- Lên kế hoạch helper migration tự động cho các bảng có khả năng thay đổi.
- Xác định audit logs, profile fields, CV documents, prompt versions và handoff jobs là các bảng dễ phát sinh thay đổi.

**Quyết định:** Logic migration phải giữ được dữ liệu production hiện có.

---

### 29/04/2026 - Authentication và roles

**Mục tiêu:** Định nghĩa phân quyền.

**Roles:**
- Student/guest.
- Staff/counselor.
- Admin.
- Editor.

**Quyết định:** Chức năng staff/admin phải được bảo vệ bằng RBAC.

---

### 30/04/2026 - Review MVP

**Mục tiêu:** Review giai đoạn triển khai đầu tiên.

**Kết luận:**
- Track Chọn ngành vẫn là hướng mạnh nhất.
- Recommendation và chat cơ bản đã cho thấy giá trị sản phẩm.
- Các cải tiến tiếp theo nên tập trung vào trust, chất lượng profile, CV support và vận hành staff/admin.

**Quyết định:** Tiếp tục mở rộng từ MVP thay vì đổi track.

---

### 01/05/2026 - Phiên bản tài liệu CV

**Mục tiêu:** Hỗ trợ nhiều lần upload CV một cách an toàn.

**Đã làm:**
- Lên kế hoạch lưu CV document version.
- Thêm khái niệm review, confirm và delete.
- Kết nối Wizard/recommendations với `cv_document_id` được chọn.

**Quyết định:** Dữ liệu trích xuất từ CV phải có version và có thể review.

---

### 02/05/2026 - Kế hoạch OCR fallback

**Mục tiêu:** Xử lý PDF scan hoặc PDF dạng ảnh.

**Đã làm:**
- Lên kế hoạch text extraction trước.
- Lên kế hoạch OCR fallback bằng Tesseract khi thiếu embedded text.
- Thêm fail-soft behavior để lỗi parsing không làm hỏng toàn bộ user flow.

**Quyết định:** CV parsing phải degrade gracefully.

---

### 03/05/2026 - Bằng chứng cho recommendation

**Mục tiêu:** Làm recommendation dễ tin hơn.

**Đã làm:**
- Lên kế hoạch citations/source labels.
- Thêm ý tưởng `match_breakdown`.
- Thêm `decision_trace` cho minh bạch nội bộ và debug staff/admin.

**Quyết định:** App cần tách reasoning AI-estimated khỏi bằng chứng có nguồn.

---

### 04/05/2026 - Luồng human fallback

**Mục tiêu:** Biến tình huống AI không chắc chắn thành trải nghiệm có thể khôi phục.

**Đã làm:**
- Lên kế hoạch fallback cards.
- Lên kế hoạch recovery actions.
- Lên kế hoạch handoff status và staff replies.

**Quyết định:** Khi AI không thể tự tin hỗ trợ, UI phải cho biết rõ điều gì sẽ xảy ra tiếp theo.

---

### 05/05/2026 - Token và Prompt Operations

**Mục tiêu:** Cho admin thấy hành vi của hệ thống AI.

**Đã làm:**
- Lên kế hoạch token usage metrics.
- Lên kế hoạch tạo/cập nhật/so sánh/chọn active prompt version.
- Lên kế hoạch system dashboard indicators.

**Quyết định:** Thay đổi prompt phải inspectable và reversible.

---

### 06/05/2026 - Đồng bộ frontend/backend

**Mục tiêu:** Giảm lỗi tích hợp.

**Đã làm:**
- Chuyển API call về frontend service tập trung.
- Lên kế hoạch normalize response cho chat và match.
- Xác định alias như `answer/response`, `major/top3`, `sources/references`.

**Quyết định:** Normalize một lần ở API boundary thay vì xử lý trong từng component.

---

### 07/05/2026 - Security và audit

**Mục tiêu:** Theo dõi hành động quan trọng và bảo vệ dữ liệu nhạy cảm.

**Đã làm:**
- Lên kế hoạch admin/staff audit middleware.
- Lên kế hoạch security event logging cho guardrail và rate-limit.
- Lên kế hoạch PII masking trong các luồng nhạy cảm.

**Quyết định:** Security events phải hiển thị được cho admin và hữu ích khi debug.

---

### 08/05/2026 - PMF Metrics

**Mục tiêu:** Đo xem sản phẩm có hữu ích hay không.

**Metrics dự kiến:**
- AI resolution rate.
- Human fallback rate.
- Latency.
- Daily activity.
- Admin vs guest usage.
- Churn-related indicators.

**Quyết định:** PMF metrics nên là một phần của admin reporting, không phải bổ sung sau.

---

### 09/05/2026 - Định hướng Staff Dashboard

**Mục tiêu:** Giúp counselor xử lý AI handoff.

**Đã làm:**
- Lên kế hoạch pending handoff queue.
- Lên kế hoạch accept/busy states.
- Lên kế hoạch session review và staff reply flow.

**Quyết định:** Staff cần đủ context để hỗ trợ mà không phải đọc raw logs.

---

### 10/05/2026 - Định hướng Admin Dashboard

**Mục tiêu:** Làm admin tools có thể dùng để vận hành.

**Đã làm:**
- Lên kế hoạch audit filters.
- Lên kế hoạch log detail modal.
- Lên kế hoạch prompt versioning controls.
- Lên kế hoạch RAG ingestion management.

**Quyết định:** Admin tools phải hiển thị trạng thái hệ thống rõ ràng và an toàn.

---

### 11/05/2026 - Audit, PMF, Staff và Admin

**Đã làm:**
- Triển khai `AdminAuditMiddleware` để ghi lại thao tác admin/staff.
- Thêm CLI hỗ trợ quản lý/reset tài khoản admin.
- Hoàn thiện metrics service và `/api/metrics`.
- Xây dựng staff dashboard cho fallback review và context sinh viên.
- Cải thiện admin audit tab với filter, search và detail modal.
- Fix crash API `NoneType` do dữ liệu SQL nullable.
- Thêm test cho PMF handoff, RBAC và rate limiting.

**AI tools đã dùng:**
- Gemini Code Assist cho refactor middleware, unit test và debug dashboard.

**Bài học chính:** Hiển thị vì sao AI thất bại cũng quan trọng như hiển thị khi AI thành công, vì staff cần context để hành động.

---

### 12/05/2026 - Resilience và độ tin cậy dữ liệu

**Đã làm:**
- Cải thiện schema migration cho audit logs và các bảng liên quan.
- Tăng độ bền backend khi gặp dữ liệu thiếu hoặc không đầy đủ.
- Tiếp tục đồng bộ state frontend với response backend.

**Vấn đề phát hiện:** React state có thể stale khi staff chọn session từ logs.

**Quyết định:** UI state nên refresh từ item/context được chọn thay vì giả định dữ liệu cũ còn đúng.

---

### 13/05/2026 - Harden guardrails và API contract

**Đã làm:**
- Dọn TODO/comment backend để phản ánh đúng tính năng đã implement.
- Enforce `InputGuard` trước route/RAG/LLM.
- Thêm normalize homoglyph để giảm bypass prompt injection.
- Áp dụng `OutputGuard.process()` trước response cuối.
- Chỉ lưu assistant message sau khi Judge chấp nhận hoặc đã fallback an toàn.
- Thêm `save_security_event()` cho guardrail và rate-limit events.
- Tự động migrate các cột thiếu trong `audit_logs`.
- Bỏ runtime `fetch("http://localhost:8000")` khỏi frontend.
- Normalize `/api/chat` response trong frontend services.
- Thêm xử lý 401/403, bảo vệ `/wizard`, và đồng bộ RAG ingest helpers với `VITE_API_URL`.
- Cập nhật tài liệu Railway deployment.

**AI tools đã dùng:**
- OpenAI Codex cho TCR review, guardrails, audit fixes, frontend API integration và documentation.

**Verification:**
- Frontend build pass.
- Backend tests chưa chạy đầy đủ trong local shell vì thiếu lệnh Python, nhưng logic backend đã được review và ghi lại.

---

### 14/05/2026 - Final push: Multi-Agent, CV, TCR và Operations

**Đã làm:**
- Hoàn thiện multi-agent orchestration giữa Advisor, RAG, CRM/Profile và Judge.
- Triển khai CV extraction với text-based parsing và OCR fallback.
- Thêm fail-soft parsing behavior.
- Thêm citations, source labels, `match_reason` và nhãn AI-estimated.
- Cho người dùng edit dữ liệu trích xuất từ CV trước khi lưu vào Profile.
- Thêm escalation tự động khi AI overcommit hoặc không thể trả lời an toàn.
- Hoàn thiện staff dashboard cho handoff.
- Hoàn thiện admin tools cho prompt versioning và ingestion.
- Thêm backend contract cho `fallback_card`, `recovery_actions`, `decision_trace`, source labels và `match_breakdown`.
- Thêm API profile readiness, CV merge preview, contextual resources, handoff status và admin system health.
- Cập nhật frontend Report, Chat, Profile, Resources và System pages dùng contract mới.
- Fix contrast cho secondary buttons.
- Tạo và cập nhật implementation guidance dựa trên pain point.

**Verification:**
- Các file backend đã chạm pass `py_compile` bằng virtual environment.
- Frontend `npm run build` pass với warning chunk-size lớn có sẵn của Vite.

---

### 15/05/2026 - Railway Docker readiness và cập nhật Worklog

**Đã làm:**
- Review `docker-compose.yml`, backend Dockerfile và frontend Dockerfile cho Railway deployment.
- Xác nhận Railway nên dùng split services: PostgreSQL, backend và frontend.
- Cập nhật backend Dockerfile để listen trên `${PORT:-8000}`.
- Cập nhật frontend Dockerfile để build Vite bundle và serve `dist/` trên `${PORT:-3000}`.
- Thêm `.dockerignore` cho backend và frontend.
- Cập nhật `Railway_QuickStart.md` với deployment readiness notes.
- Cập nhật `WORKLOG.md` để bao phủ từ 05/04 đến 15/05 và làm rõ đường đi từ chọn AI assistant đến MVP và mở rộng tính năng.

**Verification:**
- `git diff --check` pass trong phần deployment-readiness.
- Frontend `npm run build` pass với warning chunk-size lớn có sẵn của Vite.
- Chưa verify được backend Docker build đầy đủ vì Docker daemon local không chạy.

---

## Trạng thái sản phẩm tính đến 15/05/2026

Dự án đã đi từ chọn AI assistant và lập kế hoạch đến một ứng dụng Major Choosing đang hoạt động với:

- Student wizard và profile flow.
- Report gợi ý ngành.
- AI Advisor chat có context.
- Câu trả lời dựa trên RAG.
- CV upload, parsing, OCR fallback và review-before-merge.
- Human fallback và staff handoff.
- Admin audit, metrics, prompt versioning, token visibility và system health.
- Tài liệu Railway deployment và cải thiện Docker readiness.

## Rủi ro còn lại

- End-to-end QA vẫn cần test PDF scan thật, hành vi merge nhiều CV, timing của human fallback và biến môi trường Railway production.
- Token usage metrics có thể vẫn là ước tính nếu provider không trả usage chính xác trong mọi call.
- Chất lượng so sánh prompt phụ thuộc vào biến test thực tế.
- Vite build vẫn báo warning chunk-size lớn, cần tối ưu sau nếu ảnh hưởng performance.

---

## 16/05/2026 - Final Submission Package, Live URLs Và Evidence

**Mục tiêu:** Hoàn thiện bộ tài liệu nộp cuối theo yêu cầu AI20K Build Phase: README, architecture, AI logs, journal, worklog, evaluation evidence, pitch deck và live deployment links.

**Đã làm:**
- Cập nhật `README.md` từ template starter thành README sản phẩm thật, có mô tả dự án, mục tiêu, tính năng, kiến trúc, hướng dẫn cài đặt, hướng dẫn chạy, hướng dẫn dùng sản phẩm và các endpoint chính.
- Đặt link quan trọng ngay đầu README:
  - Frontend Railway: `https://spirited-manifestation-production.up.railway.app/`
  - Backend Railway: `https://a20-app-dung-production.up.railway.app/`
  - Backend health: `https://a20-app-dung-production.up.railway.app/health`
- Ghi chú database Railway PostgreSQL trong README theo dạng an toàn, không commit mật khẩu thật vào tài liệu công khai.
- Tạo `Diagrams_showcase.md` để showcase kiến trúc, luồng người dùng, Wizard, RAG, CV/Profile, handoff, safety, metrics, ERD và runtime mode.
- Cập nhật `AI-LOG_Manual/sessions.jsonl` để mapping student của Giang/Zengggggg thành `fixnow2025@gmail.com`.
- Cập nhật `AI-LOG_Manual/script.py` để lần regenerate sau vẫn giữ mapping đúng.
- Cập nhật `evaluation_evidence.md` với live deployment evidence, golden evaluation summary và các nhóm test chính.
- Tạo `Pitch_deck.md` theo format 5-10 trang: vấn đề, giải pháp, công nghệ, demo flow, kết quả, evidence và kế hoạch tiếp theo.
- Cập nhật `JOURNAL.md` để phản ánh tuần cuối, deployment, tài liệu nộp và bài học.

**Quyết định kỹ thuật/tài liệu:**
- README chỉ ghi database URL dạng masked vì URL đầy đủ chứa mật khẩu production.
- Tách architecture diagram sang `Diagrams_showcase.md` để README dễ đọc nhưng vẫn có sơ đồ chi tiết cho người chấm.
- Dùng `evaluation_evidence.md` làm nơi tập trung trả lời các câu hỏi: sản phẩm có đúng mục tiêu không, agent xử lý chính xác không, hệ thống có ổn định không, đã kiểm thử nhiều tình huống chưa.

**Trạng thái link:**
- Backend live URL đã có.
- Frontend live URL đã có.
- Database production đã cấu hình qua Railway PostgreSQL.
- Pitch deck, journal, worklog, README, diagrams, AI logs và evaluation evidence đã sẵn sàng trong repo.

**Rủi ro còn lại:**
- Cần kiểm tra quyền truy cập công khai của mọi link trước khi submit form.
- Cần đảm bảo biến môi trường production vẫn được cấu hình đúng trên Railway sau mỗi redeploy.
- Golden evaluation hiện cho thấy một số câu trả lời bị guardrail quá chặt; đây là evidence quan trọng cho hướng cải thiện prompt/RAG sau submission.

**Kết quả:** Repository đã chuyển từ trạng thái code-focused sang submission-ready: người chấm có thể mở README để thấy link, hiểu kiến trúc, chạy dự án, xem logs, xem journal/worklog và kiểm tra evidence.
