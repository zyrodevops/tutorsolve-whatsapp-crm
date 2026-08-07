import pytest
from app.services.whatsapp_service import WhatsAppService
from app.core.security import encrypt_phone, hash_phone
from app.models.customer import Customer
from app.models.conversation import Conversation
from app.models.message import Message

def test_process_incoming_new_customer(app, mock_db_client, mocker):
    """
    Test that an incoming message from a new phone number creates a Customer,
    an open Conversation, and an inbound Message.
    """
    WhatsAppService.process_incoming_message(
        phone="16505551111",
        name="John Doe",
        text="Hello!"
    )

    customers = list(mock_db_client.collection("customers").stream())
    assert len(customers) == 1
    customer = customers[0].to_dict()
    assert customer["real_phone_number_encrypted"] != "16505551111"  # Should be encrypted
    assert customer["phone_hash"] is not None  # Should be hashed
    assert len(customer["phone_hash"]) == 64
    assert customer["whatsapp_name"] == "John Doe"

    conversations = list(mock_db_client.collection("conversations").stream())
    assert len(conversations) == 1
    conversation = conversations[0].to_dict()
    assert conversation["customer_id"] == customer["id"]
    assert conversation["status"] == "OPEN"

    messages = list(mock_db_client.collection("messages").stream())
    assert len(messages) == 1
    message = messages[0].to_dict()
    assert message["conversation_id"] == conversation["id"]
    assert message["direction"] == "INBOUND"
    assert message["text_body"] == "Hello!"

def test_process_incoming_returning_customer(app, mock_db_client, mocker):
    """
    Test that a message from an existing customer reuses the Customer record
    and logs a new Message.
    """
    WhatsAppService.process_incoming_message(phone="1234", name="Alice", text="First")
    WhatsAppService.process_incoming_message(phone="1234", name="Alice", text="Second")

    customers = list(mock_db_client.collection("customers").stream())
    assert len(customers) == 1  # No duplicate customer

    messages = list(mock_db_client.collection("messages").stream())
    assert len(messages) == 2
    bodies = {m.to_dict()["text_body"] for m in messages}
    assert bodies == {"First", "Second"}

def test_send_message_success(app, mock_db_client, mocker, monkeypatch):
    """
    Test that sending a message fires the correct HTTP POST request to Meta
    and saves the outbound message to the database.
    """
    monkeypatch.setattr("app.services.whatsapp_service.WHATSAPP_ACCESS_TOKEN", "fake_token")
    monkeypatch.setattr("app.services.whatsapp_service.WHATSAPP_PHONE_NUMBER_ID", "12345")

    mock_post = mocker.patch("requests.post")
    mock_post.return_value.status_code = 200
    mock_post.return_value.json.return_value = {"messages": [{"id": "wamid.success"}]}

    customer = Customer(
        phone_hash=hash_phone("1234567890"),
        real_phone_number_encrypted=encrypt_phone("1234567890"),
        masked_id="L-1"
    )
    mock_db_client.collection("customers").document(customer.id).set(customer.to_dict())

    conversation = Conversation(customer_id=customer.id)
    mock_db_client.collection("conversations").document(conversation.id).set(conversation.to_dict())

    success, error = WhatsAppService.send_message(
        conversation_id=conversation.id,
        text="Reply from agent",
        sender_id="agent-1"
    )

    assert success is True
    assert error is None

    mock_post.assert_called_once()
    args, kwargs = mock_post.call_args
    assert "12345/messages" in args[0]
    assert kwargs["headers"]["Authorization"] == "Bearer fake_token"
    assert kwargs["json"]["to"] == "1234567890"
    assert kwargs["json"]["text"]["body"] == "Reply from agent"

    outbound_docs = list(mock_db_client.collection("messages").where("direction", "==", "OUTBOUND").stream())
    assert len(outbound_docs) == 1
    outbound = outbound_docs[0].to_dict()
    assert outbound["text_body"] == "Reply from agent"
    assert outbound["delivery_status"] == "SENT"
    assert outbound["sender_id"] == "agent-1"

    refreshed_conv = mock_db_client.collection("conversations").document(conversation.id).get().to_dict()
    assert refreshed_conv["last_message_preview"] == "Reply from agent"
    assert refreshed_conv["last_message_at"] is not None

def test_send_message_broadcasts_over_websocket(app, mock_db_client, mocker, monkeypatch):
    """
    Test that a successful outbound send emits a 'new_message' socket event so
    other active agents' views of the conversation update in real time.
    """
    monkeypatch.setattr("app.services.whatsapp_service.WHATSAPP_ACCESS_TOKEN", "fake_token")
    monkeypatch.setattr("app.services.whatsapp_service.WHATSAPP_PHONE_NUMBER_ID", "12345")

    mock_post = mocker.patch("requests.post")
    mock_post.return_value.status_code = 200
    mock_post.return_value.json.return_value = {"messages": [{"id": "wamid.broadcast"}]}

    mock_emit = mocker.patch("app.core.socket_events.socketio.emit")

    customer = Customer(
        phone_hash=hash_phone("1231231234"),
        real_phone_number_encrypted=encrypt_phone("1231231234"),
        masked_id="L-broadcast"
    )
    mock_db_client.collection("customers").document(customer.id).set(customer.to_dict())

    conversation = Conversation(customer_id=customer.id)
    mock_db_client.collection("conversations").document(conversation.id).set(conversation.to_dict())

    success, error = WhatsAppService.send_message(
        conversation_id=conversation.id,
        text="Broadcast me",
        sender_id="agent-2"
    )

    assert success is True
    mock_emit.assert_called_once()
    event_name, payload = mock_emit.call_args[0]
    assert event_name == "new_message"
    assert payload["conversation_id"] == conversation.id
    assert payload["message"]["direction"] == "OUTBOUND"
    assert payload["message"]["sender_type"] == "AGENT"
    assert payload["message"]["text_body"] == "Broadcast me"

def test_send_message_failure(app, mock_db_client, mocker, monkeypatch):
    """
    Test that if Meta rejects the HTTP request, it returns an error and does not
    silently ignore it.
    """
    monkeypatch.setattr("app.services.whatsapp_service.WHATSAPP_ACCESS_TOKEN", "fake_token")
    monkeypatch.setattr("app.services.whatsapp_service.WHATSAPP_PHONE_NUMBER_ID", "12345")

    from requests.exceptions import HTTPError
    from unittest.mock import Mock

    mock_post = mocker.patch("requests.post")
    err_response = Mock()
    err_response.status_code = 400
    mock_post.side_effect = HTTPError("Bad Request", response=err_response)

    c = Customer(
        phone_hash=hash_phone("999"),
        real_phone_number_encrypted=encrypt_phone("999"),
        masked_id="L-9"
    )
    mock_db_client.collection("customers").document(c.id).set(c.to_dict())

    conv = Conversation(customer_id=c.id)
    mock_db_client.collection("conversations").document(conv.id).set(conv.to_dict())

    success, error = WhatsAppService.send_message(
        conversation_id=conv.id,
        text="Will fail"
    )

    assert success is False
    assert "400" in error

def test_process_incoming_pending_to_open_transition(app, mock_db_client, mocker):
    """
    Test that if a conversation is PENDING, receiving a customer message transitions it to OPEN.
    """
    phone_hash_val = hash_phone("111")
    c = Customer(
        id=phone_hash_val,
        phone_hash=phone_hash_val,
        real_phone_number_encrypted=encrypt_phone("111"),
        masked_id="L-11"
    )
    mock_db_client.collection("customers").document(c.id).set(c.to_dict())

    conv = Conversation(customer_id=c.id, status="PENDING")
    mock_db_client.collection("conversations").document(conv.id).set(conv.to_dict())

    WhatsAppService.process_incoming_message(phone="111", name="Tester", text="Reply")

    refreshed = mock_db_client.collection("conversations").document(conv.id).get().to_dict()
    assert refreshed["status"] == "OPEN"
    # Should not create a new conversation
    assert len(list(mock_db_client.collection("conversations").stream())) == 1

def test_process_incoming_message_is_idempotent_on_meta_message_id(app, mock_db_client, mocker):
    """
    Test that redelivering the same Meta message id (as happens on Meta's automatic
    webhook retries) does not create a duplicate Message row.
    """
    WhatsAppService.process_incoming_message(
        phone="16505552222", name="Dupe Test", text="Hello", meta_message_id="wamid.dupe"
    )
    WhatsAppService.process_incoming_message(
        phone="16505552222", name="Dupe Test", text="Hello", meta_message_id="wamid.dupe"
    )

    messages = list(mock_db_client.collection("messages").where("meta_message_id", "==", "wamid.dupe").stream())
    assert len(messages) == 1

def test_process_incoming_new_customer_masked_id_does_not_collide_on_last_digits(app, mock_db_client, mocker):
    """
    Test that two different phone numbers sharing the same last 4 digits get
    distinct masked_id values.
    """
    WhatsAppService.process_incoming_message(phone="16505551234", name="A", text="hi")
    WhatsAppService.process_incoming_message(phone="19195551234", name="B", text="hi")

    masked_ids = {c.to_dict()["masked_id"] for c in mock_db_client.collection("customers").stream()}
    assert len(masked_ids) == 2

def test_process_incoming_new_customer_masked_id_is_not_guessable_from_phone(app, mock_db_client, mocker):
    """
    An agent must not be able to confirm a customer's identity by hashing a
    candidate phone number themselves and matching it against masked_id.
    """
    phone = "16505551234"
    WhatsAppService.process_incoming_message(phone=phone, name="A", text="hi")

    customer = list(mock_db_client.collection("customers").stream())[0].to_dict()
    guessed_masked_id = f"Lead-{hash_phone(phone)[:8]}"
    assert customer["masked_id"] != guessed_masked_id

def test_process_incoming_message_conversation_race_is_guarded(app, mock_db_client, mocker):
    """
    A deterministic phone_hash-based customer id plus a Firestore transaction
    around the get-or-create step (replacing the old unique-index + IntegrityError
    guard) means a customer can never end up with two OPEN/PENDING conversations
    at once: re-processing a message for the same phone reuses the existing one.
    """
    phone_hash_val = hash_phone("16505553333")
    customer = Customer(
        id=phone_hash_val,
        phone_hash=phone_hash_val,
        real_phone_number_encrypted=encrypt_phone("16505553333"),
        masked_id="Lead-race"
    )
    mock_db_client.collection("customers").document(customer.id).set(customer.to_dict())

    existing_conv = Conversation(customer_id=customer.id, status="OPEN")
    mock_db_client.collection("conversations").document(existing_conv.id).set(existing_conv.to_dict())

    WhatsAppService.process_incoming_message(phone="16505553333", name="Racer", text="hi again")

    conversations = list(mock_db_client.collection("conversations").stream())
    assert len(conversations) == 1
    assert conversations[0].id == existing_conv.id

def test_process_incoming_updates_24h_window(app, mock_db_client, mocker):
    """
    Test that receiving a customer message correctly stamps the last_customer_message_at
    and whatsapp_window_expires_at timestamps in the conversation.
    """
    from datetime import timedelta

    WhatsAppService.process_incoming_message(phone="222", name="Timer", text="Tick")

    conv = list(mock_db_client.collection("conversations").stream())[0].to_dict()
    assert conv["last_customer_message_at"] is not None
    assert conv["whatsapp_window_expires_at"] is not None

    # Should be roughly 24 hours apart
    diff = conv["whatsapp_window_expires_at"] - conv["last_customer_message_at"]
    assert diff == timedelta(hours=24)

def test_process_incoming_new_conversation_assigns_agents_round_robin(app, mock_db_client, mocker):
    """
    New unassigned chats must rotate through online agents in turn (spec:
    "assigns incoming, unassigned chats to the next available Online agent"),
    not be handed out randomly -- otherwise load distribution is uneven.
    """
    from app.models.user import User

    agent_ids = ["agent-a", "agent-b", "agent-c"]
    for agent_id in agent_ids:
        agent = User(
            id=agent_id, full_name=agent_id, email=f"{agent_id}@test.com",
            password_hash="x", role="AGENT", system_status="ACTIVE", agent_status="ONLINE"
        )
        mock_db_client.collection("users").document(agent.id).set(agent.to_dict())

    for i in range(4):
        WhatsAppService.process_incoming_message(phone=f"1650555000{i}", name=f"Cust{i}", text="hi")

    conversations = list(mock_db_client.collection("conversations").stream())
    conversations.sort(key=lambda c: c.to_dict()["created_at"])
    assigned_order = [c.to_dict()["assigned_agent_id"] for c in conversations]

    assert assigned_order == ["agent-a", "agent-b", "agent-c", "agent-a"]

def test_process_incoming_message_rejects_empty_phone(app, mock_db_client, mocker):
    with pytest.raises(ValueError, match="Phone number is required"):
        WhatsAppService.process_incoming_message(phone="", name="Ghost", text="Boo")

def test_process_status_update_broadcasts_over_websocket(app, mock_db_client, mocker):
    mock_emit = mocker.patch("app.core.socket_events.socketio.emit")

    customer = Customer(phone_hash=hash_phone("999"), real_phone_number_encrypted=encrypt_phone("999"), masked_id="L-status")
    mock_db_client.collection("customers").document(customer.id).set(customer.to_dict())
    conversation = Conversation(customer_id=customer.id)
    mock_db_client.collection("conversations").document(conversation.id).set(conversation.to_dict())

    msg = Message(
        conversation_id=conversation.id, sender_type="AGENT", message_type="TEXT",
        direction="OUTBOUND", delivery_status="SENT", meta_message_id="wamid.status-test"
    )
    mock_db_client.collection("messages").document(msg.id).set(msg.to_dict())

    WhatsAppService.process_status_update(meta_message_id="wamid.status-test", status="delivered")

    mock_emit.assert_called_once()
    event_name, payload = mock_emit.call_args[0]
    assert event_name == "message_status_updated"
    assert payload == {
        "conversation_id": conversation.id,
        "message_id": msg.id,
        "delivery_status": "DELIVERED"
    }

def test_process_status_update_unknown_meta_message_id_is_a_noop(app, mock_db_client, mocker):
    mock_emit = mocker.patch("app.core.socket_events.socketio.emit")
    WhatsAppService.process_status_update(meta_message_id="wamid.nonexistent", status="delivered")
    mock_emit.assert_not_called()

def test_is_within_business_hours_returns_true_when_unconfigured():
    from app.services.whatsapp_service import _is_within_business_hours
    assert _is_within_business_hours({}) is True

def test_is_within_business_hours_within_window():
    from app.services.whatsapp_service import _is_within_business_hours
    from datetime import datetime, timezone
    settings = {"business_hours_start": "09:00", "business_hours_end": "17:00", "timezone": "UTC"}
    noon_utc = datetime(2026, 1, 5, 12, 0, tzinfo=timezone.utc)  # Monday
    assert _is_within_business_hours(settings, now=noon_utc) is True

def test_is_within_business_hours_outside_window():
    from app.services.whatsapp_service import _is_within_business_hours
    from datetime import datetime, timezone
    settings = {"business_hours_start": "09:00", "business_hours_end": "17:00", "timezone": "UTC"}
    late_night_utc = datetime(2026, 1, 5, 22, 0, tzinfo=timezone.utc)
    assert _is_within_business_hours(settings, now=late_night_utc) is False

def test_is_within_business_hours_converts_timezone():
    from app.services.whatsapp_service import _is_within_business_hours
    from datetime import datetime, timezone
    # 09:00 UTC == 14:30 IST -- within a 09:00-17:00 IST business day, even
    # though the raw UTC hour (9) looks like it could be borderline.
    settings = {"business_hours_start": "09:00", "business_hours_end": "17:00", "timezone": "Asia/Kolkata"}
    utc_time = datetime(2026, 1, 5, 9, 0, tzinfo=timezone.utc)
    assert _is_within_business_hours(settings, now=utc_time) is True

def test_is_within_business_hours_overnight_window():
    from app.services.whatsapp_service import _is_within_business_hours
    from datetime import datetime, timezone
    settings = {"business_hours_start": "22:00", "business_hours_end": "06:00", "timezone": "UTC"}
    assert _is_within_business_hours(settings, now=datetime(2026, 1, 5, 23, 0, tzinfo=timezone.utc)) is True
    assert _is_within_business_hours(settings, now=datetime(2026, 1, 5, 3, 0, tzinfo=timezone.utc)) is True
    assert _is_within_business_hours(settings, now=datetime(2026, 1, 5, 12, 0, tzinfo=timezone.utc)) is False

def test_process_incoming_uses_configured_greeting_message(app, mock_db_client, mocker, monkeypatch):
    monkeypatch.setattr("app.services.whatsapp_service.WHATSAPP_ACCESS_TOKEN", "fake_token")
    monkeypatch.setattr("app.services.whatsapp_service.WHATSAPP_PHONE_NUMBER_ID", "12345")
    mock_post = mocker.patch("requests.post")
    mock_post.return_value.status_code = 200
    mock_post.return_value.json.return_value = {"messages": [{"id": "wamid.greeting"}]}

    mock_db_client.collection("business_settings").document("global_config").set({
        "first_greeting_message": "Welcome to TutorSolve! We'll be right with you."
    })

    WhatsAppService.process_incoming_message(phone="16505550001", name="Greeted", text="hi")

    convs = list(mock_db_client.collection("conversations").stream())
    conv_id = convs[0].id
    msgs = list(mock_db_client.collection("messages").where("conversation_id", "==", conv_id).stream())
    texts = [m.to_dict().get("text_body") for m in msgs]
    assert "Welcome to TutorSolve! We'll be right with you." in texts

def test_process_incoming_sends_out_of_office_when_outside_hours(app, mock_db_client, mocker, monkeypatch):
    monkeypatch.setattr("app.services.whatsapp_service.WHATSAPP_ACCESS_TOKEN", "fake_token")
    monkeypatch.setattr("app.services.whatsapp_service.WHATSAPP_PHONE_NUMBER_ID", "12345")
    mock_post = mocker.patch("requests.post")
    mock_post.return_value.status_code = 200
    mock_post.return_value.json.return_value = {"messages": [{"id": "wamid.ooo"}]}

    mocker.patch("app.services.whatsapp_service._is_within_business_hours", return_value=False)
    mock_db_client.collection("business_settings").document("global_config").set({
        "out_of_office_message": "We're closed -- back at 9am!"
    })

    WhatsAppService.process_incoming_message(phone="16505550002", name="AfterHours", text="hi")

    convs = list(mock_db_client.collection("conversations").stream())
    conv_id = convs[0].id
    msgs = list(mock_db_client.collection("messages").where("conversation_id", "==", conv_id).stream())
    texts = [m.to_dict().get("text_body") for m in msgs]
    assert "We're closed -- back at 9am!" in texts
    assert not any(t and "Welcome" in t for t in texts)

def test_process_incoming_sends_nothing_when_outside_hours_and_no_out_of_office_configured(app, mock_db_client, mocker):
    mocker.patch("app.services.whatsapp_service._is_within_business_hours", return_value=False)

    WhatsAppService.process_incoming_message(phone="16505550003", name="Silent", text="hi")

    convs = list(mock_db_client.collection("conversations").stream())
    conv_id = convs[0].id
    msgs = list(mock_db_client.collection("messages").where("conversation_id", "==", conv_id).stream())
    # Only the original inbound customer message -- no automated reply at all.
    assert len(msgs) == 1
    assert msgs[0].to_dict().get("sender_type") == "CUSTOMER"

def test_process_incoming_round_robin_disabled_leaves_conversation_unassigned(app, mock_db_client, mocker):
    from app.models.user import User

    agent = User(
        id="agent-rr", full_name="RR Agent", email="rr@test.com",
        password_hash="x", role="AGENT", system_status="ACTIVE", agent_status="ONLINE"
    )
    mock_db_client.collection("users").document(agent.id).set(agent.to_dict())
    mock_db_client.collection("business_settings").document("global_config").set({"round_robin_enabled": False})

    WhatsAppService.process_incoming_message(phone="16505550004", name="Manual", text="hi")

    convs = list(mock_db_client.collection("conversations").stream())
    assert convs[0].to_dict().get("assigned_agent_id") is None

def test_process_incoming_round_robin_defaults_enabled_without_settings_doc(app, mock_db_client, mocker):
    from app.models.user import User

    agent = User(
        id="agent-default", full_name="Default Agent", email="default@test.com",
        password_hash="x", role="AGENT", system_status="ACTIVE", agent_status="ONLINE"
    )
    mock_db_client.collection("users").document(agent.id).set(agent.to_dict())

    WhatsAppService.process_incoming_message(phone="16505550005", name="Auto", text="hi")

    convs = list(mock_db_client.collection("conversations").stream())
    assert convs[0].to_dict().get("assigned_agent_id") == "agent-default"

def test_process_status_update_ignores_unrecognized_status_value(app, mock_db_client, mocker):
    mock_emit = mocker.patch("app.core.socket_events.socketio.emit")

    customer = Customer(phone_hash=hash_phone("998"), real_phone_number_encrypted=encrypt_phone("998"), masked_id="L-status2")
    mock_db_client.collection("customers").document(customer.id).set(customer.to_dict())
    conversation = Conversation(customer_id=customer.id)
    mock_db_client.collection("conversations").document(conversation.id).set(conversation.to_dict())

    msg = Message(
        conversation_id=conversation.id, sender_type="AGENT", message_type="TEXT",
        direction="OUTBOUND", delivery_status="SENT", meta_message_id="wamid.weird-status"
    )
    mock_db_client.collection("messages").document(msg.id).set(msg.to_dict())

    WhatsAppService.process_status_update(meta_message_id="wamid.weird-status", status="deleted")

    mock_emit.assert_not_called()
    unchanged = mock_db_client.collection("messages").document(msg.id).get().to_dict()
    assert unchanged["delivery_status"] == "SENT"

def test_build_message_preview_uses_text_when_present():
    from app.services.whatsapp_service import _build_message_preview
    assert _build_message_preview("Hello there", "DOCUMENT") == "Hello there"

def test_build_message_preview_truncates_long_text():
    from app.services.whatsapp_service import _build_message_preview
    long_text = "x" * 100
    assert _build_message_preview(long_text, "TEXT") == long_text[:50]

def test_build_message_preview_falls_back_to_friendly_label_per_type():
    from app.services.whatsapp_service import _build_message_preview
    assert "Document" in _build_message_preview(None, "DOCUMENT")
    assert "Photo" in _build_message_preview("", "IMAGE")
    assert "Video" in _build_message_preview(None, "VIDEO")
    assert "Audio" in _build_message_preview(None, "AUDIO")
    # Never the raw, ugly bracketed type the previous implementation produced.
    assert "[DOCUMENT]" not in _build_message_preview(None, "DOCUMENT")
    assert "[IMAGE]" not in _build_message_preview(None, "IMAGE")

def test_build_message_preview_never_returns_empty_string():
    from app.services.whatsapp_service import _build_message_preview
    assert _build_message_preview("", "TEXT") != ""
    assert _build_message_preview(None, "TEXT") != ""

def test_process_incoming_document_without_caption_gets_friendly_preview(app, mock_db_client, mocker):
    WhatsAppService.process_incoming_message(
        phone="16505559001", name="Doc Sender", text="",
        meta_message_id="wamid.doc1", media_id="1234567890", mime_type="application/pdf", msg_type="document"
    )

    conv = list(mock_db_client.collection("conversations").stream())[0].to_dict()
    assert conv["last_message_preview"] not in ("", "[DOCUMENT]")
    assert "Document" in conv["last_message_preview"]

def test_send_media_message_without_caption_gets_friendly_preview(app, mock_db_client, mocker, monkeypatch):
    monkeypatch.setattr("app.services.whatsapp_service.WHATSAPP_ACCESS_TOKEN", "fake_token")
    monkeypatch.setattr("app.services.whatsapp_service.WHATSAPP_PHONE_NUMBER_ID", "12345")

    upload_response = mocker.Mock(status_code=200)
    upload_response.json.return_value = {"id": "999888777"}
    upload_response.raise_for_status.return_value = None

    send_response = mocker.Mock(status_code=200)
    send_response.json.return_value = {"messages": [{"id": "wamid.media1"}]}
    send_response.raise_for_status.return_value = None

    mocker.patch("requests.post", side_effect=[upload_response, send_response])

    customer = Customer(phone_hash=hash_phone("777"), real_phone_number_encrypted=encrypt_phone("777"), masked_id="L-media")
    mock_db_client.collection("customers").document(customer.id).set(customer.to_dict())
    conversation = Conversation(customer_id=customer.id)
    mock_db_client.collection("conversations").document(conversation.id).set(conversation.to_dict())

    success, error = WhatsAppService.send_media_message(
        conversation_id=conversation.id,
        file_bytes=b"fake-pdf-bytes",
        mime_type="application/pdf",
        filename="report.pdf",
        text="",
        sender_id="agent-1"
    )

    assert success is True, error
    refreshed = mock_db_client.collection("conversations").document(conversation.id).get().to_dict()
    assert refreshed["last_message_preview"] not in ("", "[DOCUMENT]")
    assert "Document" in refreshed["last_message_preview"]
