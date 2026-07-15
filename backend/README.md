# Backend - WhatsApp CRM API

This is the backend API for the Tutorsolve WhatsApp CRM. It is built using **Flask** following the Application Factory pattern and utilizes **SQLAlchemy** for ORM management.

## 🛠 Prerequisites
- Python 3.11+
- `uv` (Fast Python package installer)

## ⚙️ Setup & Installation

1. **Install Dependencies:**
   ```bash
   uv sync
   ```

2. **Environment Configuration:**
   Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
   Update `.env` with your secure credentials.

3. **Database Initialization & Seeding:**
   To automatically create the SQLite database and seed your first System Admin account (`admin@crm.com` / `adminpassword`):
   ```bash
   uv run python seed_admin.py
   ```

4. **Run the Server:**
   ```bash
   FLASK_APP=app FLASK_ENV=development uv run flask run --port=5000
   ```

## 🧪 Running Tests
This project rigorously follows Test-Driven Development (TDD). We use `pytest` for all unit and integration testing.

```bash
uv run python -m pytest
```
Use `python -m pytest`, not a bare `uv run pytest` — the latter fails with `ModuleNotFoundError: No module named 'app'` since there's no src-layout/path config, and only `python -m` puts the cwd on `sys.path`.

## 📁 Architecture
- `app/api/`: Flask Blueprints defining the REST endpoints.
- `app/core/`: Security logic (JWT token generation, Password Hashing, Middlewares).
- `app/models/`: SQLAlchemy Database schemas.
- `app/schemas/`: Marshmallow validation schemas for incoming request payloads.
- `app/services/`: Isolated business logic layers (e.g. `user_service`, `auth_service`, `whatsapp_service`).
- `app/websockets/`: Flask-SocketIO connection handling for real-time inbox updates.