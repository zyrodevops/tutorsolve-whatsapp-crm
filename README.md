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
- **Backend:** `uv run pytest tests/` (Currently 21/21 passing)
- **Frontend:** `pnpm test` (Currently 8/8 passing)

## 🔐 Environment Variables
Copy `.env.example` to `.env` in the `backend` folder, and `.env.local` in the `frontend` folder to configure your local environment securely.