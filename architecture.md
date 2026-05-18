# Architecture - VinUni Admission Assistant

Tài liệu này mô tả kiến trúc sản phẩm VinUni Admission Assistant theo đúng các lớp bắt buộc trong repository: User, Frontend, Backend/API, Database, AI Agent/LLM, external services và các luồng dữ liệu chính.

## Live System

- Frontend: https://a20-app-124.up.railway.app/
- Backend/API: https://a20-app-dung-production.up.railway.app/
- Health check: https://a20-app-dung-production.up.railway.app/health
- Database: Railway PostgreSQL, configured through `DATABASE_URL`
- Public-safe database form: `postgresql://postgres:***@yamanote.proxy.rlwy.net:41557/railway`

> Không ghi mật khẩu database thật trong tài liệu public. Full credential nằm trong Railway environment variables và local `.env`.

---

## 1. High-level Architecture

```mermaid
flowchart LR
    User["User<br/>Student / Staff / Admin"] --> FE["Frontend<br/>React + Vite"]
    FE --> API["Backend/API<br/>FastAPI"]
    API --> DB["Database<br/>Railway PostgreSQL"]
    API --> AI["AI Agent / LLM Layer"]
    AI --> LLM["External LLM Provider<br/>Gemini/OpenAI-compatible"]
    AI --> VDB["Vector Store<br/>ChromaDB"]
    API --> Logs["Audit + Metrics + AI Logs"]
    Staff["Staff / Counselor"] --> FE
    Admin["Admin"] --> FE
    Logs --> Admin
    DB --> API
```

### Mục tiêu kiến trúc

- Học sinh có thể làm Wizard, upload CV, xem report và hỏi AI Consultant.
- AI trả lời dựa trên profile, CV, RAG sources và guardrails.
- Khi AI không đủ chắc chắn, hệ thống chuyển sang human handoff cho tư vấn viên.
- Admin/staff có thể theo dõi audit, metrics, token usage, handoff queue và RAG/prompt operations.

---

## 2. Component Map

```mermaid
flowchart TB
    subgraph UserLayer["User Layer"]
        Student["Student"]
        StaffUser["Staff / Editor"]
        AdminUser["Admin"]
    end

    subgraph Frontend["Frontend - app/frontend"]
        Login["Login / Signup"]
        Dashboard["Dashboard"]
        Wizard["Wizard"]
        Profile["Profile + CV Upload"]
        Report["Report"]
        Consultant["AI Consultant"]
        Resources["Resources"]
        StaffDash["Staff Dashboard"]
        AdminDash["Admin Dashboard"]
        SystemPages["System Tokens + Database"]
    end

    subgraph Backend["Backend - app/backend"]
        AuthAPI["Auth APIs"]
        MatchAPI["POST /api/match"]
        ChatAPI["POST /api/chat"]
        CVAPI["POST /api/upload-cv"]
        ProfileAPI["Profile APIs"]
        HandoffAPI["Handoff APIs"]
        AdminAPI["Admin APIs"]
        MetricsAPI["Metrics APIs"]
    end

    subgraph AI["AI Agent Layer"]
        Pipeline["Pipeline"]
        Router["LLMRouter"]
        Advisor["AdvisorAgent"]
        RAG["RAGAgent"]
        CRM["CRMAgent"]
        CVAgent["CVAgent"]
        Judge["JudgeAgent"]
        Guards["InputGuard / OutputGuard / RateLimiter"]
    end

    subgraph Data["Data Layer"]
        Postgres["PostgreSQL"]
        Chroma["ChromaDB"]
        Admissions["Admissions corpus"]
        FAQ["FAQ corpus"]
        Audit["AuditLog"]
    end

    Student --> Login
    Student --> Dashboard
    Student --> Wizard
    Student --> Profile
    Student --> Report
    Student --> Consultant
    StaffUser --> StaffDash
    AdminUser --> AdminDash
    AdminUser --> SystemPages

    Frontend --> Backend
    MatchAPI --> Pipeline
    ChatAPI --> Pipeline
    CVAPI --> CVAgent
    Pipeline --> Guards
    Pipeline --> Router
    Router --> Advisor
    Router --> RAG
    Router --> CRM
    Pipeline --> Judge
    Backend --> Postgres
    RAG --> Chroma
    Chroma --> Admissions
    Chroma --> FAQ
    Pipeline --> Audit
    MetricsAPI --> Audit
```

---

## 3. Frontend Architecture

Frontend nằm trong `app/frontend`.

### Công nghệ

- React + Vite
- React Router
- Tailwind CSS
- Context/state hooks cho auth, language, chat và session state
- API boundary ở `app/frontend/services/api.js`

### Route chính

| Route | Vai trò |
|---|---|
| `/login` | Đăng nhập |
| `/admin-signup` | Tạo admin |
| `/dashboard` | Trang chính của học sinh |
| `/wizard` | Wizard 4 bước để match ngành |
| `/profile` | Hồ sơ, CV upload, CV documents |
| `/report` | Top 3 ngành, match score, evidence |
| `/consultant` | AI Consultant chat |
| `/resources` | Hướng dẫn dùng app |
| `/staff` | Staff handoff queue |
| `/admin` | Admin dashboard |
| `/system/tokens` | Token/cost usage |
| `/system/database` | Prompt/database/RAG admin controls |

### Frontend data flow

```mermaid
sequenceDiagram
    actor User as Student
    participant UI as React UI
    participant API as services/api.js
    participant BE as FastAPI Backend

    User->>UI: Nhập form / chat / upload CV
    UI->>API: Normalize request
    API->>BE: HTTP request with auth/context
    BE-->>API: JSON response
    API-->>UI: Normalize fields and errors
    UI-->>User: Render report, chat answer, source, fallback or status
```

---

## 4. Backend/API Architecture

Backend nằm trong `app/backend`, entrypoint chính là `main.py`.

### API nhóm chính

| API group | Endpoint tiêu biểu | Chức năng |
|---|---|---|
| Health | `GET /health` | Kiểm tra backend sống |
| Auth | `/api/auth/signup`, `/api/auth/login`, `/api/auth/google` | Đăng ký/đăng nhập |
| Match | `POST /api/match` | Wizard -> Top 3 majors |
| Chat | `POST /api/chat` | AI Consultant |
| CV | `POST /api/upload-cv` | Upload và trích xuất CV |
| Profile | `/api/profile/...` | Hồ sơ học sinh, CV documents |
| Handoff | `/api/handoff...`, `/api/admin/handoff...` | Human fallback |
| Metrics | `GET /api/metrics`, `GET /api/system/token-usage` | PMF, token, cost |
| Admin | `/api/admin/...` | Audit logs, prompts, RAG sync, users |

### Shared request lifecycle

```mermaid
flowchart LR
    Request["Incoming Request"] --> Rate["RateLimiter"]
    Rate --> Input["InputGuard"]
    Input --> Route["Route / Pipeline"]
    Route --> Agent["Agent Execution"]
    Agent --> Output["OutputGuard"]
    Output --> Judge["JudgeAgent"]
    Judge --> Decision{"Safe?"}
    Decision -->|Yes| Response["Return response"]
    Decision -->|No| Fallback["Fallback / Handoff"]
    Response --> Audit["AuditLog"]
    Fallback --> Audit
```

---

## 5. AI Agent / LLM Layer

AI layer nằm trong `app/backend/agents`, `app/backend/orchestrator`, `app/backend/services` và `app/backend/guards`.

### Agent roles

| Component | Vai trò |
|---|---|
| `Pipeline` | Điều phối full flow cho `/api/match` và `/api/chat` |
| `LLMRouter` | Chọn route: `rag`, `crm`, `advisor`, `fallback` |
| `AdvisorAgent` | Match ngành và tư vấn định hướng |
| `RAGAgent` | Trả lời câu hỏi tuyển sinh bằng retrieval + sources |
| `CRMAgent` | Dùng profile/student data trong tư vấn |
| `CVAgent` | Trích xuất CV signals và persona summary |
| `JudgeAgent` | Kiểm tra safety, truthfulness, escalation |
| `InputGuard` | Chặn prompt injection, input nguy hiểm, quá dài |
| `OutputGuard` | Redact PII, sanitize output |
| `EscalationDetector` | Phát hiện overcommitment và tạo handoff |

### AI routing

```mermaid
flowchart TD
    Chat["POST /api/chat"] --> Guard["InputGuard + RateLimiter"]
    Guard --> Router{"LLMRouter"}
    Router -->|Admissions / FAQ| RAG["RAGAgent"]
    Router -->|Profile / GPA / IELTS| CRM["CRMAgent"]
    Router -->|Major / career fit| Advisor["AdvisorAgent"]
    Router -->|Unsafe / unclear| Fallback["Fallback"]
    RAG --> Judge["JudgeAgent"]
    CRM --> Judge
    Advisor --> Judge
    Fallback --> Handoff["Human Handoff"]
    Judge -->|pass| Answer["Answer + sources/status"]
    Judge -->|reject/escalate| Handoff
```

---

## 6. Database Architecture

Production database chạy trên Railway PostgreSQL. Local/dev có thể dùng PostgreSQL hoặc mock/in-memory tùy `USE_MOCK`.

### Core tables

```mermaid
erDiagram
    User ||--o{ ChatSession : owns
    User ||--o{ ChatMessage : sends
    User ||--o| Student : has_profile
    User ||--o{ CVDocument : uploads
    User ||--o{ AuditLog : generates
    User ||--o{ HandoffMessage : participates
    ChatSession ||--o{ ChatMessage : contains
    Major ||--o{ AdmissionsData : has

    User {
        string user_id PK
        string email
        string full_name
        string role
        json permissions
        boolean blacklisted
    }

    Student {
        string user_id PK
        float gpa
        json preferred_majors
        json test_scores
        json profile_data
    }

    CVDocument {
        string id PK
        string user_id FK
        string filename
        text raw_text
        json structured_data
        json cv_signals
        int version
        boolean is_active
    }

    ChatSession {
        string id PK
        string user_id FK
        string title
        datetime created_at
    }

    ChatMessage {
        int id PK
        string session_id FK
        string role
        text content
        string agent_type
        json sources
    }

    AuditLog {
        int id PK
        string user_id FK
        string endpoint
        string trace_id
        string route
        json judge_result
        string escalation_level
        string handoff_status
        boolean ai_resolved
        boolean fallback
    }

    Major {
        string id PK
        string name
        text description
    }

    AdmissionsData {
        int id PK
        string major_id FK
        text requirements
        text description
    }

    HandoffMessage {
        int id PK
        string trace_id
        string user_id FK
        string sender_role
        text content
    }
```

---

## 7. Main Data Flows

### 7.1 Wizard major matching

```mermaid
sequenceDiagram
    actor Student
    participant FE as WizardPage
    participant API as POST /api/match
    participant Guard as Guards
    participant CV as CV/Profile Context
    participant Advisor as AdvisorAgent
    participant Judge as JudgeAgent
    participant DB as PostgreSQL
    participant Report as ReportPage

    Student->>FE: Trả lời 4 bước Wizard
    FE->>API: answers + user_id + optional CV context
    API->>Guard: Validate/rate limit
    API->>CV: Load active CV/profile
    CV-->>API: cv_signals + persona summary
    API->>Advisor: Match Top 3 majors
    Advisor-->>API: top3 + match_score + rationale
    API->>Judge: Safety and structure check
    Judge-->>API: pass/fail/escalation
    API->>DB: Save audit + result metadata
    API-->>FE: top3 or fallback_card
    FE->>Report: Render major report
```

### 7.2 Chat/RAG flow

```mermaid
sequenceDiagram
    actor Student
    participant Chat as Consultant ChatBox
    participant API as POST /api/chat
    participant Router as LLMRouter
    participant RAG as RAGAgent
    participant Chroma as ChromaDB
    participant Judge as JudgeAgent
    participant DB as PostgreSQL

    Student->>Chat: Ask admissions question
    Chat->>API: message + history + user_id
    API->>Router: classify intent
    Router->>RAG: route=rag
    RAG->>Chroma: retrieve admissions/FAQ docs
    Chroma-->>RAG: top documents + metadata
    RAG-->>API: answer + sources
    API->>Judge: safety/truthfulness check
    API->>DB: save chat message + audit log
    API-->>Chat: response + sources + status
```

### 7.3 CV/Profile flow

```mermaid
stateDiagram-v2
    [*] --> UploadCV
    UploadCV --> ExtractText
    ExtractText --> OCRFallback: text missing/short
    ExtractText --> ParseStructured: text ok
    OCRFallback --> ParseStructured
    ParseStructured --> GenerateSignals
    GenerateSignals --> SaveCVDocument
    SaveCVDocument --> UserReview
    UserReview --> ConfirmMerge
    UserReview --> DeleteDocument
    ConfirmMerge --> ActiveProfile
    ActiveProfile --> MatchContext
    ActiveProfile --> ChatPersona
    DeleteDocument --> [*]
```

### 7.4 Human handoff flow

```mermaid
sequenceDiagram
    actor Student
    participant AI as AI Pipeline
    participant Judge as Judge/EscalationDetector
    participant Audit as AuditLog
    actor Staff
    participant StaffUI as Staff Dashboard
    participant Chat as Chat Session

    Student->>AI: Ask risky or human-support question
    AI->>Judge: Evaluate overcommitment/safety
    Judge-->>AI: escalation MEDIUM/HIGH or handoff required
    AI->>Audit: fallback=true, handoff_status=pending, trace_id
    AI-->>Student: fallback message + next action
    Staff->>StaffUI: View pending handoff
    StaffUI->>Audit: accept / busy / inspect
    Staff->>StaffUI: Write human reply
    StaffUI->>Chat: Save handoff message
    Chat-->>Student: Human advisor message
```

---

## 8. Deployment Architecture

```mermaid
flowchart LR
    Dev["Developer"] --> Git["GitHub Repository"]
    Git --> RailwayFE["Railway Frontend Service"]
    Git --> RailwayBE["Railway Backend Service"]
    RailwayFE --> PublicFE["Public Frontend URL"]
    RailwayBE --> PublicBE["Public Backend URL"]
    RailwayBE --> RailwayDB["Railway PostgreSQL"]
    RailwayBE --> Env["Environment Variables"]
    Env --> LLMKeys["LLM keys"]
    Env --> DBURL["DATABASE_URL"]
    Env --> CORS["FRONTEND_URL / CORS"]
```

### Runtime configuration

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `USE_MOCK` | Toggle mock mode vs real LLM/database behavior |
| `FRONTEND_URL` | CORS and redirect configuration |
| `VITE_API_URL` | Frontend browser API target |
| LLM API keys | External model calls |

---

## 9. Observability And Evidence

The architecture is designed so the team can prove what happened, not only show the UI.

| Evidence source | Purpose |
|---|---|
| `AuditLog` | Route, response time, judge result, fallback, handoff status |
| `SecurityEvent` | Guardrail/rate limit violations |
| `ChatMessage` / `ChatSession` | Conversation persistence |
| `/api/metrics` | PMF metrics and route distribution |
| `/api/system/token-usage` | Token/cost visibility |
| `AI-LOG_Manual/sessions.jsonl` | AI coding usage evidence |
| `evaluation_evidence.md` | Test/eval summary |

---

## 10. Key Design Decisions

- **Decision support, not official admission decision:** AI helps students prepare and understand fit, but high-stakes claims require official confirmation.
- **RAG for source-aware answers:** admissions/FAQ questions should cite or label sources.
- **Human handoff for uncertainty:** fallback is a designed recovery path, not only an error.
- **Review-before-merge for CV:** extracted CV data must be reviewed before changing profile data.
- **Audit-first operations:** metrics and staff/admin views are based on persisted audit logs.
- **Do not expose secrets:** database password and LLM keys stay in environment variables.

---

## 11. Architecture Checklist

- User layer: student, staff/editor, admin.
- Frontend: React/Vite routes and UI flows.
- Backend/API: FastAPI endpoints and pipeline.
- Database: PostgreSQL models and relationships.
- AI Agent/LLM: Router, Advisor, RAG, CRM, CV, Judge, Guards.
- External services: Railway, PostgreSQL, LLM provider, ChromaDB/vector retrieval.
- Main data flows: Wizard, Chat/RAG, CV/Profile, Human Handoff.
- Evidence: audit logs, metrics, AI logs, evaluation report.
