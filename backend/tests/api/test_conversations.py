import pytest
from app.models.customer import Customer
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.user import User
from app.db.database import db
from app.core.security import encrypt_phone, hash_phone, hash_password

def test_get_conversations_requires_auth(client):
    response = client.get('/api/conversations')
    assert response.status_code == 401

def test_get_conversations_returns_masked_data(client, app):
    with app.app_context():
        # Setup dummy data
        Customer.query.delete()
        Conversation.query.delete()
        db.session.commit()

        c = Customer(
            phone_hash=hash_phone("1112223333"),
            real_phone_number_encrypted=encrypt_phone("1112223333"),
            masked_id="Lead-5A8F",
            whatsapp_name="John"
        )
        db.session.add(c)
        db.session.flush()

        conv = Conversation(customer_id=c.id, status="OPEN", unread_count=2, last_message_preview="Hello!")
        db.session.add(conv)
        db.session.commit()
        User.query.delete()
        admin = User(email="admin@example.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
        db.session.add(admin)
        db.session.commit()

    # Get auth cookie implicitly
    client.post('/api/auth/login', json={
        "email": "admin@example.com",
        "password": "password"
    })

    # Fetch conversations
    response = client.get('/api/conversations')
    assert response.status_code == 200
    body = response.json
    assert body['status'] == 'success'
    data = body['data']

    assert len(data) == 1
    assert data[0]['masked_id'] == "Lead-5A8F"
    assert data[0]['whatsapp_name'] == "John"
    assert data[0]['unread_count'] == 2
    assert data[0]['last_message_preview'] == "Hello!"
    # CRITICAL: Ensure real phone numbers are NOT returned
    assert 'real_phone_number_encrypted' not in data[0]
    assert 'phone_hash' not in data[0]
    assert '1112223333' not in str(data[0])

def test_manager_can_view_conversations(client, app):
    with app.app_context():
        Customer.query.delete()
        Conversation.query.delete()
        User.query.delete()
        db.session.commit()

        manager = User(email="manager@example.com", full_name="Manager", password_hash=hash_password("password"), role="MANAGER")
        db.session.add(manager)
        db.session.commit()

    client.post('/api/auth/login', json={"email": "manager@example.com", "password": "password"})
    response = client.get('/api/conversations')
    assert response.status_code == 200
    assert response.json['status'] == 'success'

def test_get_messages_for_conversation(client, app):
    with app.app_context():
        Customer.query.delete()
        Conversation.query.delete()
        Message.query.delete()
        db.session.commit()

        c = Customer(
            phone_hash=hash_phone("4445556666"),
            real_phone_number_encrypted=encrypt_phone("4445556666"),
            masked_id="Lead-Msg"
        )
        db.session.add(c)
        db.session.flush()

        conv = Conversation(customer_id=c.id)
        db.session.add(conv)
        db.session.flush()

        m1 = Message(conversation_id=conv.id, direction="INBOUND", text_body="Hi", sender_type="CUSTOMER", message_type="TEXT", delivery_status="DELIVERED")
        m2 = Message(conversation_id=conv.id, direction="OUTBOUND", text_body="Hello", sender_type="AGENT", message_type="TEXT", delivery_status="SENT")
        db.session.add(m1)
        db.session.add(m2)
        db.session.commit()

        conv_id = conv.id
        User.query.delete()
        admin = User(email="admin@example.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
        db.session.add(admin)
        db.session.commit()

    # Get auth cookie implicitly
    client.post('/api/auth/login', json={
        "email": "admin@example.com",
        "password": "password"
    })


    # Fetch messages
    response = client.get(f'/api/conversations/{conv_id}/messages')
    assert response.status_code == 200
    body = response.json
    assert body['status'] == 'success'
    data = body['data']

    assert len(data) == 2
    assert data[0]['direction'] == "INBOUND"
    assert data[1]['direction'] == "OUTBOUND"

def test_get_messages_resets_unread_count(client, app):
    with app.app_context():
        Customer.query.delete()
        Conversation.query.delete()
        Message.query.delete()
        db.session.commit()

        c = Customer(
            phone_hash=hash_phone("7778889999"),
            real_phone_number_encrypted=encrypt_phone("7778889999"),
            masked_id="Lead-Unread"
        )
        db.session.add(c)
        db.session.flush()

        conv = Conversation(customer_id=c.id, unread_count=3)
        db.session.add(conv)
        db.session.commit()
        conv_id = conv.id

        User.query.delete()
        admin = User(email="admin@example.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
        db.session.add(admin)
        db.session.commit()

    client.post('/api/auth/login', json={"email": "admin@example.com", "password": "password"})
    response = client.get(f'/api/conversations/{conv_id}/messages')
    assert response.status_code == 200

    with app.app_context():
        refreshed = db.session.get(Conversation, conv_id)
        assert refreshed.unread_count == 0

def test_send_message_to_conversation_success(client, app, mocker):
    class MockResponse:
        def __init__(self, json_data, status_code):
            self.json_data = json_data
            self.status_code = status_code
        def json(self):
            return self.json_data
        def raise_for_status(self):
            pass
    mocker.patch('requests.post', return_value=MockResponse({"messages": [{"id": "wamid_123"}]}, 200))

    with app.app_context():
        # Clean up
        db.session.execute(db.delete(Message))
        db.session.execute(db.delete(Conversation))
        db.session.execute(db.delete(Customer))
        db.session.execute(db.delete(User))

        # Setup data
        admin = User(id="usr_admin", email="admin@test.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
        customer = Customer(id="cust_1", phone_hash="hash1", real_phone_number_encrypted=encrypt_phone("1234567890"), masked_id="Lead-1234")
        db.session.add_all([admin, customer])
        db.session.flush()

        conv = Conversation(id="conv_1", customer_id=customer.id, status="OPEN")
        db.session.add(conv)
        db.session.commit()

    client.post('/api/auth/login', json={"email": "admin@test.com", "password": "password"})
    response = client.post('/api/conversations/conv_1/messages', json={"text": "Hello customer"})

    assert response.status_code == 200
    body = response.get_json()
    assert body['status'] == 'success'
    data = body['data']
    assert data["text_body"] == "Hello customer"
    assert data["direction"] == "OUTBOUND"
    assert data["sender_type"] == "AGENT"

    with app.app_context():
        saved = db.session.execute(
            db.select(Message).filter_by(conversation_id="conv_1", direction="OUTBOUND")
        ).scalar_one()
        assert saved.sender_id == "usr_admin"

def test_send_message_fails_gracefully(client, app, mocker):
    import requests
    class MockFailedResponse:
        status_code = 500
    mock_err = requests.exceptions.HTTPError()
    mock_err.response = MockFailedResponse()
    mocker.patch('requests.post', side_effect=mock_err)

    with app.app_context():
        # Clean up
        db.session.execute(db.delete(Message))
        db.session.execute(db.delete(Conversation))
        db.session.execute(db.delete(Customer))
        db.session.execute(db.delete(User))

        # Setup data
        admin = User(id="usr_admin2", email="admin@test.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
        customer = Customer(id="cust_2", phone_hash="hash2", real_phone_number_encrypted=encrypt_phone("12345"), masked_id="Lead-5678")
        db.session.add_all([admin, customer])
        db.session.flush()

        conv = Conversation(id="conv_2", customer_id=customer.id, status="OPEN")
        db.session.add(conv)
        db.session.commit()

    client.post('/api/auth/login', json={"email": "admin@test.com", "password": "password"})
    response = client.post('/api/conversations/conv_2/messages', json={"text": "Fail test"})

    assert response.status_code == 400
    body = response.get_json()
    assert body['status'] == 'error'
    assert body["message"] == "HTTP 500: "

def test_send_message_invalid_conversation(client, app):
    with app.app_context():
        User.query.delete()
        admin = User(email="admin@test.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
        db.session.add(admin)
        db.session.commit()

    client.post('/api/auth/login', json={"email": "admin@test.com", "password": "password"})
    response = client.post('/api/conversations/invalid_id/messages', json={"text": "Fail test"})

    assert response.status_code == 404

def test_get_messages_nonexistent_conversation_returns_404(client, app):
    with app.app_context():
        User.query.delete()
        admin = User(email="admin@example.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
        db.session.add(admin)
        db.session.commit()

    client.post('/api/auth/login', json={"email": "admin@example.com", "password": "password"})

    response = client.get('/api/conversations/invalid-id/messages')
    assert response.status_code == 404

def test_get_messages_empty_history_returns_empty_list(client, app):
    with app.app_context():
        Customer.query.delete()
        Conversation.query.delete()
        Message.query.delete()
        db.session.commit()

        c = Customer(phone_hash=hash_phone("empty"), real_phone_number_encrypted=encrypt_phone("empty"), masked_id="Lead-Empty")
        db.session.add(c)
        db.session.flush()

        conv = Conversation(customer_id=c.id)
        db.session.add(conv)
        db.session.commit()
        conv_id = conv.id

        User.query.delete()
        admin = User(email="admin@example.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
        db.session.add(admin)
        db.session.commit()

    client.post('/api/auth/login', json={"email": "admin@example.com", "password": "password"})
    response = client.get(f'/api/conversations/{conv_id}/messages')
    assert response.status_code == 200
    assert response.json == {"status": "success", "data": []}

def test_api_rejects_unauthorized_roles(client, app):
    with app.app_context():
        User.query.delete()
        unauth = User(email="unauth@example.com", full_name="Unauth", password_hash=hash_password("password"), role="SYSTEM")
        db.session.add(unauth)
        db.session.commit()

    client.post('/api/auth/login', json={"email": "unauth@example.com", "password": "password"})
    response = client.get('/api/conversations')
    assert response.status_code == 403
