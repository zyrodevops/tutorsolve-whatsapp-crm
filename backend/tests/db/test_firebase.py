import pytest
from flask import Flask
from app.db.firebase import FirebaseDB

def test_init_app_does_not_raise_when_unconfigured(monkeypatch):
    """
    Local dev/test with no FIREBASE_SERVICE_ACCOUNT_B64 set is expected and
    must not crash the app -- it just means Firestore isn't wired up yet.
    """
    monkeypatch.delenv("FIREBASE_SERVICE_ACCOUNT_B64", raising=False)
    app = Flask(__name__)
    db = FirebaseDB()

    db.init_app(app)  # must not raise

def test_init_app_fails_fast_on_invalid_credentials(monkeypatch):
    """
    A FIREBASE_SERVICE_ACCOUNT_B64 that's set but malformed is a real
    misconfiguration, not an expected dev-mode state. It must fail loudly at
    startup (CODING_STANDARDS.md's Fail Fast rule) instead of leaving
    db.client as None, which would otherwise surface as an opaque
    'NoneType has no attribute collection' deep inside a request handler.
    """
    monkeypatch.setenv("FIREBASE_SERVICE_ACCOUNT_B64", "not-valid-base64-or-json")
    app = Flask(__name__)
    db = FirebaseDB()

    with pytest.raises(Exception):
        db.init_app(app)
