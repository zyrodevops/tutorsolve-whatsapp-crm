# syntax=docker/dockerfile:1
FROM python:3.11-slim AS base

# uv is copied in as a static binary rather than pip-installed, per Astral's
# recommended pattern -- keeps the base image untouched by uv's own deps.
COPY --from=ghcr.io/astral-sh/uv:0.9.9 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install dependencies before copying app code so this layer only rebuilds
# when pyproject.toml/uv.lock change, not on every source edit.
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-install-project --no-dev

COPY . .
RUN uv sync --locked --no-dev

RUN useradd --create-home --uid 1000 appuser \
    && mkdir -p /app/instance \
    && chown -R appuser:appuser /app
USER appuser

ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/health', timeout=3)" || exit 1

# gthread (real OS threads), matching Flask-SocketIO's "threading" async_mode
# set explicitly in app/core/socket_events.py -- WebSocket support comes from
# the simple-websocket package under this mode. Deliberately NOT an
# eventlet/gevent worker: google-cloud-firestore's gRPC client bypasses
# greenlet monkey-patching entirely, which hangs every Firestore call until
# it times out. A single process is intentional -- Socket.IO's connected-client
# state isn't shared across processes without a message queue (e.g. Redis),
# which this app doesn't have configured; multiple threads within that one
# process still provide real request concurrency.
CMD ["gunicorn", "--worker-class", "gthread", "--threads", "8", "-w", "1", "--bind", "0.0.0.0:5000", "--access-logfile", "-", "--error-logfile", "-", "main:app"]
