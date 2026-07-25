import pytest
from app.services.whatsapp_service import WhatsAppService
from app.models.customer import Customer
from app.models.conversation import Conversation
from app.models.message import Message
from app.db.database import db

def test_process_incoming_new_customer(app, mocker):
    """
    Test that an incoming message from a new phone number creates a Customer,
    an open Conversation, and an inbound Message.
    """
    with app.app_context():
        # Ensure db is clean
        Message.query.delete()
        Conversation.query.delete()
        Customer.query.delete()
        db.session.commit()

        WhatsAppService.process_incoming_message(
            phone="16505551111",
            name="John Doe",
            text="Hello!"
        )

        customer = Customer.query.first()
        assert customer is not None
        assert customer.real_phone_number_encrypted != "16505551111" # Should be encrypted
        assert customer.phone_hash is not None # Should be hashed
        assert len(customer.phone_hash) == 64
        assert customer.whatsapp_name == "John Doe"

        conversation = Conversation.query.first()
        assert conversation is not None
        assert conversation.customer_id == customer.id
        assert conversation.status == "OPEN"

        message = Message.query.first()
        assert message is not None
        assert message.conversation_id == conversation.id
        assert message.direction == "INBOUND"
        assert message.text_body == "Hello!"

def test_process_incoming_returning_customer(app, mocker):
    """
    Test that a message from an existing customer reuses the Customer record
    and logs a new Message.
    """
    with app.app_context():
        # Cleanup
        Message.query.delete()
        Conversation.query.delete()
        Customer.query.delete()
        db.session.commit()

        # First message
        WhatsAppService.process_incoming_message(phone="1234", name="Alice", text="First")
        
        # Second message
        WhatsAppService.process_incoming_message(phone="1234", name="Alice", text="Second")

        customers = Customer.query.all()
        assert len(customers) == 1 # No duplicate customer

        messages = Message.query.all()
        assert len(messages) == 2
        assert messages[1].text_body == "Second"

def test_send_message_success(app, mocker, monkeypatch):
    """
    Test that sending a message fires the correct HTTP POST request to Meta
    and saves the outbound message to the database.
    """
    monkeypatch.setattr("app.services.whatsapp_service.WHATSAPP_ACCESS_TOKEN", "fake_token")
    monkeypatch.setattr("app.services.whatsapp_service.WHATSAPP_PHONE_NUMBER_ID", "12345")
    
    # Mock requests.post
    mock_post = mocker.patch("requests.post")
    mock_post.return_value.status_code = 200
    mock_post.return_value.json.return_value = {"messages": [{"id": "wamid.success"}]}

    with app.app_context():
        from app.core.security import encrypt_phone, hash_phone
        # Setup a customer to reply to
        Customer.query.delete()
        db.session.commit()
        customer = Customer(
            phone_hash=hash_phone("1234567890"),
            real_phone_number_encrypted=encrypt_phone("1234567890"), 
            masked_id="L-1"
        )
        db.session.add(customer)
        db.session.flush()
        conversation = Conversation(customer_id=customer.id)
        db.session.add(conversation)
        db.session.commit()
        conversation_id = conversation.id

        # Send
        success, error = WhatsAppService.send_message(
            conversation_id=conversation.id,
            text="Reply from agent",
            sender_id="agent-1"
        )

        assert success is True
        assert error is None

        # Verify the HTTP call
        mock_post.assert_called_once()
        args, kwargs = mock_post.call_args
        assert "12345/messages" in args[0] # The URL
        assert kwargs["headers"]["Authorization"] == "Bearer fake_token"
        assert kwargs["json"]["to"] == "1234567890"
        assert kwargs["json"]["text"]["body"] == "Reply from agent"

        # Verify DB
        outbound = Message.query.filter_by(direction="OUTBOUND").first()
        assert outbound is not None
        assert outbound.text_body == "Reply from agent"
        assert outbound.delivery_status == "SENT"
        assert outbound.sender_id == "agent-1"

        # Verify the conversation's inbox preview reflects the agent's reply
        db.session.refresh(conversation)
        assert conversation.last_message_preview == "Reply from agent"
        assert conversation.last_message_at is not None

def test_send_message_broadcasts_over_websocket(app, mocker, monkeypatch):
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

    with app.app_context():
        from app.core.security import encrypt_phone, hash_phone
        Customer.query.delete()
        db.session.commit()
        customer = Customer(
            phone_hash=hash_phone("1231231234"),
            real_phone_number_encrypted=encrypt_phone("1231231234"),
            masked_id="L-broadcast"
        )
        db.session.add(customer)
        db.session.flush()
        conversation = Conversation(customer_id=customer.id)
        db.session.add(conversation)
        db.session.commit()

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

def test_send_message_failure(app, mocker, monkeypatch):
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

    with app.app_context():
        from app.core.security import encrypt_phone, hash_phone
        # Setup dummy
        Customer.query.delete()
        db.session.commit()
        c = Customer(
            phone_hash=hash_phone("999"),
            real_phone_number_encrypted=encrypt_phone("999"), 
            masked_id="L-9"
        )
        db.session.add(c)
        db.session.flush()
        
        conv = Conversation(customer_id=c.id)
        db.session.add(conv)
        db.session.commit()
        
        success, error = WhatsAppService.send_message(
            conversation_id=conv.id,
            text="Will fail"
        )
        
        assert success is False
        assert "400" in error

def test_process_incoming_pending_to_open_transition(app, mocker):
    """
    Test that if a conversation is PENDING, receiving a customer message transitions it to OPEN.
    """
    with app.app_context():
        from app.core.security import encrypt_phone, hash_phone
        Customer.query.delete()
        Conversation.query.delete()
        db.session.commit()
        
        c = Customer(
            phone_hash=hash_phone("111"),
            real_phone_number_encrypted=encrypt_phone("111"), 
            masked_id="L-11"
        )
        db.session.add(c)
        db.session.flush()
        
        conv = Conversation(customer_id=c.id, status="PENDING")
        db.session.add(conv)
        db.session.commit()
        
        WhatsAppService.process_incoming_message(phone="111", name="Tester", text="Reply")
        
        # Verify it transitioned
        db.session.refresh(conv)
        assert conv.status == "OPEN"
        # Should not create a new conversation
        assert Conversation.query.count() == 1

def test_process_incoming_message_is_idempotent_on_meta_message_id(app, mocker):
    """
    Test that redelivering the same Meta message id (as happens on Meta's automatic
    webhook retries) does not create a duplicate Message row.
    """
    with app.app_context():
        Message.query.delete()
        Conversation.query.delete()
        Customer.query.delete()
        db.session.commit()

        WhatsAppService.process_incoming_message(
            phone="16505552222", name="Dupe Test", text="Hello", meta_message_id="wamid.dupe"
        )
        WhatsAppService.process_incoming_message(
            phone="16505552222", name="Dupe Test", text="Hello", meta_message_id="wamid.dupe"
        )

        messages = Message.query.filter_by(meta_message_id="wamid.dupe").all()
        assert len(messages) == 1

def test_process_incoming_new_customer_masked_id_does_not_collide_on_last_digits(app, mocker):
    """
    Test that two different phone numbers sharing the same last 4 digits get
    distinct masked_id values.
    """
    with app.app_context():
        Message.query.delete()
        Conversation.query.delete()
        Customer.query.delete()
        db.session.commit()

        WhatsAppService.process_incoming_message(phone="16505551234", name="A", text="hi")
        WhatsAppService.process_incoming_message(phone="19195551234", name="B", text="hi")

        masked_ids = {c.masked_id for c in Customer.query.all()}
        assert len(masked_ids) == 2

def test_process_incoming_message_conversation_race_is_guarded_at_db_level(app, mocker):
    """
    Test that the unique index prevents two OPEN/PENDING conversations from
    existing for the same customer, guarding the race two concurrent webhook
    deliveries could otherwise hit.
    """
    from sqlalchemy.exc import IntegrityError

    with app.app_context():
        Conversation.query.delete()
        Customer.query.delete()
        db.session.commit()

        from app.core.security import encrypt_phone, hash_phone
        customer = Customer(
            phone_hash=hash_phone("16505553333"),
            real_phone_number_encrypted=encrypt_phone("16505553333"), 
            masked_id="Lead-race"
        )
        db.session.add(customer)
        db.session.flush()
        db.session.add(Conversation(customer_id=customer.id, status="OPEN"))
        db.session.commit()

        with pytest.raises(IntegrityError):
            with db.session.begin_nested():
                db.session.add(Conversation(customer_id=customer.id, status="PENDING"))
                db.session.flush()

def test_process_incoming_updates_24h_window(app, mocker):
    """
    Test that receiving a customer message correctly stamps the last_customer_message_at
    and whatsapp_window_expires_at timestamps in the conversation.
    """
    from datetime import datetime, timezone, timedelta
    
    with app.app_context():
        Customer.query.delete()
        Conversation.query.delete()
        db.session.commit()
        
        WhatsAppService.process_incoming_message(phone="222", name="Timer", text="Tick")
        
        conv = Conversation.query.first()
        assert conv.last_customer_message_at is not None
        assert conv.whatsapp_window_expires_at is not None
        
        # Should be roughly 24 hours apart
        diff = conv.whatsapp_window_expires_at - conv.last_customer_message_at
        assert diff == timedelta(hours=24)

def test_process_incoming_message_rejects_empty_phone(app, mocker):
    with app.app_context():
        import pytest
        with pytest.raises(ValueError, match="Phone number is required"):
            WhatsAppService.process_incoming_message(phone="", name="Ghost", text="Boo")
