# VinUni Admission Assistant

AI-powered admission and major-matching assistant for VinUni applicants. The app helps students understand which majors fit their interests, profile, CV, and goals, then supports follow-up questions with RAG-based answers, safety guardrails, and human counselor handoff.

## Important Links

- Live frontend: https://a20-app-124.up.railway.app/
- Live backend: https://a20-app-dung-production.up.railway.app/
- Backend health check: https://a20-app-dung-production.up.railway.app/health
- Architecture: [architecture.md](./architecture.md)
- Pitch deck: [Pitch_deck.md](./Pitch_deck.md)
- Weekly journal: [JOURNAL.md](./JOURNAL.md)
- Worklog: [WORKLOG.md](./WORKLOG.md)
- Evaluation evidence: [evaluation_evidence.md](./evaluation_evidence.md)
- AI logs: [AI-LOG_Manual/sessions.jsonl](./AI-LOG_Manual/sessions.jsonl)
- Database: Railway PostgreSQL, configured through `DATABASE_URL`
  - Public-safe form: `postgresql://postgres:***@yamanote.proxy.rlwy.net:41557/railway`
  - The full credential is kept in Railway environment variables and local `.env`, not committed in README.

## Project Goal

High school students often face too many admission and major choices, while generic AI chat can answer too confidently without sources. This project is a decision-support tool, not a replacement for official counselors.

The product combines:

- A 4-step Wizard for interests, strengths, dislikes, and work style.
- CV/profile extraction to personalize recommendations.
- Top 3 VinUni major recommendations with match score and evidence.
- AI Consultant chat with RAG sources for admissions and FAQ questions.
- Guardrails, JudgeAgent, and escalation detection for safer answers.
- Human counselor handoff when the AI should not answer alone.
- Admin/staff dashboards for metrics, audit logs, token usage, prompt management, and RAG sync.

## Main Features

- Student dashboard, profile, CV upload, resources, Wizard, report, and AI Consultant chat.
- CV parsing with structured profile extraction, CV signals, versioned CV documents, review-before-merge, and active profile context.
- Multi-agent backend: Router, AdvisorAgent, RAGAgent, CRMAgent, CVAgent, JudgeAgent.
- Hybrid retrieval: ChromaDB vector search, FAQ/admissions corpus, BM25-style keyword retrieval, persona-aware rerank, and source labels.
- Safety layer: InputGuard, OutputGuard, RateLimiter, PII redaction, escalation detector, fallback card, recovery actions, and audit trail.
- Staff workflow: pending handoff queue, accept/busy state, handoff summary, and human reply into the student's session.
- Admin workflow: metrics, audit logs, token usage, prompt versioning, user/role management, RAG ingestion, and system health.

## Architecture

```mermaid
flowchart LR
    User["Student / Staff / Admin"] --> Frontend["React + Vite Frontend"]
    Frontend --> Backend["FastAPI Backend"]
    Backend --> Pipeline["AI Pipeline<br/>Guard -> Route -> Agent -> Judge"]
    Pipeline --> Advisor["AdvisorAgent<br/>Major match"]
    Pipeline --> RAG["RAGAgent<br/>Admissions + FAQ"]
    Pipeline --> CRM["CRMAgent<br/>Profile context"]
    Pipeline --> CV["CVAgent<br/>CV signals"]
    Pipeline --> Judge["JudgeAgent<br/>Safety + escalation"]
    Backend --> Postgres["Railway PostgreSQL<br/>users, profiles, chat, audit"]
    RAG --> Chroma["ChromaDB<br/>vector knowledge base"]
    Backend --> Metrics["Metrics + audit + token usage"]
    Metrics --> Admin["Admin / Staff dashboards"]
```

## Tech Stack

- Frontend: React, Vite, Tailwind CSS, state store, React Router.
- Backend: FastAPI, Python, SQLAlchemy, PostgreSQL.
- AI/RAG: LLM router, advisor prompts, ChromaDB, embeddings, RAG service, judge/safety agents.
- Deployment: Railway split services for frontend, backend, and PostgreSQL.
- Logging: automatic AI prompt logging through hooks and manual AI log evidence in `AI-LOG_Manual/`.

## Repository Structure

```text
app/
  backend/                 FastAPI backend, agents, guards, services, tests
  frontend/                React frontend pages, components, hooks, API service
  guide/                   Product, PRD, UI pattern, and TCR guidance
AI-LOG_Manual/             Manual AI log source files and sessions.jsonl
scripts/                   AI logging hooks and setup helpers
chroma_db/                 Local ChromaDB vector store
data/                      Project data notes
architecture.md            Architecture and product diagrams
evaluation_evidence.md     Test, eval, metrics, and quality evidence
JOURNAL.md                 Weekly project journal
WORKLOG.md                 Technical decisions and implementation timeline
Pitch_deck.md              Submission pitch deck
```

## Local Setup

### 1. Install AI logging hook

```bash
bash scripts/setup_hooks.sh
```

Prompts are logged automatically through configured hooks. Do not commit `.ai-log/*.jsonl`.

### 2. Backend

```bash
cd app/backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Create `.env` from `.env.example` and configure:

```env
DATABASE_URL=postgresql://postgres:<password>@yamanote.proxy.rlwy.net:41557/railway
USE_MOCK=false
FRONTEND_URL=http://localhost:5173
```

### 3. Frontend

```bash
cd app/frontend
npm install
npm run dev
```

For local frontend calls:

```env
VITE_API_URL=http://localhost:8000
```

For production frontend calls:

```env
VITE_API_URL=https://a20-app-dung-production.up.railway.app
```

## How To Use The Product

1. Open the frontend live URL or local frontend dev server.
2. Sign up or log in.
3. Upload or update CV/profile in `/profile`.
4. Complete the 4-step Wizard in `/wizard`.
5. Review Top 3 major recommendations in `/report`.
6. Ask follow-up admissions questions in `/consultant`.
7. Request human counseling when the AI creates a fallback/handoff.
8. Use `/staff`, `/admin`, `/system/tokens`, and `/system/database` with admin/editor roles for operations.

## Key API Endpoints

- `GET /health`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/google`
- `POST /api/match`
- `POST /api/chat`
- `POST /api/upload-cv`
- `GET /api/profile/{user_id}`
- `GET /api/metrics`
- `GET /api/system/token-usage`
- `GET /api/admin/audit-logs`
- `GET /api/admin/pending-handoffs`
- `POST /api/admin/rag-sync`

## Testing And Evidence

Primary evidence is tracked in [evaluation_evidence.md](./evaluation_evidence.md). Current coverage includes guardrails, judge escalation, handoff, PMF metrics, profile/CV behavior, chat sessions, CRM PII masking, and golden-answer evaluation.

Useful commands:

```bash
cd app/backend
pytest
```

```bash
cd app/frontend
npm run build
```

## Submission Checklist

- Source code: frontend, backend, database integration, AI agents, API, config, and deploy resources are included.
- README: project description, links, architecture, setup, run, and product usage are included.
- Architecture: see [architecture.md](./architecture.md).
- AI logs: see [AI-LOG_Manual/sessions.jsonl](./AI-LOG_Manual/sessions.jsonl).
- Journal, worklog, pitch deck, and evaluation evidence are included.

## Notes

This project is a course build/demo. The AI assistant must not be treated as an official admissions decision-maker. High-stakes admissions, scholarship, or policy claims should be verified by VinUni admissions staff.
