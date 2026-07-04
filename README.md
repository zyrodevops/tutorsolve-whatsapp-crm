# Tutorsolve WhatsApp CRM Dashboard

This project contains a custom WhatsApp CRM dashboard with a FastAPI backend and a plain HTML/CSS/JS frontend.

## How to Run the Project

### 1. Running the FastAPI Backend
The backend runs using an ASGI server (Uvicorn). To start it:

```bash
cd backend
pip install -r requirements.txt  # (Once dependencies are added)
uvicorn main:app --reload
```
*(Alternatively, if `main.py` is configured with an entry point, run `python main.py`)*

The backend server will start at `http://localhost:8000`.

### 2. Running the HTML/CSS/JS Frontend
Since the frontend uses vanilla web technologies without a build step, you only need a static file server.

**Python Built-in Server**
```bash
cd frontend
python -m http.server 3000
```
This will serve the frontend at `http://localhost:3000`.

### Architecture
- The frontend javascript (e.g. `api.js` and `websocket.js`) communicates directly with the FastAPI endpoints hosted on `http://localhost:8000`.