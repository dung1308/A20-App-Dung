# Weekly Journal

Ghi lại hành trình xây dựng sản phẩm mỗi tuần — những gì đã làm, học được gì, AI giúp như thế nào.

> **Cập nhật mỗi cuối tuần** (trước khi tạo PR). Không cần dài, chỉ cần thật.

---

## Template

```markdown
## Tuần N — DD/MM/YYYY

### Đã làm
-

### Khó nhất tuần này
-

### AI tool đã dùng
| Tool | Dùng để làm gì | Kết quả |
|---|---|---|
| Claude Code | | |

### Học được
-

### Nếu làm lại, sẽ làm khác
-

### Kế hoạch tuần tới
-
```

---

## Ví dụ

### Tuần 1 — 31/03/2026

**Thành viên:** Nguyễn Văn A, Trần Thị B, Lê Văn C

#### Đã làm
- Setup project TypeScript + cấu hình `.env`
- Xây dựng agent loop cơ bản: nhận input → gọi Claude API → in output
- Thêm tool `search_web` đầu tiên (dùng Brave Search API)
- Viết README cho repo nhóm

#### Khó nhất tuần này
- Tool call response của Claude trả về sai format — mất 2 tiếng debug mới phát hiện ra thiếu `"type": "tool_result"` trong message history.
- Lần đầu dùng TypeScript nên type error khá nhiều, phải học cách dùng `as` và generic.

#### AI tool đã dùng
| Tool | Dùng để làm gì | Kết quả |
|---|---|---|
| Claude Code | Giải thích Anthropic tool use API, debug message format | Giải quyết được bug trong 15 phút |
| Cursor | Autocomplete TypeScript types | Tiết kiệm khoảng 30% thời gian gõ |

#### Học được
- Tool use trong Claude hoạt động theo vòng lặp: model gọi tool → app trả kết quả → model tiếp tục. Cần giữ đúng message history.
- `zod` rất hữu ích để validate tool input schema.
- Nên đặt timeout cho API call ngay từ đầu, không để sau mới thêm.

#### Nếu làm lại, sẽ làm khác
- Setup TypeScript strict mode ngay từ đầu thay vì thêm sau (refactor mệt hơn).
- Viết unit test cho `parseToolCall()` trước khi tích hợp vào agent loop.

#### Kế hoạch tuần tới
- Thêm tool `read_file` và `write_file`
- Implement memory: lưu conversation history vào file JSON
- Thử chạy agent giải 1 bài tập thực tế

---

### Tuần 2 — 07/04/2026

**Thành viên:** Nguyễn Văn A, Trần Thị B, Lê Văn C

#### Đã làm
- Thêm tool `read_file`, `write_file`, `list_dir`
- Agent có thể tự đọc file trong repo và đề xuất refactor
- Implement conversation memory: lưu 20 message gần nhất
- Thử nghiệm: cho agent tự fix 3 bug đơn giản → thành công 2/3

#### Khó nhất tuần này
- Memory bị lỗi khi conversation quá dài (vượt context window). Phải implement sliding window: chỉ giữ system prompt + 20 message gần nhất.
- Agent đôi khi loop vô hạn khi tool trả lỗi — chưa có stop condition tốt.

#### AI tool đã dùng
| Tool | Dùng để làm gì | Kết quả |
|---|---|---|
| Claude Code | Thiết kế sliding window memory, review code agent loop | Phát hiện thêm edge case khi tool throw exception |
| Gemini CLI | So sánh approach lưu memory: file JSON vs SQLite | Tư vấn dùng JSON cho prototype, SQLite khi cần query |

#### Học được
- Context window là resource có hạn — cần thiết kế memory strategy từ sớm.
- Stop condition quan trọng không kém gì agent logic: `max_iterations`, `no_new_tool_calls`, `explicit_done`.
- AI agent review code của mình rất có ích: Claude Code tìm ra 2 potential null pointer mà mình bỏ sót.

#### Nếu làm lại, sẽ làm khác
- Viết interface `Memory` trước, rồi implement sau — thay vì hard-code array từ đầu.
- Log tất cả tool call ra file ngay từ đầu để debug dễ hơn.

#### Kế hoạch tuần tới
- Fix vòng lặp vô hạn: thêm `max_iterations = 10`
- Thêm tool `run_tests` để agent tự kiểm tra code sau khi sửa
- Demo cho instructor cuối tuần

### Tuần 23 — 05/09/2026
Thành viên: Nhóm A20-124
#### Đã làm
- Hoàn tất chuyển đổi LLM provider từ Google Gemini sang OpenAI (gpt-4o-mini).
- Thay thế thư viện PyPDF2 đã lỗi thời bằng pdfplumber với chế độ layout=True, giúp trích xuất thông tin từ CV đa cột chính xác hơn đáng kể.
- Cấu hình lại RAGService với 3 collection ChromaDB chuyên biệt: admissions, faq, và cvs.
- Tối ưu hóa quy trình tìm kiếm với Query Expansion và LTR (Learning-to-Rank) reranker.
- Loại bỏ triệt để các dependency không cần thiết và giải quyết lỗi nạp model mặc định của ChromaDB trên Railway.

#### Khó nhất tuần này
- Debug lỗi log 307 Temporary Redirect khi deploy lên Railway. Nguyên nhân do ChromaDB tự động cố gắng tải model từ HuggingFace dù đã cấu hình dùng OpenAI embeddings. Đã xử lý bằng cách set embedding_function=None khi khởi tạo collection.
- Đảm bảo tính nhất quán của EMBEDDING_MODEL (text-embedding-3-small) trên toàn bộ hệ thống để tránh sai lệch vector.

#### AI tool đã dùng
| Tool | Dùng để làm gì | Kết quả |
|---|---|---|
| Gemini Code Assist | Phân tích log Railway, refactor logic RAG và tư vấn chuyển đổi thư viện PDF | Giải quyết lỗi startup và tối ưu hóa hiệu suất trích xuất dữ liệu |
| OpenAI API | Cung cấp Embeddings và Generation | Phản hồi nhanh, giá rẻ và độ chính xác cao hơn model cũ |

#### Học được
- Khi sử dụng ChromaDB với manual embeddings, việc khai báo explicit embedding_function=None là bắt buộc để tránh server tự download model nặng hàng trăm MB.
- Layout-aware parsing (pdfplumber) là chìa khóa để trích xuất dữ liệu từ các mẫu hồ sơ hiện đại.

#### Nếu làm lại, sẽ làm khác
- Sẽ đóng gói các hằng số cấu hình model (embedding vs chat) vào một file constants.py ngay từ đầu để tránh việc hard-code trong các service.

#### Kế hoạch tuần tới
- Triển khai UI theo pattern "Chat + Context Panel" để hiển thị Match Score và bằng chứng đi kèm.
 - Hoàn thiện hệ thống Guardrails để bảo vệ dữ liệu PII của sinh viên.

### Cập nhật ngày 06/09/2026
#### Đã làm
- Triển khai trọn bộ Backend Session API: hỗ trợ lưu, đổi tên, xóa và tải xuống lịch sử hội thoại dưới dạng file .txt.
- Xây dựng logic `migrate_db()` trong `DBService` giúp tự động cập nhật schema (thêm cột `title`) khi khởi chạy server.
- Tối ưu hóa các Agent: Tách biệt `ADVISOR_CHAT_SYSTEM_PROMPT` cho hội thoại tự nhiên, cải tiến khả năng parse JSON bền bỉ cho Advisor và Judge Agent.
- Bảo mật dữ liệu: Thực hiện PII Masking (ẩn Email, SĐT) trong `CRMAgent` và viết unit test xác thực tại `test_crm_pii.py`.
- Cải tiến UI/UX: Thêm "Trust Badge" bảo mật tại trang Profile, cập nhật giao diện `MajorCard` và xử lý lỗi crash Google Login khi thiếu cấu hình Client ID.
- Fix lỗi SyntaxError: Xử lý triệt để các lỗi docstring chưa đóng trong các file agent.

#### Khó nhất tuần này
- Đảm bảo tính nhất quán của dữ liệu khi thực hiện migration schema tự động trên SQLite và PostgreSQL mà không làm gián đoạn dịch vụ.

#### AI tool đã dùng
| Tool | Dùng để làm gì | Kết quả |
|---|---|---|
| Gemini Code Assist | Hỗ trợ refactor Agent prompts, viết code migration và unit test PII | Hệ thống hoạt động ổn định, bảo mật và chuyên nghiệp hơn |

#### Học được
- Việc tách biệt rõ ràng giữa prompt trả về dữ liệu (JSON) và prompt trò chuyện (Text) giúp hệ thống AI hoạt động tin cậy hơn, tránh được các lỗi hiển thị không mong muốn cho người dùng cuối.

### Cập nhật ngày 11/05/2026
#### Đã làm
- **Hệ thống Audit & Security**: Triển khai `AdminAuditMiddleware` để tự động ghi lại mọi thao tác của Admin và Staff. Phát triển công cụ CLI `reset_admin.py` để quản lý tài khoản và quyền hạn trực tiếp từ Console (Railway/Terminal).
- **PMF Metrics**: Hoàn thiện `MetricService` và API `/api/metrics` để tính toán tỷ lệ AI Resolution, Human Fallback, độ trễ hệ thống và biểu đồ hoạt động hàng ngày (Admin vs Guest).
- **Staff Dashboard**: Xây dựng giao diện cho nhân viên tư vấn với khả năng xem danh sách Fallback, tra cứu bối cảnh học sinh (Handoff Summary) và chỉnh sửa trực tiếp hồ sơ học thuật (GPA, IELTS, Ngành quan tâm).
- **Admin Dashboard**: Nâng cấp Tab Audit với bộ lọc lỗi/fallback, tìm kiếm theo email và Modal xem chi tiết log (hiển thị JSON Judge Result đẹp mắt).
- **Độ tin cậy (Resilience)**: Fix các lỗi `NoneType` crash API khi gặp dữ liệu SQL Null và tự động hóa quy trình Migration Schema cho bảng `audit_logs`.
- **Unit Testing**: Viết bộ test `test_pmf_handoff.py` kiểm tra phân quyền (RBAC) và logic Rate Limiting cho các endpoint nhạy cảm.

#### Khó nhất tuần này
- Đồng bộ hóa Schema Database: Việc cập nhật bảng `audit_logs` hiện có trên môi trường Production mà không làm mất dữ liệu cũ yêu cầu logic `migrate_db` phải cực kỳ cẩn thận với lệnh `ALTER TABLE`.
- Xử lý bất đồng bộ state trong React: Đảm bảo dữ liệu tóm tắt học sinh hiển thị chính xác ngay lập tức khi Staff click vào danh sách Nhật ký (tránh lỗi Stale State).

#### AI tool đã dùng
| Tool | Dùng để làm gì | Kết quả |
|---|---|---|
| Gemini Code Assist | Refactor Middleware, viết Unit Test cho PMF và gỡ lỗi logic UI Dashboards | Rút ngắn thời gian phát triển các tính năng quản trị phức tạp và đảm bảo code sạch. |

#### Học được
- Middleware là công cụ mạnh mẽ để tách biệt logic nghiệp vụ và logic hệ thống (như ghi log hành vi).
- Trong môi trường thực tế, dữ liệu người dùng thường không đầy đủ; luôn cần sử dụng pattern `(data or {})` để bảo vệ ứng dụng khỏi các lỗi crash không đáng có.
- Việc hiển thị "Tại sao AI thất bại" (Judge Result) quan trọng hơn việc AI trả lời đúng, vì nó giúp đội ngũ nhân viên biết chính xác chỗ nào cần can thiệp.

### Cập nhật ngày 13/05/2026
#### Đã làm
- **Backend TODO cleanup**: Cập nhật các TODO/comment trong backend để phản ánh đúng các feature đã implement, đặc biệt ở `AdvisorAgent`, `JudgeAgent`, `InputGuard`, `OutputGuard`, `RateLimiter` và `Pipeline`.
- **Guardrails & TCR backend hardening**: Bắt buộc thực thi kết quả `InputGuard` trước khi route/RAG/LLM, thêm normalize homoglyph để giảm bypass prompt injection, dùng `OutputGuard.process()` cho response cuối cùng, và chỉ lưu assistant message sau khi Judge chấp nhận hoặc đã chuyển sang fallback an toàn.
- **Security & audit reliability**: Thêm `save_security_event()` để ghi nhận guardrail/rate-limit event; tự động migrate các cột còn thiếu của `audit_logs` khi khởi tạo DB để tránh lỗi production kiểu `column input_text does not exist`.
- **Frontend/backend alignment**: Hoàn thành các mục P0 trong `app/frontend/BACKEND_TODO.md`: bỏ các runtime `fetch("http://localhost:8000")`, đưa call backend về `services/api.js`, normalize response `/api/chat`, thêm xử lý 401/403, bảo vệ route `/wizard`, và chuyển RAG ingest streaming sang helper dùng `VITE_API_URL`.
- **Staff/Admin transparency**: Hiển thị metadata `intent`, `status` và fallback reason cho staff/admin trong chat để debug các case rate limit, judge reject, guardrail block, backend fallback hoặc lỗi network/model.
- **Railway deployment docs**: Cập nhật `Railway_QuickStart.md` với danh sách biến môi trường cần gửi lên Railway cho backend/frontend: `DATABASE_URL`, `OPENAI_API_KEY`, `SECRET_KEY`, `GOOGLE_CLIENT_ID`, `CORS_ORIGINS`, `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`, rate limit, budget và webhook.
- **Documentation tracking**: Cập nhật `frontend_dataFlow.md` và `BACKEND_TODO.md` để phân biệt phần đã hoàn thành và phần còn lại.

#### Khó nhất tuần này
- Đồng bộ contract frontend-backend vì backend trả nhiều alias khác nhau (`answer/response`, `major/top3`, `sources/references`). Giải pháp là normalize một lần ở API boundary thay vì xử lý lặp trong từng component.
- Build/test bị ảnh hưởng bởi môi trường local Windows: `python` không khả dụng trong shell, còn `npm run build` ban đầu bị lỗi quyền `EPERM` với `C:\Users\Admin`. Sau khi chạy build ngoài sandbox, Vite build đã pass.

#### AI tool đã dùng
| Tool | Dùng để làm gì | Kết quả |
|---|---|---|
| OpenAI Codex | Review backend theo TCR, sửa guardrails/audit, refactor frontend API integration, cập nhật docs deploy/journal | Hoàn thành các thay đổi chính, build frontend pass; backend test chưa chạy được do thiếu Python trong shell |

#### Học được
- Guardrail chỉ có ý nghĩa khi verdict được enforce. Việc gọi `InputGuard.check()` mà không xử lý return value tạo cảm giác an toàn giả.
- Nên normalize API response ở service layer để UI không bị phụ thuộc vào các biến thể contract của backend.
- Với Railway/frontend browser, biến `VITE_API_URL` phải dùng public backend URL; `.railway.internal` chỉ phù hợp cho service-to-service trong Railway, không dùng được từ trình duyệt.

#### Nếu làm lại, sẽ làm khác
- Thiết kế API contract chuẩn cho `/api/chat` ngay từ đầu và tạo fixture test cho frontend để tránh phải hỗ trợ nhiều alias.
- Thêm migration nhỏ, rõ ràng cho từng thay đổi DB thay vì phân tán giữa `database.py` và `DBService.migrate_db()`.

#### Kế hoạch tiếp theo
- Thêm validation phía frontend cho wizard answers, profile fields, chat length và CV upload để mirror backend rules.
- Thêm contract tests cho `/api/match`, `/api/chat`, `/api/upload-cv`, metrics, audit logs và RAG admin controls.
- Kiểm tra lại `/api/profile/{user_id}/cv` vì frontend service đang reference endpoint này nhưng backend route scan hiện chưa thấy route tương ứng.

### Cập nhật ngày 14/05/2026
#### Đã làm
- **Hoàn thiện Multi-Agent Orchestration**: Đồng bộ hóa logic giữa Advisor (định hướng), RAG (tra cứu thông tin), và CRM (dữ liệu cá nhân) dưới sự giám sát của Judge Agent để đảm bảo tính chính xác và an toàn.
- **CV Extraction & OCR Fallback**: Triển khai quy trình trích xuất CV hai giai đoạn (text-based -> OCR fallback với Tesseract). Tích hợp logic "fail-soft" để vẫn trả về dữ liệu cấu trúc khi LLM gặp sự cố.
- **TCR Alignment (Final Push)**: 
    - **Transparency**: Hiển thị minh bạch nguồn trích dẫn (citations) và lý do match ngành (match_reason) kèm label "AI-estimated".
    - **Control**: Cho phép người dùng chỉnh sửa trực tiếp thông tin trích xuất từ CV trước khi lưu vào Profile.
    - **Recovery**: Triển khai Escalation Workflow tự động chuyển sang tư vấn viên khi AI phát hiện dấu hiệu hứa hẹn quá mức (overcommitment).
- **Hệ thống Quản trị**: Hoàn tất Dashboard dành cho Staff (xử lý Handoff) và Admin (quản lý Prompt Versioning và Ingestion).

#### Khó nhất tuần này
- Xử lý xung đột dữ liệu khi merge thông tin từ nhiều bản CV khác nhau vào Profile người dùng mà không làm mất dữ liệu cũ có giá trị.
- Cấu hình OCR trên môi trường Cloud (Railway) yêu cầu cài đặt thêm các package hệ thống (libtesseract) thông qua Dockerfile.

#### AI tool đã dùng
| Tool | Dùng để làm gì | Kết quả |
|---|---|---|
| Gemini Code Assist | Refactor logic trích xuất CV, viết Escalation Detector và tối ưu hóa Dockerfile cho OCR | Hệ thống xử lý được các file PDF dạng ảnh và bảo vệ người dùng khỏi thông tin sai lệch. |

#### Học được
- Dữ liệu từ AI (trích xuất CV) luôn cần có con người (người dùng) xác nhận lại trước khi chính thức đưa vào cơ sở dữ liệu.
- Việc thiết kế "Hinge Rule" (quản lý tập trung LLM config) giúp tiết kiệm cực kỳ nhiều thời gian khi cần thử nghiệm các model khác nhau (gpt-4o vs gemini-1.5).

#### Kế hoạch tiếp theo
- Chuẩn bị cho buổi Demo cuối kỳ với kịch bản: Student Wizard -> Profile Update via CV -> AI Advisor Chat -> Counselor Handoff.
- Kiểm tra tải (load test) cho hệ thống RAG khi số lượng tài liệu tăng lên.

---

### Cap nhat bo sung ngay 14/05/2026 - Codex

#### Da hoan thanh
- Tong hop lai `14_05_Summary.md` thanh ban ghi ro rang ve cac tinh nang da lam trong ngay.
- Tao `app/guide/Guideline_v3.md` tu `Guideline_v2.md`, bo sung cach lam viec dua tren pain point.
- Bo sung vao guideline cac nguyen tac Trust, Recovery, Clarity, Speed, Safety.
- Chuyen noi dung tu `app/Pain_Point.md` va `app/Pain_Point_skills.md` thanh ban do uu tien tinh nang co the trien khai.
- Ghi ro yeu cau cho CV document versions, OCR fallback, structured CV parsing, editable profile merge, Wizard `cv_document_id`, RAG/profile context usage, human fallback, prompt versioning, token dashboard, resources, va admin tools.

#### Gia tri san pham
- Guideline moi giup LLM/coding agent khong chi viet code dung ky thuat ma con biet tinh nang dang giai quyet dau dau nao cua nguoi dung.
- Cac tinh nang AI phai co duong lui ro rang: retry, edit, confirm, continue later, hoac human fallback.
- Admin/staff tooling duoc dinh huong thanh man hinh van hanh de dung, khong chi la developer utility.

#### Verification
- Thay doi lan nay la tai lieu, khong can build backend/frontend.
- Cac file duoc cap nhat: `14_05_Summary.md`, `JOURNAL.md`, `app/guide/Guideline_v3.md`.

---

### Cap nhat bo sung ngay 14/05/2026 - Backend/Frontend API functions

#### Da hoan thanh
- Backend them contract moi cho pain-point UX: `fallback_card`, `recovery_actions`, `decision_trace`, source labels, va `match_breakdown` cho ket qua goi y nganh.
- Backend them API moi:
  - `GET /api/profile/me/readiness`
  - `GET /api/profile/me/cv-documents/{document_id}/merge-preview`
  - `GET /api/resources/contextual`
  - `GET /api/handoff-status`
  - `GET /api/admin/system/health`
- Frontend cap nhat `services/api.js` de normalize va dung cac field/API moi.
- Report page hien thi ly do fallback, recovery actions, matched signals, tradeoffs, evidence labels, va nut "Ask about this major".
- Chat UI gui context tu Report sang backend, hien fallback card, recovery buttons, suggested resources, source labels, va handoff status banner.
- Profile page hien Profile readiness va CV merge preview truoc khi confirm CV version.
- Resources page hien contextual resources va next-best actions dua tren readiness.
- System/database page hien operational health badges cho database, token usage, prompt versions, handoffs, va RAG ingest.
- Frontend contrast fix: cac secondary button nen trang duoc gan mau chu/icon ro rang de khong bi mat tren nen trang.

#### Verification
- Backend touched files da pass `py_compile` bang `.venv`.
- Frontend da pass `npm run build`; van con warning chunk size lon cua Vite.

---

### Cap nhat bo sung ngay 15/05/2026 - Railway Docker readiness

#### Da hoan thanh
- Kiem tra `docker-compose.yml`, `app/backend/Dockerfile`, va `app/frontend/Dockerfile` theo mo hinh deploy Railway.
- Xac nhan `docker-compose.yml` phu hop cho local dev/test, nhung Railway nen tach thanh 3 service rieng: PostgreSQL, backend, frontend.
- Cap nhat backend Dockerfile de Uvicorn lang nghe `${PORT:-8000}`, phu hop voi dynamic port cua Railway.
- Cap nhat frontend Dockerfile de build Vite production bundle va serve thu muc `dist/` tren `${PORT:-3000}` thay vi chay Vite dev server.
- Them `.dockerignore` cho backend/frontend de tranh dua logs, uploads, cache, `node_modules`, va build output vao image context.
- Cap nhat `Railway_QuickStart.md` voi phan Deployment Readiness Check, canh bao `DATABASE_URL @db` chi dung local Compose, va ghi chu `VITE_*` duoc embed luc build.

#### Ket luan deploy
- Backend co the deploy len Railway bang Dockerfile trong `app/backend`, voi Railway Postgres `DATABASE_URL` va cac bien production can thiet.
- Frontend co the deploy len Railway bang Dockerfile trong `app/frontend`, nhung can redeploy sau khi thay doi `VITE_API_URL` hoac `VITE_GOOGLE_CLIENT_ID`.
- Khong nen deploy ca repo nhu mot Docker Compose stack tren Railway; dung split services de phu hop voi Railway.

#### Verification
- `git diff --check` pass.
- `npm run build` trong `app/frontend` pass; van con warning chunk size lon cua Vite.
- Da thu `docker build` backend nhung khong verify duoc vi Docker daemon tren may local khong chay.
- Cac file duoc cap nhat: `app/backend/Dockerfile`, `app/backend/.dockerignore`, `app/frontend/Dockerfile`, `app/frontend/.dockerignore`, `Railway_QuickStart.md`, `JOURNAL.md`.
