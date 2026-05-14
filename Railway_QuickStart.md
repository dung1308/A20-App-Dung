# Railway Deployment Guide

This guide explains how to deploy the VinUni Admission Assistant backend and its PostgreSQL database to Railway.

## 0. Local Docker Compose Setup

Use `.env` for local Docker Compose. The important difference is the database host:

- **Docker Compose local:** `DATABASE_URL=postgresql://...@db:5432/vinuni_db`
- **Railway production:** `DATABASE_URL=${{Postgres.DATABASE_URL}}`
- **Running backend directly on your machine:** use `localhost` instead of `db`

Minimum local `.env` values for Docker Compose:

```env
VITE_API_URL=http://localhost:8000
VITE_GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com

GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com
SECRET_KEY=change-this-local-dev-secret
ADMIN_SIGNUP_KEY=change-this-admin-signup-key

OPENAI_API_KEY=sk-your-rotated-openai-key
OPENAI_MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small
USE_MOCK=False

POSTGRES_DB=vinuni_db
POSTGRES_USER=vinuni_user2
POSTGRES_PASSWORD=change-this-local-db-password
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}

CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000
```

Run locally:

```bash
docker compose up --build
```

Then open:

- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:8000/health`
- Backend docs: `http://localhost:8000/docs`

Security note: never commit a real `.env`. If an API key is pasted into chat, GitHub, or logs, rotate it in the provider dashboard before using it again.

## 1. Create a Railway Project
1. Log in to [Railway.app](https://railway.app/).
2. Click **New Project** and select **Deploy from GitHub repo**.
3. Select your repository.

## 2. Provision the PostgreSQL Database
1. In your Railway project dashboard, click **+ Add Service**.
2. Select **Database** -> **Add PostgreSQL**.
3. Once provisioned, click on the **Postgres** service and go to the **Variables** tab. 
4. Note the `DATABASE_URL`. Railway automatically provides this to linked services.

## 3. Configure the Backend Service
1. Click on your **Backend Service** (the one deployed from GitHub).
2. Go to the **Settings** tab and ensure the **Root Directory** is set to `app/backend` (or wherever your `main.py` resides).
3. Go to the **Variables** tab.
4. Click **New Variable** -> **Reference Variable** and select the `DATABASE_URL` from your Postgres service.
5. Add the following environment variables manually.

### Backend variables to send to Railway

Required for production:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
USE_MOCK=False
ENVIRONMENT=production
OPENAI_API_KEY=sk-your-openai-production-key
SECRET_KEY=replace-with-a-long-random-string
GOOGLE_CLIENT_ID=your_google_client_id_here.apps.googleusercontent.com
CORS_ORIGINS=https://your-frontend-service.up.railway.app
```

Recommended:

```env
OPENAI_MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small
PROMPT_VERSION=v2
LOG_LEVEL=INFO
ADMIN_SIGNUP_KEY=replace-with-a-private-admin-signup-key
```

Optional, depending on the feature:

```env
# Human handoff webhook. Leave unset only if webhook notification is not used.
HUMAN_WEBHOOK=https://your-webhook-receiver.example.com/handoff

# Redis is currently optional. Add it only if you provision/use Redis.
REDIS_URL=${{Redis.REDIS_URL}}

# Rate limiting
RATE_LIMIT_MAX_REQUESTS=10
RATE_LIMIT_WINDOW_SECONDS=60

# LLM budget and cost controls
DAILY_LLM_BUDGET=100
GLOBAL_DAILY_BUDGET_USD=5.00
USER_DAILY_BUDGET_USD=0.50
LLM_INPUT_COST_PER_1K=0.00015
LLM_OUTPUT_COST_PER_1K=0.00060
MAX_SINGLE_PROMPT_TOKENS=2000

# CV PDF extraction and OCR fallback
MIN_PDF_TEXT_CHARS=500
MAX_OCR_PAGES=5
OCR_LANGUAGES=eng+vie
OCR_RENDER_SCALE=2.0
# Only set this if Railway cannot find tesseract automatically.
# TESSERACT_CMD=/usr/bin/tesseract
```

Notes:
- `DATABASE_URL` should be a Railway reference variable from the Postgres service. Do not paste a local SQLite URL in production.
- Do not add local Docker-only database variables (`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`) to the backend service unless you are also managing your own Postgres container. Railway's Postgres service provides `DATABASE_URL`.
- Do not use `@db:5432` on Railway. The `db` hostname only exists inside local Docker Compose.
- `SECRET_KEY` signs JWTs. Changing it invalidates existing logins.
- `GOOGLE_CLIENT_ID` is used by the backend to verify Google login tokens.
- `CORS_ORIGINS` is a comma-separated list. Include the Railway frontend public URL and any custom domain, for example:
  ```env
  CORS_ORIGINS=https://vinuni-frontend.up.railway.app,https://your-custom-domain.com
  ```
- `USE_MOCK=False` is required for real OpenAI and PostgreSQL behavior. Use `USE_MOCK=True` only for demo/testing.
- CV OCR requires the backend image to install `tesseract-ocr`, `tesseract-ocr-eng`, and `tesseract-ocr-vie`. The checked-in `app/backend/Dockerfile` installs these packages; keep the backend root directory set to `app/backend` so Railway uses that Dockerfile when Docker deployment is enabled.

## 4. Configure the Frontend Service
1. In the Railway dashboard, click **+ Add Service** -> **GitHub Repo** and select the same repository again.
2. Click on this new service and go to the **Settings** tab.
3. Set the **Root Directory** to `app/frontend`.
4. Go to the **Variables** tab and add the frontend variables.

### Frontend variables to send to Railway

Required:

```env
VITE_API_URL=https://your-backend-service.up.railway.app
VITE_GOOGLE_CLIENT_ID=your_google_client_id_here.apps.googleusercontent.com
```

Optional:

```env
VITE_USE_MOCK=false
```

Notes:
- `VITE_API_URL` must be the **Public URL** of your Backend Service, for example `https://backend-production-xxx.up.railway.app`.
- Do **not** use the `.railway.internal` URL for `VITE_API_URL`. The frontend runs in the user's browser, so it must use the public internet address.
- `VITE_GOOGLE_CLIENT_ID` should match the same Google OAuth client configured for the backend as `GOOGLE_CLIENT_ID`.
5. (Optional) If Railway doesn't auto-detect the build, set the **Start Command** to:
   ```bash
   npm run dev -- --host 0.0.0.0 --port $PORT
   ```

## 4.1 Google OAuth Settings

In Google Cloud Console, update the OAuth client before testing production login:

- **Authorized JavaScript origins**:
  - `https://your-frontend-service.up.railway.app`
  - any custom frontend domain
- **Authorized redirect URIs**:
  - Add the same frontend origin if your OAuth flow requires it.

If Google login fails with an invalid audience or origin error, check that:
- Frontend `VITE_GOOGLE_CLIENT_ID` equals backend `GOOGLE_CLIENT_ID`.
- The Railway frontend public URL is listed in Google OAuth allowed origins.

## 5. Initialization & Seeding
The database tables are created automatically on startup by `database.py`, but you must seed the initial admission requirements (CS, EE, etc.) using `db_init.py`.

### Option A: Via Railway Console (Recommended)
1. In your Backend Service, go to the **Console** tab.
2. Run the following command:
   ```bash
   python db_init.py --seed
   ```
   Use this form because the Railway backend service root directory is `app/backend`.

### Option B: Via Railway CLI
If you have the CLI installed locally:
```bash
railway run python app/backend/db_init.py --seed
```

## 6. Deployment Commands
Railway usually detects the `start` command for FastAPI (Uvicorn). If not, set the **Start Command** in the service settings:

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

## 7. Verification
1. **Health Check**: Visit `https://your-backend-url.railway.app/health`.
2. **Check Logs**: Go to the **Logs** tab in Railway. Look for the message:
   `Database initialized successfully: postgres.railway.internal...`
3. **API Docs**: Access your production Swagger UI at `https://your-backend-url.railway.app/docs`.

## Troubleshooting
- **Database Protocol**: If you get a `NoSuchModuleError`, ensure `database.py` is replacing `postgres://` with `postgresql://` as Railway provides the shorter string by default.
- **CORS Errors**: Ensure your frontend public URL is included in the backend `CORS_ORIGINS` variable.
- **Permissions**: If `pgcrypto` fails to enable, ignore the warning as long as the tables are created. Your database user usually has sufficient privileges on Railway.
- **OCR unavailable**: If scanned CVs return little or no text, confirm the backend deploy used `app/backend/Dockerfile`, the Tesseract packages installed successfully, and `OCR_LANGUAGES=eng+vie`. If logs show `tesseract not found`, set `TESSERACT_CMD=/usr/bin/tesseract`.
