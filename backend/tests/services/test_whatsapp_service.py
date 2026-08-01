import pytest
from app.services.whatsapp_service import WhatsAppService
from app.core.security import encrypt_phone, hash_phone
from app.models.customer import Customer
from app.models.conversation import Conversation

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
