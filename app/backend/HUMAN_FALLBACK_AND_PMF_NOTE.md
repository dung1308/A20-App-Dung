# Human Fallback & PMF Metrics Implementation

This document summarizes the backend changes made to support human fallback handoff and PMF-driven metric logging.

> Note: The current backend implementation lives under `app/backend/` in this workspace.

## 1. Human Fallback Summary

### What was added
- When the chatbot cannot answer and falls back to a human advisor, the system now creates a concise handoff summary.
- The summary includes:
  - student profile details (name, email, phone, GPA, IELTS, interests)
  - the most recent conversation turns between the user and the assistant
- This summary is generated in `app/backend/orchestrator/pipeline.py` in `Pipeline.build_human_handoff_summary()`.

### Where it is used
- `Pipeline.run_chat()` builds the summary when:
  - the routing result is `fallback`
  - the `JudgeAgent` rejects the chatbot response
- The summary is returned in the chat API response under the field `handoff_summary`.

### Automatic notification
- The system automatically sends the summary to the configured `HUMAN_WEBHOOK` endpoint.
- This is implemented in `Pipeline._notify_human_webhook()`.
- The webhook payload includes:
  - `user_id`
  - `route`
  - `judge_result`
  - `handoff_summary`
  - `timestamp`
- A retry mechanism is included with up to 2 attempts and detailed logging for webhook responses.

### API support
- Added endpoint: `GET /api/handoff-summary?user_id=...`
- This endpoint returns the human-readable summary for a given user.

## 2. PMF Scorecard Metric Logging

### What was added
- Audit logging now records PMF-relevant metrics for every chat interaction.
- New fields were added to `AuditLog` in `app/backend/models/schemas.py`:
  - `route`
  - `response_time_ms`
  - `ai_resolved`
  - `fallback`
- The audit log service was updated in `app/backend/services/db_service.py`.

### Response timing and resolution
- `Pipeline.run_chat()` measures the chat response latency and computes:
  - whether AI resolved the question without fallback
  - whether the response was escalated or rejected
- These values are passed into `DBService.save_audit_log()`.

### Metrics service
- Added `app/backend/services/metric_service.py` to compute PMF metrics from audit logs.
- Provided metrics include:
  - `average_response_time_ms`
  - `ai_resolution_rate`
  - `ai_no_followup_rate`

### API support
- Added endpoint: `GET /api/metrics?hours=336`
- This returns the PMF-focused metrics over the requested time window.

## 3. Documentation

### Updated Quick Start
- `app/backend/Backend_QuickStart.md` now mentions the new `/api/metrics` endpoint.
- It also includes `HUMAN_WEBHOOK` configuration in the `.env` example.
- Added Docker deployment guidance so `docker-compose.yml` can provide `HUMAN_WEBHOOK` when running in containers.

## 4. Why this matches the PMF scorecard

This implementation directly supports the scorecard by enabling measurement of:
- improved response time toward the goal `< 1 minute`
- AI resolution rate for questions that do not require human follow-up
- follow-up behavior through chat history and audit records

It also ensures that when the chatbot fails, a human advisor receives enough context to resume the conversation quickly.
