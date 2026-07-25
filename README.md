# Tutorsolve WhatsApp CRM

A highly scalable, multi-agent WhatsApp CRM built to handle dynamic conversations, team management, and customer support. 

## 🏗️ Architecture Stack

This project strictly adheres to a decoupled client-server architecture:

- **Backend:** Python / Flask (App Factory Pattern) / SQLAlchemy
- **Database:** SQLite (Development) / PostgreSQL (Production ready)
- **Frontend:** React / Next.js (App Router) / Tailwind CSS v4
- **Security:** HttpOnly JWT Session Cookies, Role-Based Access Control (Admin, Manager, Agent)

## 🚀 Getting Started

The application is split into two directories: `backend` and `frontend`. You must run both servers simultaneously for local development.

### 1. Booting the Backend (Flask)
We use `uv` for lightning-fast Python package management.
```bash
cd backend
# Install dependencies
uv sync
# Seed the initial admin user (admin@crm.com / adminpassword)
uv run python seed_admin.py
# Start the Flask development server on port 5000
FLASK_APP=app FLASK_ENV=development uv run flask run --port=5000
```
*See `backend/README.md` for full API and testing documentation.*

### 2. Booting the Frontend (Next.js)
We use `pnpm` for frontend package management.
```bash
cd frontend
# Install dependencies
pnpm install
# Start the Next.js development server on port 3000
pnpm run dev
```
*See `frontend/README.md` for full component and testing documentation.*

## 🧪 Testing
Both environments are heavily driven by TDD (Test-Driven Development).
- **Backend:** `uv run python -m pytest` (Currently 66/66 passing)
- **Frontend:** `pnpm test` (Currently 17/17 passing)

## 🔐 Environment Variables
Copy `.env.example` to `.env` in the `backend` folder, and `.env.example` to `.env.local` in the `frontend` folder to configure your local environment securely. Never commit `.env`/`.env.local` or hardcode these values.

**Backend (`backend/.env`):**

| Variable | Purpose |
|---|---|
| `FRONTEND_URL` | Next.js origin allowed by CORS |
| `SECRET_KEY` | Signs JWT access tokens — must be a real secret outside local dev |
| `SESSION_COOKIE_SECURE` | Set `True` in production so the auth cookie is HTTPS-only |
| `DATABASE_URL` | SQLAlchemy connection string (defaults to a local SQLite file if unset) |
| `SENDGRID_API_KEY` | SendGrid key for onboarding emails; leave blank to mock sending locally |
| `SENDGRID_FROM_EMAIL` | From-address for onboarding emails |
| `WHATSAPP_VERIFY_TOKEN` | Shared secret you choose and register in the Meta App Dashboard's webhook config; Meta echoes it back on the verification handshake |
| `WHATSAPP_ACCESS_TOKEN` | Meta WhatsApp Cloud API access token (Meta App Dashboard > WhatsApp > API Setup) |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta-assigned phone number ID used to send outbound messages |
| `ENCRYPTION_KEY` | Fernet key that AES-256-encrypts customer phone numbers at rest — the checked-in default is a known dev-only key and must be replaced with a real generated key (see `backend/.env.example`) outside local dev |

**Frontend (`frontend/.env.local`):**

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Base URL of the Flask backend |

See `backend/.env.example` and `frontend/.env.example` for the full set of defaults.