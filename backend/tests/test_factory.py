import logging
import pytest
from app import create_app

def test_config():
    # Test that the app can be created with testing config
    assert not create_app({}).testing
    assert create_app({"TESTING": True}).testing

def test_hello(client):
    # Test a simple healthcheck endpoint to ensure routing works
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json == {"status": "healthy"}

def test_warns_when_secret_key_is_unset(monkeypatch, caplog):
    """
    SECRET_KEY signs every JWT. If it's left unset, create_app() silently
    falls back to a publicly-committed dev string, which lets anyone forge
    an ADMIN token. This must warn loudly, just like the ENCRYPTION_KEY check.
    """
    monkeypatch.delenv("SECRET_KEY", raising=False)

    with caplog.at_level(logging.WARNING):
        create_app({"TESTING": True})

    assert any("SECRET_KEY" in record.message for record in caplog.records)
