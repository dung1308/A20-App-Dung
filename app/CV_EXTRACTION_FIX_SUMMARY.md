# Uncommitted Changes Summary

This file summarizes the current uncommitted worktree from `git status --short`.

## Overview

Current uncommitted state includes:

- Backend CV extraction and profile persistence changes.
- Backend PDF OCR support.
- Backend RAG/CV retrieval and profile context changes.
- Frontend profile/CV upload workflow changes.
- New tests and summary docs.
- Generated/runtime artifacts that should be reviewed carefully before committing.

## Backend: CV Upload, Parsing, and Profile Merge

Changed files:

- `app/backend/services/cv_parser.py`
- `app/backend/agents/cv_agent.py`
- `app/backend/models/cv_schema.py`
- `app/backend/main.py`
- `app/backend/services/db_service.py`
- `app/backend/test_cv_extraction.py`

Summary:

- Added `parse_metadata` to structured CV data so the app can tell whether extraction came from `llm` or `fallback`.
- Made CV parsing fail soft:
  - LLM parsing uses a longer timeout.
  - If LLM parsing times out or returns no result, local fallback extraction still returns structured data.
  - Fallback extracts personal info, CV sections, skills, GPA, education, experience, projects, certifications, achievements, languages, and career goals where possible.
- Reworked CV signal extraction:
  - Supports Vietnamese and English headers such as `HỌC VẤN`, `KINH NGHIỆM`, `KỸ NĂNG`, `DỰ ÁN`, `EDUCATION`, `EXPERIENCE`, `SKILLS`.
  - Uses both raw CV text and parsed `structured_data`.
  - Produces skills, GPA estimate, job titles, suggested majors, major explanations, and persona summary.
- Updated `/api/upload-cv` so `cv_agent.analyze(...)` receives `structured_data`.
- Added CV document/profile endpoints and persistence behavior already present in the worktree:
  - Confirm CV into profile.
  - List uploaded CV documents.
  - Delete uploaded CV documents.
- Updated profile merge behavior:
  - Avoids overwriting existing useful profile fields with empty extracted arrays or empty strings.
  - Merges non-empty personal info safely.
- Added `app/backend/test_cv_extraction.py`:
  - Tests LLM fallback parsing.
  - Tests Vietnamese header extraction and structured-data-aware CV signals.

## Backend: PDF Text Extraction and OCR

Changed files:

- `app/backend/services/pdf_loader.py`
- `app/backend/Dockerfile`
- `requirements.txt`
- `app/requirements.txt`
- `app/backend/requirements.txt` (new)

Summary:

- Replaced simple `pdfplumber` extraction with a two-stage PDF loader:
  - First tries embedded text extraction.
  - Falls back to OCR when extracted text is missing or too short.
- Added OCR support through:
  - `PyMuPDF`
  - `pytesseract`
  - `Pillow`
- Added Tesseract packages to the backend Docker image:
  - `tesseract-ocr`
  - `tesseract-ocr-eng`
  - `tesseract-ocr-vie`
- Added configurable OCR/text extraction settings:
  - `MIN_PDF_TEXT_CHARS`
  - `MAX_OCR_PAGES`
  - `OCR_LANGUAGES`
  - `OCR_RENDER_SCALE`
  - `TESSERACT_CMD`
- Cleans extracted text and removes NUL characters before storage/indexing.

## Backend: RAG, CV Retrieval, and Profile Context

Changed files:

- `app/backend/services/rag_service.py`
- `app/backend/orchestrator/pipeline.py`
- `RAG_CHANGES_SUMMARY.md` (new)

Summary:

- Added safe user/CV collection naming for Chroma collections.
- Added CV collection retrieval into RAG search when a `user_id` is available.
- Updated CV ingestion IDs to include a timestamp so repeated CV uploads do not collide.
- Added profile context construction in the pipeline:
  - Summary
  - Career goals
  - Skills
  - Education
  - Experience
  - CV persona summary
  - Suggested majors from CV
- Pipeline can use active CV signals when match requests do not include CV text/signals directly.
- `RAG_CHANGES_SUMMARY.md` documents a separate RAG/source-link/audit-log change set currently untracked.

## Backend: Database Models and Guards

Changed files:

- `app/backend/models/schemas.py`
- `app/backend/guards/input_guard.py`
- `app/backend/guards/output_guard.py`

Summary:

- Added `CVDocument` SQLAlchemy model for uploaded CV versions:
  - `id`
  - `user_id`
  - `filename`
  - `raw_text`
  - `structured_data`
  - `cv_signals`
  - `version`
  - `is_active`
  - `confirmed_at`
  - timestamps
- Updated guard type annotations from Python 3.9+ built-in generics to `typing.List[...]` style, which keeps imports compatible with older Python runtimes too.

## Frontend: CV Upload and Profile Page

Changed files:

- `app/frontend/components/CVUpload/CVUpload.jsx`
- `app/frontend/pages/ProfilePage.jsx`
- `app/frontend/pages/WizardPage.jsx`
- `app/frontend/services/api.js`
- `app/frontend/state/store.js`

Summary:

- Reworked `CVUpload` into a richer CV review flow:
  - Upload PDF.
  - Receive `structured_data`, `cv_signals`, full CV text, and `cv_document_id`.
  - Show editable extracted fields before saving.
  - Confirm CV into the authenticated user's profile.
  - Warn when extraction is fallback-based, partial, or nearly empty.
- Reworked `ProfilePage` from a small personal-info form into a full editable profile manager:
  - Personal info
  - Summary
  - Career goals
  - Skills
  - Languages
  - Certifications
  - Achievements
  - Education
  - Experience
  - Projects
  - Uploaded CV document list
  - CV delete action
- Added authenticated profile APIs in `api.js`:
  - `getProfileMe`
  - `updateProfileMe`
  - `confirmCV`
  - `getCVDocuments`
  - `deleteCVDocument`
- Updated wizard state flow:
  - Stores `cvDocumentId`.
  - Passes `cv_document_id` to `/api/match`.
  - Stores `structured_data` from CV upload.
- Updated Zustand store:
  - Added `cvDocumentId`.
  - Added `cvStructuredData`.
  - Expanded `setCVData(...)`.

## Generated or Runtime Artifacts

Changed files:

- `app/backend/chroma_db/chroma.sqlite3`
- `app/backend/logs/app.log`
- `app/frontend/node_modules/.vite/deps/_metadata.json`
- `app/frontend/node_modules/.vite/deps/package.json`
- `app/frontend/node_modules/.vite/deps/react-dom.js`
- `app/frontend/node_modules/.vite/deps/react-dom.js.map`
- `app/frontend/node_modules/.vite/deps/react-dom_client.js`
- `app/frontend/node_modules/.vite/deps/react-dom_client.js.map`
- `app/frontend/node_modules/.vite/deps/react-router-dom.js`
- `app/frontend/node_modules/.vite/deps/react-router-dom.js.map`
- `app/frontend/node_modules/.vite/deps/react.js`
- `app/frontend/node_modules/.vite/deps/react.js.map`
- `app/frontend/node_modules/.vite/deps/react_jsx-dev-runtime.js`
- `app/frontend/node_modules/.vite/deps/react_jsx-dev-runtime.js.map`
- `app/frontend/node_modules/.vite/deps/react_jsx-runtime.js`
- `app/frontend/node_modules/.vite/deps/react_jsx-runtime.js.map`
- `app/frontend/node_modules/.vite/deps/zustand.js`
- `app/frontend/node_modules/.vite/deps/zustand.js.map`

Notes:

- These look like local runtime/build/cache artifacts.
- They should be reviewed before commit; most projects should not commit Vite dependency cache, app logs, or local Chroma database files unless this repo intentionally tracks them.

## New Untracked Files

- `CV_EXTRACTION_FIX_SUMMARY.md`
  - This summary file.
- `RAG_CHANGES_SUMMARY.md`
  - Existing untracked summary for RAG/source-link changes.
- `app/backend/requirements.txt`
  - Backend-specific requirements file.
- `app/backend/test_cv_extraction.py`
  - New backend CV extraction unit tests.

## Verification Already Run

Python 3.11 was requested, but this machine does not have Python 3.11 installed.

`py -0p` showed:

- Python 3.12
- Python 3.8

Commands run successfully with Python 3.12:

```bash
py -3.12 -m unittest test_cv_extraction.py
py -3.12 -m py_compile services\cv_parser.py agents\cv_agent.py models\cv_schema.py main.py services\db_service.py guards\output_guard.py guards\input_guard.py
```

Frontend build:

```bash
npm run build
```

Result:

- Backend tests passed.
- Backend compile check passed.
- Frontend build passed.
- Vite reported only the large chunk size warning.

## Commit Hygiene Recommendations

Before committing, decide whether to include or revert generated/runtime artifacts:

- Usually exclude:
  - `app/backend/logs/app.log`
  - `app/backend/chroma_db/chroma.sqlite3`
  - `app/frontend/node_modules/.vite/deps/*`
- Usually include:
  - Backend source changes.
  - Frontend source changes.
  - Requirements changes.
  - New tests.
  - Intentional summary docs.

If creating a PR, remember the repo instruction:

- Run `bash scripts/setup_hooks.sh` before creating the PR.
- PR description must include:
  - `## Summary`
  - `## Changes`
