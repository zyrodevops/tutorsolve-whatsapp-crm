import pytest

def test_whatsapp_webhook_verify_success(client, app, monkeypatch):
    """
    Test that Meta's webhook verification handshake succeeds when the correct
    hub.verify_token is provided.
    """
    # Mock the python variable directly since it's loaded at import time
    monkeypatch.setattr("app.api.whatsapp.WHATSAPP_VERIFY_TOKEN", "test_secret_token_123")
    
    response = client.get(
        "/webhook",
        query_string={
            "hub.mode": "subscribe",
            "hub.verify_token": "test_secret_token_123",
            "hub.challenge": "1158201444"
        }
    )
    
    assert response.status_code == 200
    # Meta requires the exact challenge string returned as raw text, NOT json
    assert response.data.decode("utf-8") == "1158201444"

def test_whatsapp_webhook_verify_invalid_token(client, app, monkeypatch):
    """
    Test that the server rejects the handshake with a 403 Forbidden if the
    verify token does not match.
    """
    monkeypatch.setattr("app.api.whatsapp.WHATSAPP_VERIFY_TOKEN", "test_secret_token_123")
    
    response = client.get(
        "/webhook",
        query_string={
            "hub.mode": "subscribe",
            "hub.verify_token": "wrong_token",
            "hub.challenge": "1158201444"
        }
    )
    
    assert response.status_code == 403

def test_whatsapp_webhook_verify_missing_params(client):
    """
    Test that the server returns a 400 Bad Request if Meta fails to send
    all required handshake parameters.
    """
    response = client.get("/webhook")
    assert response.status_code == 400

# --- PHASE 2: WEBHOOK POST (RECEIVER) TESTS ---

def test_whatsapp_webhook_receive_text_success(client):
    """
    Test that a valid incoming text message is parsed correctly and acknowledged.
    """
    valid_payload = {
        "object": "whatsapp_business_account",
        "entry": [{
            "id": "123",
            "changes": [{
                "field": "messages",
                "value": {
                    "messaging_product": "whatsapp",
                    "contacts": [{"profile": {"name": "Test User"}, "wa_id": "16505551234"}],
                    "messages": [{
                        "from": "16505551234",
                        "id": "wamid.123",
                        "timestamp": "1603059201",
                        "type": "text",
                        "text": {"body": "Hello!"}
                    }]
                }
            }]
        }]
    }
    
    response = client.post("/webhook", json=valid_payload)
    assert response.status_code == 200
    assert response.get_json()["status"] == "success"

def test_whatsapp_webhook_receive_status_update(client):
    """
    Test that status updates (read receipts, delivery) are acknowledged with 200 OK 
    but safely ignored without crashing.
    """
    status_payload = {
        "object": "whatsapp_business_account",
        "entry": [{
            "id": "123",
            "changes": [{
                "field": "messages",
                "value": {
                    "messaging_product": "whatsapp",
                    "statuses": [{
                        "id": "wamid.123",
                        "status": "delivered",
                        "timestamp": "1603059201",
                        "recipient_id": "16505551234"
                    }]
                }
            }]
        }]
    }
    
    response = client.post("/webhook", json=status_payload)
    assert response.status_code == 200
    assert response.get_json()["status"] == "ignored"
    assert response.get_json()["reason"] == "status_update"

def test_whatsapp_webhook_receive_unsupported_media(client):
    """
    Test that unsupported media (images, audio) is acknowledged with 200 OK
    but safely ignored without crashing.
    """
    image_payload = {
        "object": "whatsapp_business_account",
        "entry": [{
            "id": "123",
            "changes": [{
                "field": "messages",
                "value": {
                    "messaging_product": "whatsapp",
                    "contacts": [{"profile": {"name": "Test User"}, "wa_id": "16505551234"}],
                    "messages": [{
                        "from": "16505551234",
                        "id": "wamid.123",
                        "timestamp": "1603059201",
                        "type": "image",
                        "image": {"id": "img123"}
                    }]
                }
            }]
        }]
    }
    
    response = client.post("/webhook", json=image_payload)
    assert response.status_code == 200
    assert response.get_json()["status"] == "ignored"
    assert response.get_json()["reason"] == "unsupported_type"

def test_whatsapp_webhook_malformed_payload(client):
    """
    Test that completely invalid JSON structures are caught by the schema validation
    and rejected with a 400 Bad Request to prevent silent failures.
    """
    invalid_payload = {
        "not_an_object": "bad_data",
        "entry": []
    }
    
    response = client.post("/webhook", json=invalid_payload)
    assert response.status_code == 400
    assert response.get_json()["status"] == "error"
    assert response.get_json()["message"]
    assert "object" in response.get_json()["errors"]

def test_whatsapp_webhook_receive_stores_meta_message_id(client, app):
    """
    Test that the inbound message row is saved with the Meta-provided message id,
    which is what makes duplicate webhook retries detectable.
    """
    payload = {
        "object": "whatsapp_business_account",
        "entry": [{
            "id": "123",
            "changes": [{
                "field": "messages",
                "value": {
                    "messaging_product": "whatsapp",
                    "contacts": [{"profile": {"name": "Test User"}, "wa_id": "16505559999"}],
                    "messages": [{
                        "from": "16505559999",
                        "id": "wamid.unique-1",
                        "timestamp": "1603059201",
                        "type": "text",
                        "text": {"body": "Hi"}
                    }]
                }
            }]
        }]
    }

    response = client.post("/webhook", json=payload)
    assert response.status_code == 200

    with app.app_context():
        from app.models.message import Message
        message = Message.query.filter_by(meta_message_id="wamid.unique-1").first()
        assert message is not None
        assert message.text_body == "Hi"
