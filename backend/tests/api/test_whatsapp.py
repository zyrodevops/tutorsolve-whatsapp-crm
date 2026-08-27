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

def test_whatsapp_webhook_receive_text_success(client, mock_db_client):
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

def _status_payload(meta_message_id: str, status: str) -> dict:
    return {
        "object": "whatsapp_business_account",
        "entry": [{
            "id": "123",
            "changes": [{
                "field": "messages",
                "value": {
                    "messaging_product": "whatsapp",
                    "statuses": [{
                        "id": meta_message_id,
                        "status": status,
                        "timestamp": "1603059201",
                        "recipient_id": "16505551234"
                    }]
                }
            }]
        }]
    }

def test_whatsapp_webhook_receive_status_update(client, mock_db_client):
    """
    A status webhook is acknowledged with 200 OK and safely ignored (no crash)
    when it doesn't match any known message.
    """
    response = client.post("/webhook", json=_status_payload("wamid.unknown", "delivered"))
    assert response.status_code == 200
    assert response.get_json()["status"] == "success"

def test_status_update_advances_delivery_status(client, mock_db_client):
    from app.models.message import Message
    from app.models.conversation import Conversation
    from app.models.customer import Customer
    from app.core.security import encrypt_phone, hash_phone

    customer = Customer(phone_hash=hash_phone("111"), real_phone_number_encrypted=encrypt_phone("111"), masked_id="Lead-1")
    mock_db_client.collection("customers").document(customer.id).set(customer.to_dict())
    conv = Conversation(customer_id=customer.id)
    mock_db_client.collection("conversations").document(conv.id).set(conv.to_dict())

    msg = Message(
        conversation_id=conv.id, sender_type="AGENT", message_type="TEXT",
        direction="OUTBOUND", delivery_status="SENT", meta_message_id="wamid.abc"
    )
    mock_db_client.collection("messages").document(msg.id).set(msg.to_dict())

    response = client.post("/webhook", json=_status_payload("wamid.abc", "delivered"))
    assert response.status_code == 200

    updated = mock_db_client.collection("messages").document(msg.id).get().to_dict()
    assert updated["delivery_status"] == "DELIVERED"

def test_status_update_progresses_from_delivered_to_read(client, mock_db_client):
    from app.models.message import Message
    from app.models.conversation import Conversation
    from app.models.customer import Customer
    from app.core.security import encrypt_phone, hash_phone

    customer = Customer(phone_hash=hash_phone("112"), real_phone_number_encrypted=encrypt_phone("112"), masked_id="Lead-2")
    mock_db_client.collection("customers").document(customer.id).set(customer.to_dict())
    conv = Conversation(customer_id=customer.id)
    mock_db_client.collection("conversations").document(conv.id).set(conv.to_dict())

    msg = Message(
        conversation_id=conv.id, sender_type="AGENT", message_type="TEXT",
        direction="OUTBOUND", delivery_status="DELIVERED", meta_message_id="wamid.def"
    )
    mock_db_client.collection("messages").document(msg.id).set(msg.to_dict())

    response = client.post("/webhook", json=_status_payload("wamid.def", "read"))
    assert response.status_code == 200

    updated = mock_db_client.collection("messages").document(msg.id).get().to_dict()
    assert updated["delivery_status"] == "READ"

def test_status_update_does_not_regress_from_read_to_delivered(client, mock_db_client):
    """
    Meta doesn't guarantee status webhooks arrive in order -- a late
    'delivered' event must not overwrite an already-recorded 'read' status.
    """
    from app.models.message import Message
    from app.models.conversation import Conversation
    from app.models.customer import Customer
    from app.core.security import encrypt_phone, hash_phone

    customer = Customer(phone_hash=hash_phone("113"), real_phone_number_encrypted=encrypt_phone("113"), masked_id="Lead-3")
    mock_db_client.collection("customers").document(customer.id).set(customer.to_dict())
    conv = Conversation(customer_id=customer.id)
    mock_db_client.collection("conversations").document(conv.id).set(conv.to_dict())

    msg = Message(
        conversation_id=conv.id, sender_type="AGENT", message_type="TEXT",
        direction="OUTBOUND", delivery_status="READ", meta_message_id="wamid.ghi"
    )
    mock_db_client.collection("messages").document(msg.id).set(msg.to_dict())

    response = client.post("/webhook", json=_status_payload("wamid.ghi", "delivered"))
    assert response.status_code == 200

    updated = mock_db_client.collection("messages").document(msg.id).get().to_dict()
    assert updated["delivery_status"] == "READ"

def test_status_update_failed_always_applies(client, mock_db_client):
    from app.models.message import Message
    from app.models.conversation import Conversation
    from app.models.customer import Customer
    from app.core.security import encrypt_phone, hash_phone

    customer = Customer(phone_hash=hash_phone("114"), real_phone_number_encrypted=encrypt_phone("114"), masked_id="Lead-4")
    mock_db_client.collection("customers").document(customer.id).set(customer.to_dict())
    conv = Conversation(customer_id=customer.id)
    mock_db_client.collection("conversations").document(conv.id).set(conv.to_dict())

    msg = Message(
        conversation_id=conv.id, sender_type="AGENT", message_type="TEXT",
        direction="OUTBOUND", delivery_status="DELIVERED", meta_message_id="wamid.jkl"
    )
    mock_db_client.collection("messages").document(msg.id).set(msg.to_dict())

    response = client.post("/webhook", json=_status_payload("wamid.jkl", "failed"))
    assert response.status_code == 200

    updated = mock_db_client.collection("messages").document(msg.id).get().to_dict()
    assert updated["delivery_status"] == "FAILED"

def test_whatsapp_webhook_receive_supported_image_media(client, mock_db_client):
    """
    Images are supported media (see Week 3 media handling): they should be
    processed and acknowledged as success, not ignored.
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
    assert response.get_json()["status"] == "success"

def test_whatsapp_webhook_receive_unsupported_media(client, mock_db_client):
    """
    Test that a genuinely unsupported message type (e.g. stickers) is
    acknowledged with 200 OK but safely ignored without crashing.
    """
    sticker_payload = {
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
                        "type": "sticker",
                        "sticker": {"id": "sticker123"}
                    }]
                }
            }]
        }]
    }

    response = client.post("/webhook", json=sticker_payload)
    assert response.status_code == 200
    assert response.get_json()["status"] == "ignored"
    assert response.get_json()["reason"] == "unsupported_type_sticker"

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

def test_whatsapp_webhook_receive_stores_meta_message_id(client, app, mock_db_client):
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

    messages = list(mock_db_client.collection("messages").where("meta_message_id", "==", "wamid.unique-1").stream())
    assert len(messages) == 1
    assert messages[0].to_dict()["text_body"] == "Hi"

def test_whatsapp_webhook_receive_missing_profile_name(client, mock_db_client):
    """
    Test that an incoming message from a customer with no public profile name
    is accepted and stored with a default fallback name.
    """
    payload = {
        "object": "whatsapp_business_account",
        "entry": [{
            "id": "123",
            "changes": [{
                "field": "messages",
                "value": {
                    "messaging_product": "whatsapp",
                    "contacts": [{"profile": {}, "wa_id": "16505558888"}],
                    "messages": [{
                        "from": "16505558888",
                        "id": "wamid.no-name-1",
                        "timestamp": "1603059201",
                        "type": "text",
                        "text": {"body": "Hello from anonymous user"}
                    }]
                }
            }]
        }]
    }

    response = client.post("/webhook", json=payload)
    assert response.status_code == 200
    assert response.get_json()["status"] == "success"

def test_whatsapp_webhook_receive_missing_profile_dict(client, mock_db_client):
    """
    Test that an incoming message where the contact object has no profile dict
    is accepted and handled gracefully.
    """
    payload = {
        "object": "whatsapp_business_account",
        "entry": [{
            "id": "123",
            "changes": [{
                "field": "messages",
                "value": {
                    "messaging_product": "whatsapp",
                    "contacts": [{"wa_id": "16505557777"}],
                    "messages": [{
                        "from": "16505557777",
                        "id": "wamid.no-profile-1",
                        "timestamp": "1603059201",
                        "type": "text",
                        "text": {"body": "Hello without profile dict"}
                    }]
                }
            }]
        }]
    }

    response = client.post("/webhook", json=payload)
    assert response.status_code == 200
    assert response.get_json()["status"] == "success"

def test_whatsapp_webhook_receive_missing_contacts_array(client, mock_db_client):
    """
    Test that an incoming message where contacts array is omitted
    falls back to the message 'from' field.
    """
    payload = {
        "object": "whatsapp_business_account",
        "entry": [{
            "id": "123",
            "changes": [{
                "field": "messages",
                "value": {
                    "messaging_product": "whatsapp",
                    "messages": [{
                        "from": "16505556666",
                        "id": "wamid.no-contacts-1",
                        "timestamp": "1603059201",
                        "type": "text",
                        "text": {"body": "Hello without contacts array"}
                    }]
                }
            }]
        }]
    }

    response = client.post("/webhook", json=payload)
    assert response.status_code == 200
    assert response.get_json()["status"] == "success"

