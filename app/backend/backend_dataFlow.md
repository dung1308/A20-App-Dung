# VinUni Backend Data Flow Summary

This document outlines the data lifecycle for requests processed by the VinUni Admission Assistant backend.

## 1. Request Entry & Guardrails (Shared Layer)
Every incoming request to `/api/match` or `/api/chat` passes through:
1.  **InputGuard**: Performs Unicode normalization and enforces length constraints (1-5000 chars). It scans for SQL injection, XSS, and prompt injection patterns.
2.  **RateLimiter**: Implements a sliding-window check in-memory to prevent abuse (default: 10 requests per 60 seconds per user).

---

## 2. Wizard Flow (`/api/match`)
**Objective**: Provide the Top 3 university major recommendations based on user input and CV.

1.  **CV Analysis**: If a CV is provided, `CVParser` extracts structured text, and `CVAgent` generates `CVSignals` (confidence scores and suggested majors).
2.  **Recommendation Engine**: `AdvisorAgent` processes the 4-step wizard answers combined with `CVSignals`.
    - **Real Mode**: Uses Gemini with a weighted scoring system (0.6 Wizard / 0.4 CV).
    - **Mock Mode**: Returns a deterministic result after a 1-second simulated delay.
3.  **Safety Validation**: `JudgeAgent` evaluates the recommendation JSON for safety and accuracy.
4.  **Enrichment**: The pipeline attaches a static `DISCLAIMER` before returning the results to the frontend.

---

## 3. Chat Flow (`/api/chat`)
**Objective**: Handle free-form follow-up questions about the university.

1.  **Intent Routing**:
    - **Real Mode**: `LLMRouter` classifies the message into `rag`, `crm`, `advisor`, or `fallback`.
    - **Mock Mode**: `_mock_route` uses keyword matching (e.g., "GPA" -> `crm`, "ngành" -> `advisor`).
2.  **Agent Dispatch**:
    - **RAG Agent**: Fetches context from `DEMO_CORPUS` via `RAGService` (Keyword overlap in Mock; Vector search in Production) and generates a grounded response.
    - **Advisor Agent**: Provides personalized chat-based guidance using conversation history.
    - **CRM Agent**: Interacts with `DBService` to fetch or update student profile data.
3.  **Handoff**: If the route is `fallback` or the response is rejected by safety filters, the audit log is marked with `handoff_status="pending"` so `/staff` can show it as a human fallback job. Staff can accept the job, inspect the student's latest session, and send a human advisor reply into that same chat session.

---

## 4. Output & Persistence Layer
Before the response is sent back to the user:
1.  **OutputGuard**: Redacts sensitive PII (emails and phone numbers) and sanitizes HTML content.
2.  **JudgeAgent**: Performs a final safety audit. If the judge rejects the response, a "Safety Fallback" message is returned instead.
3.  **Persistence (`DBService`)**:
    - **Chat History**: Messages are saved to the `ChatMessage` table (PostgreSQL) or a runtime dictionary (Mock).
    - **Audit Log**: The orchestrator records input, output, judge result, route, and **PMF metrics** (response time, resolution status, fallback trigger) for compliance and performance analysis.

---

## Key Toggles
- **USE_MOCK**: When `True`, LLM calls are replaced by `MockGenerativeModel` in `config.py`, and `DBService` uses in-memory storage. 
- **Deterministic Checks**: Mock mode utilizes rule-based keyword matching for routing and judging to ensure fast, predictable local development.
