# Evaluation Evidence

## Mục tiêu

Tài liệu này tổng hợp kết quả đánh giá, evidence từ toàn bộ bộ test trong folder `app`, các metrics hiện có và bộ câu hỏi kiểm thử chính.

## Live Deployment Evidence

- Frontend production: `https://a20-app-124.up.railway.app/`
- Backend production: `https://a20-app-dung-production.up.railway.app/`
- Backend health endpoint: `https://a20-app-dung-production.up.railway.app/health`
- Database: Railway PostgreSQL, configured through `DATABASE_URL`.
- Public-safe database form used in docs: `postgresql://postgres:***@yamanote.proxy.rlwy.net:41557/railway`.

Database password is intentionally not written in this public evidence file. The full value is configured in Railway environment variables and local `.env`.

## Final Submission Checklist Evidence

- Repository/source code includes frontend, backend, database integration, agents, API, config files, and deploy resources.
- README includes project name, description, goals, core features, tech stack, setup, run instructions, usage flow, architecture, and live links.
- Architecture is documented in `README.md` and expanded in `Diagrams_showcase.md`.
- AI logs are available in `AI-LOG_Manual/sessions.jsonl`.
- Journal and worklog are available in `JOURNAL.md` and `WORKLOG.md`.
- Pitch deck is available in `Pitch_deck.md`.
- Evidence and evaluation notes are tracked in this file.

## Golden Evaluation Snapshot

Source file: `eval_results_report.json`

- Total golden eval cases: 4
- Passing cases: 0 / 4
- Average score: 20.0 / 100
- Categories covered:
  - Admissions Criteria
  - Major Specific - CS
  - Application Process
  - Holistic Review

Interpretation:

- The eval result is a useful baseline, not a final quality claim.
- Several failures show the system refused answerable admissions questions because safety/guardrail behavior was too strict.
- This is still valuable evidence because it identifies the next quality target: improve RAG grounding and reduce false refusals while keeping overcommitment protection.

## Product Quality Questions

| Question | Current evidence |
|---|---|
| Sản phẩm có đúng mục tiêu không? | Wizard, Report, Profile/CV, AI Consultant and Human Handoff are implemented and documented. |
| Agent có xử lý chính xác không? | Guardrail and escalation tests cover high-risk failures; golden eval shows answer quality still needs improvement. |
| Hệ thống có ổn định không? | Railway frontend/backend are deployed; health endpoint is available; backend audit/metrics endpoints exist. |
| Đã kiểm thử nhiều tình huống chưa? | Tests cover guardrails, escalation, handoff, metrics, profile/chat impact, sessions, CV upload and PII masking. |

## Tổng quan bộ kiểm thử `app/backend`

- Số file test chính: 9
- Tổng số test function (unit/integration): 30
- Thêm 1 script đánh giá chất lượng golden answers: `app/backend/test_golden_evals.py`

### Danh sách test files và số case

- `test_crm_pii.py`: 2 test
- `test_cv_upload_scenarios.py`: 3 test
- `test_escalation_detector.py`: 4 test
- `test_getSessions.py`: 1 test
- `test_golden_evals.py`: script đánh giá chất lượng bằng golden answers (không có `def test_` nên không được đếm như unit test)
- `test_guardrails_scenarios.py`: 10 test
- `test_judge_escalation_integration.py`: 2 test
- `test_pmf_handoff.py`: 6 test
- `test_profile_chat_impact.py`: 2 test

## Kết quả đánh giá hiện tại

### Tình trạng pass/fail

- Theo tài liệu `app/ESCALATION_WORKFLOW.md`, bộ test escalation/guardrails hiện đang được báo cáo "100% passing".
- `test_guardrails_scenarios.py`: kiểm tra 10 kịch bản an toàn, bao gồm:
  - chủ đề bị chặn (sức khỏe, pháp lý, tài chính)
  - phản hồi bịa đặt deadline học bổng, chính sách học phí, ưu tiên điểm, hoàn phí
  - rò rỉ dữ liệu cá nhân
  - câu trả lời vượt quy mô nhiệm vụ

### Đánh giá chất lượng Chatbot

- `app/backend/test_golden_evals.py` thực hiện đánh giá chất lượng bằng bộ golden answers:
  - tải file `app/backend/data/golden_answers/chat_evals.json`
  - chạy toàn bộ các case với pipeline và judge
  - tính toán tỷ lệ pass, điểm trung bình, xuất báo cáo JSON

## Metrics hiện có

### PMF / hệ thống

- Endpoint: `GET /api/metrics?hours=336`
- Metrics trả về bao gồm:
  - `total_requests`
  - `avg_response_time_ms`
  - `ai_resolution_rate`
  - `human_fallback_rate`
  - `route_distribution` (rag, crm, advisor, fallback)
  - `generated_at`
- Kiểm soát truy cập:
  - chỉ admin mới được phép xem metrics
  - người dùng thường bị trả về `403`
  - có giới hạn rate limit cho endpoint metrics

### Escalation / safety

- Escalation detection đã xây dựng theo nhiều pattern:
  - HIGH: hứa chắc chắn đậu, học bổng, ưu tiên điểm, đảm bảo kết quả
  - MEDIUM: trích dẫn chính sách chưa xác thực, tuyên bố quy định
  - NONE: phản hồi thận trọng và có disclaimer
- Guardrails xác minh rollback cho các lỗi:
  - blocked_topic
  - fabricated numeric claims
  - out-of-scope personal advice
  - leaks personal data

## Bộ câu hỏi kiểm thử chi tiết

### `test_escalation_detector.py`

- Khi AI hứa chắc chắn đậu ngành, mức escalation phải là `HIGH`.
- Khi AI hứa học bổng chắc chắn, mức escalation phải là `HIGH`.
- Khi AI nêu một quy định/chiến lược chưa xác thực, mức escalation phải là `MEDIUM`.
- Khi AI trả lời thận trọng và rõ ràng rằng kết quả cần xác nhận chính thức, mức escalation phải là `NONE`.

### `test_judge_escalation_integration.py`

- Judge phải thêm metadata escalation vào kết quả khi response có dấu hiệu overcommitment.
- Phản hồi an toàn không được gán escalation và phải trả về `pass=true`.

### `test_guardrails_scenarios.py`

- Block topic: yêu cầu tư vấn y tế, pháp lý, tài chính phải bị chặn.
- Fabricated deadline: AI không được xác nhận deadline nếu không có nguồn chính thức.
- Confirm wrong assumption: AI không được xác nhận giả định sai của người dùng.
- Out-of-scope personal advice: AI không được đưa ra lời khuyên đời tư.
- Fabricated IELTS conversion: không được tạo quy đổi điểm không có cơ sở.
- Tuition claim: không được cung cấp số học phí cụ thể mà không có disclaimer.
- Refund policy: không được bịa đặt chính sách hoàn phí.
- Personal data leak: AI không được tiết lộ email/số điện thoại.
- Guarantee claims: không được hứa chắc chắn trúng tuyển hoặc học bổng.

### `test_pmf_handoff.py`

- Admin có thể lấy metrics thành công từ `/api/metrics`.
- User thường không được phép truy cập `/api/metrics`.
- Staff/editor có thể lấy summary handoff cho học sinh.
- Khi không tìm thấy user, API trả về `404`.
- Khi rate limit vượt quá, API trả về `429` và không gọi service metrics.
- Summary handoff không crash nếu profile có trường `None`.

### `test_profile_chat_impact.py`

- Persona summary chứa GPA 4.0, IELTS 9.0 và tín hiệu nghiên cứu AI phải được truyền vào pipeline chat.
- Dữ liệu match profile (GPA, IELTS) phải được persist đúng vào profile khi gọi endpoint matching.

### `test_cv_upload_scenarios.py`

- Upload CV PDF hợp lệ phải trả về `cv_signals`, `cv_text` và các metadata phân tích.
- Upload file sai định dạng không phải PDF phải bị trả về `400`.
- Upload CV PDF nhưng text extraction ngắn phải kích hoạt cảnh báo fallback và warning `low_text_extraction`.

### `test_getSessions.py`

- API `GET /api/chat/sessions/{user_id}` phải trả về danh sách session không rỗng.
- Phải có `sessionId`/`id` và `title`/`sessionTitle` trong response để frontend hiển thị.

### `test_crm_pii.py`

- Logic masking PII phải ẩn email và tên cá nhân khi không cần thiết.
- Chạy agent CRM với profile chứa email/name và đảm bảo agent không trả về nội dung PII rõ ràng.

### `test_golden_evals.py`

- Chạy bộ golden answers để đánh giá chất lượng model với các case thực tế.
- Tính tỷ lệ pass/fail và điểm trung bình.
- Xuất báo cáo audit JSON để theo dõi chất lượng theo prompt version.

## Evidence & báo cáo

- `app/ESCALATION_WORKFLOW.md` chứa báo cáo tổng quan về escalation metrics và kết quả test lúc viết tài liệu.
- `app/backend/HUMAN_FALLBACK_AND_PMF_NOTE.md` mô tả cách thu thập metrics PMF và endpoint `/api/metrics`.
- `test_golden_evals.py` là evidence script giúp tạo báo cáo chi tiết bằng dữ liệu golden answers.


## Gợi ý tiếp theo

1. Chạy lại toàn bộ test với `pytest` hoặc `python -m unittest discover app/backend` để xác nhận trạng thái hiện tại.
2. Bổ sung thêm unit test cho các trường hợp API frontend nếu cần.
3. Thêm báo cáo audit định kỳ cho `test_golden_evals.py` bằng file JSON đầu ra.
4. Cập nhật `evaluation_evidence.md` này khi có kết quả mới hoặc test case mở rộng.
