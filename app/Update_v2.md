# Update v2: Enhanced Admin & Database Controls

This document guides the implementation of advanced administrative features within the `/system/database` (DatabaseManagementPage) and related backend services.

## 1. Prompt Version Management
**Objective:** Transition from basic prompt storage to a version-controlled system.

### Backend (`app/backend/main.py` & `app/backend/services/db_service.py`)
- **New Models:** 
    - `PromptCreateRequest`: `agent_name: str`, `version: str`, `content: str`
    - `PromptResponse`: `agent_name: str`, `version: str`, `content: str`, `created_at: datetime`
- **New Endpoint:** `GET /api/admin/prompts` to list all unique `agent_name` and their available `version` strings.
- **New Endpoint:** `DELETE /api/admin/prompts/{agent_name}/{version}` to remove specific entries.
- **Update `DBService`:** 
    - `get_all_prompts()`: Returns a list of all prompt records.
    - `delete_prompt_version(agent_name, version)`: Deletes the specific row.
    - Update `save_prompt_to_db`: Verify it correctly handles the `version` string as a unique identifier per agent.

### Frontend (`app/frontend/pages/DatabaseManagementPage.jsx`)
- **UI Section:** Add a "Prompt Configuration" card below the User table.
- **Table Columns:** `Agent Name`, `Version`, `Created At`, `Actions`.
- **Actions:** 
    - **New Prompt:** A button to open a modal for creating a new version of an agent's prompt.
    - **Delete:** A delete button that triggers a **Hard Confirmation Warning** (e.g., "Deleting a prompt version is irreversible and may break active agents. Type the version name to confirm.")

## 2. User CV Accessibility
**Objective:** Allow admins to audit student data by viewing their uploaded CVs directly from the user list.

### Integration
- **Backend Check:** Use the existing `GET /api/profile/{user_id}/cv` endpoint in `main.py`. Ensure it correctly pulls from `uploads/cv/{sanitized_id}.pdf`.
- **Frontend UI:** In the user management table within `DatabaseManagementPage.jsx`:
    - Add a "View CV" button/icon for users who have `cv_filename` in their profile.
    - Implementation: Open the CV URL (`/api/profile/{user_id}/cv`) in a new browser tab or an iframe modal.

## 3. Granular RAG Ingestion Controls
**Objective:** Replace the "Sync All" button with parameterized ingestion links for different data sources.

### Backend Updates
- **New Model:** 
    - `IngestRequest`: `source_type: str` ("internal" | "external"), `params: Dict[str, Any]`
- **Update Endpoint:** Modify `POST /api/admin/rag/ingest` to accept `IngestRequest`.
    - If `internal`: Scan `data/corpus/`.
    - If `external`: Expect `url` in params and trigger web scraper.
- **RAG Service:** Update `pipeline.rag.rag_service.sync_all()` to accept these filters.

### Frontend UI
- **Ingestion Panel:**
    - **Internal Tab:** Button labeled "Sync School Handbook (Local PDF)" -> calls `/api/admin/rag/ingest` with `source_type: "internal"`.
    - **External Tab:** Input field for URL + button labeled "Crawl Web Source" -> calls `/api/admin/rag/ingest` with `source_type: "external"` and `params: { url: ... }`.
    - **Options:** Checkbox for "Force Overwrite" (passed in params).

## 4. Mobile & UI Enhancements
**Objective:** Ensure a seamless experience on mobile devices (specifically iPhone) and expand chatbot capabilities.

### iPhone Window Responsiveness
- **Sidebar:** Convert the `LeftPanel` into a mobile-friendly Drawer pattern for screens `< 768px`.
- **Layout:** Ensure `main` container uses `overflow-y-auto` properly to prevent "Overflow Trap" on iOS Safari.
- **Touch Targets:** Increase padding for buttons and interactive elements to meet Apple's Human Interface Guidelines (minimum 44x44pt).

### Chatbot PDF Upload
- **UI:** Add a **(+)** symbol button next to the chat input field.
- **Action:** Clicking **(+)** reveals a menu with "Add PDF".
- **Logic:** 
    - Triggers a file picker for `.pdf` files.
    - Reuses the `api.uploadCv` logic to extract text and signals.
    - Automatically adds the extracted text as context for the next chat message.

## 5. Major Grounding & Report Updates
**Objective:** Improve the accuracy of suggestions by moving away from mock data.

### Real-Time Data Grounding (Replacing Mock Data)
- **Logic:** The system must prioritize information from the following official VinUni sources over any hardcoded mock descriptions or general LLM training data.
- **Primary Sources to Ingest & Reference:**
    - **Admissions & Majors:** VinUni Admissions FAQ - Admissions
    - **Tuition & Financial Aid:** VinUni Admissions FAQ - Tuition
    - **Scholarship Specifics:** VinUni Scholarship Details
    - **General Portal:** VinUni Main Admissions
    - **Advisor Landing:** [VinUni Admission Portal](https://vinuni.edu.vn/admission/) - Should trigger a "Đăng ký tư vấn" CTA if the user intent is human help.

### Backend Implementation
- **RAG Integration:** Update `app/backend/data/faq/` ingestion logic to specifically parse and index content from these URLs.
- **Advisor Agent:** Update the prompt for the `advisor_agent` to prioritize context retrieved from these domains when discussing major requirements or costs.
- **Major Link Mapping:** Ensure the `majors` table in PostgreSQL maps each major to its corresponding section in the official portal rather than a mock description.

### Report Page Suggestions
- **Recommendation Rationale:** Update `ReportPage.jsx` to show a "Why this fits you?" section. 
    - It must cite specific criteria found in the `admissions.vinuni.edu.vn` corpus.
    - Cross-reference student attributes (from uploaded PDF/Profile) against official admission conditions.
- **Call to Action:** Add a "Verified Info" badge next to majors that are grounded in real school links.

## 6. Interactive Chat Features
**Objective:** Move beyond plain text to structured, interactive components and user-driven history management.

### Rich Suggestion Cards
When the AI suggests specific opportunities in chat, use structured UI cards:
- **Major Suggestion Card:** Displays Name, Department, and a "View Details" link to the VinUni site.
- **Job/Career Card:** Displays potential roles, average industry salary (if available), and "Skills Needed" tags.
- **Scholarship Card:** Displays Scholarship name, value (e.g., 50%, 100%), and eligibility criteria.

### User Message Management
- **Edit Message ("Fix"):**
    - **UI:** Hover icon on user messages to "Edit".
    - **Logic:** Replaces the message and re-triggers the AI response flow, effectively "branching" or updating the conversation state.
- **Delete Message:**
    - **UI:** Trash icon on user or AI messages.
    - **Logic:** Calls `DELETE /api/chat/messages/{message_id}` to remove from DB and local state.

## 7. Environment Variables
- Add `ALLOW_PROMPT_DELETION=true` to `.env` to gate the delete functionality for extra safety.

## 8. T-C-R Alignment Checklist
Ensure these updates follow the Admissions TCR pattern:
- **T (Transparency):** 
    - Show logs of who deleted which prompt version and when an ingestion task completes.
    - Explicitly label data with the specific VinUni source URL (e.g., "Nguồn: admissions.vinuni.edu.vn/vi/hoc-bong...").
- **C (Control):** 
    - **User Chat Control:** Users can now fix/delete their own history to correct AI misunderstandings.
    - **Admin Control:** The "Delete Prompt" warning and selective RAG ingestion.
    - **Context Control:** The **(+) Add PDF** button for custom session context.
- **R (Recovery):** Keep the `latest` version of a prompt safe even if a specific numbered version is deleted. Provide clear error feedback if a PDF CV is missing from the filesystem.

---
*Reference Files:*
- Backend: `app/backend/main.py`, `app/backend/services/db_service.py`
- Frontend: `app/frontend/pages/DatabaseManagementPage.jsx`
- UI Pattern: `app/guide/archetype/archetypes_admissions.md` (Pattern 6: Queue + Approval)
```

<!--
[PROMPT_SUGGESTION]In app/backend/main.py, add the GET and DELETE endpoints for prompt versions as described in Update_v2.md.[/PROMPT_SUGGESTION]
[PROMPT_SUGGESTION]Update app/frontend/pages/DatabaseManagementPage.jsx to include the prompt management table and the "View CV" links for users.[/PROMPT_SUGGESTION]
