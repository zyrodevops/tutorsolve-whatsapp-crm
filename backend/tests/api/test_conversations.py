import pytest
from app.models.customer import Customer
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.user import User
from app.core.security import encrypt_phone, hash_phone, hash_password

def test_get_conversations_requires_auth(client):
    response = client.get('/api/conversations')
    assert response.status_code == 401

def test_get_conversations_returns_masked_data(client, mock_db_client):
    c = Customer(
        phone_hash=hash_phone("1112223333"),
        real_phone_number_encrypted=encrypt_phone("1112223333"),
        masked_id="Lead-5A8F",
        whatsapp_name="John"
    )
    mock_db_client.collection("customers").document(c.id).set(c.to_dict())

    conv = Conversation(customer_id=c.id, status="OPEN", unread_count=2, last_message_preview="Hello!")
    mock_db_client.collection("conversations").document(conv.id).set(conv.to_dict())

    admin = User(email="admin@example.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
    mock_db_client.collection("users").document(admin.id).set(admin.to_dict())

    client.post('/api/auth/login', json={
        "email": "admin@example.com",
        "password": "password"
    })

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

def test_get_conversations_returns_null_not_string_none_for_missing_last_message_at(client, mock_db_client):
    """
    Firestore is schemaless -- a conversation document can be missing
    last_message_at entirely (e.g. legacy/partial data). The API must return
    JSON null for it, not the literal string "None", which would otherwise
    render as "Invalid Date" in the inbox.
    """
    c = Customer(
        phone_hash=hash_phone("7778889999"),
        real_phone_number_encrypted=encrypt_phone("7778889999"),
        masked_id="Lead-NULL",
        whatsapp_name="No Messages Yet"
    )
    mock_db_client.collection("customers").document(c.id).set(c.to_dict())

    # Bypass the Conversation dataclass (whose default backfills a datetime)
    # to simulate a document that genuinely has no last_message_at.
    mock_db_client.collection("conversations").document("conv_no_msgs").set({
        "id": "conv_no_msgs",
        "customer_id": c.id,
        "status": "OPEN",
        "unread_count": 0,
        "last_message_preview": None,
        "last_message_at": None,
        "whatsapp_window_expires_at": None,
        "tags": [],
        "assigned_agent_id": None,
    })

    admin = User(email="nullcheck@example.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
    mock_db_client.collection("users").document(admin.id).set(admin.to_dict())
    client.post('/api/auth/login', json={"email": "nullcheck@example.com", "password": "password"})

    response = client.get('/api/conversations')
    assert response.status_code == 200
    data = response.json['data']

    assert len(data) == 1
    assert data[0]['last_message_at'] is None

def test_get_conversations_resolves_assigned_agent_name(client, mock_db_client):
    c = Customer(
        phone_hash=hash_phone("2223334444"),
        real_phone_number_encrypted=encrypt_phone("2223334444"),
        masked_id="Lead-ASSIGN"
    )
    mock_db_client.collection("customers").document(c.id).set(c.to_dict())

    agent = User(email="jane@example.com", full_name="Jane Doe", password_hash=hash_password("password"), role="AGENT")
    mock_db_client.collection("users").document(agent.id).set(agent.to_dict())

    conv = Conversation(customer_id=c.id, assigned_agent_id=agent.id)
    mock_db_client.collection("conversations").document(conv.id).set(conv.to_dict())

    admin = User(email="admin2@example.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
    mock_db_client.collection("users").document(admin.id).set(admin.to_dict())
    client.post('/api/auth/login', json={"email": "admin2@example.com", "password": "password"})

    response = client.get('/api/conversations')
    assert response.status_code == 200
    data = response.json['data']

    assert len(data) == 1
    assert data[0]['assigned_agent_id'] == agent.id
    assert data[0]['assigned_agent_name'] == "Jane Doe"

def test_get_conversations_assigned_agent_name_null_when_unassigned(client, mock_db_client):
    c = Customer(
        phone_hash=hash_phone("3334445555"),
        real_phone_number_encrypted=encrypt_phone("3334445555"),
        masked_id="Lead-UNASSIGNED"
    )
    mock_db_client.collection("customers").document(c.id).set(c.to_dict())

    conv = Conversation(customer_id=c.id, assigned_agent_id=None)
    mock_db_client.collection("conversations").document(conv.id).set(conv.to_dict())

    admin = User(email="admin3@example.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
    mock_db_client.collection("users").document(admin.id).set(admin.to_dict())
    client.post('/api/auth/login', json={"email": "admin3@example.com", "password": "password"})

    response = client.get('/api/conversations')
    data = response.json['data']

    assert data[0]['assigned_agent_name'] is None

def test_get_conversations_assigned_agent_name_null_when_agent_missing(client, mock_db_client):
    """
    assigned_agent_id can reference a user doc that no longer resolves (e.g.
    data inconsistency) -- this must degrade gracefully, not 500.
    """
    c = Customer(
        phone_hash=hash_phone("4445556666"),
        real_phone_number_encrypted=encrypt_phone("4445556666"),
        masked_id="Lead-GHOST"
    )
    mock_db_client.collection("customers").document(c.id).set(c.to_dict())

    conv = Conversation(customer_id=c.id, assigned_agent_id="nonexistent-agent-id")
    mock_db_client.collection("conversations").document(conv.id).set(conv.to_dict())

    admin = User(email="admin4@example.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
    mock_db_client.collection("users").document(admin.id).set(admin.to_dict())
    client.post('/api/auth/login', json={"email": "admin4@example.com", "password": "password"})

    response = client.get('/api/conversations')
    assert response.status_code == 200
    data = response.json['data']

    assert data[0]['assigned_agent_name'] is None

def test_get_conversations_resolves_same_agent_across_multiple_conversations(client, mock_db_client):
    """
    Round robin means the same agent ends up assigned to many conversations
    in a row -- the name must resolve correctly for every one of them, not
    just the first (a per-request cache keyed wrong would blank out repeats).
    """
    c1 = Customer(phone_hash=hash_phone("5556667777"), real_phone_number_encrypted=encrypt_phone("5556667777"), masked_id="Lead-A")
    c2 = Customer(phone_hash=hash_phone("6667778888"), real_phone_number_encrypted=encrypt_phone("6667778888"), masked_id="Lead-B")
    mock_db_client.collection("customers").document(c1.id).set(c1.to_dict())
    mock_db_client.collection("customers").document(c2.id).set(c2.to_dict())

    agent = User(email="busy@example.com", full_name="Busy Agent", password_hash=hash_password("password"), role="AGENT")
    mock_db_client.collection("users").document(agent.id).set(agent.to_dict())

    conv1 = Conversation(customer_id=c1.id, assigned_agent_id=agent.id)
    conv2 = Conversation(customer_id=c2.id, assigned_agent_id=agent.id)
    mock_db_client.collection("conversations").document(conv1.id).set(conv1.to_dict())
    mock_db_client.collection("conversations").document(conv2.id).set(conv2.to_dict())

    admin = User(email="admin5@example.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
    mock_db_client.collection("users").document(admin.id).set(admin.to_dict())
    client.post('/api/auth/login', json={"email": "admin5@example.com", "password": "password"})

    response = client.get('/api/conversations')
    assert response.status_code == 200
    names = [row['assigned_agent_name'] for row in response.json['data']]
    assert names == ["Busy Agent", "Busy Agent"]

def test_manager_can_view_conversations(client, mock_db_client):
    manager = User(email="manager@example.com", full_name="Manager", password_hash=hash_password("password"), role="MANAGER")
    mock_db_client.collection("users").document(manager.id).set(manager.to_dict())

    client.post('/api/auth/login', json={"email": "manager@example.com", "password": "password"})
    response = client.get('/api/conversations')
    assert response.status_code == 200
    assert response.json['status'] == 'success'

def test_get_messages_for_conversation(client, mock_db_client):
    c = Customer(
        phone_hash=hash_phone("4445556666"),
        real_phone_number_encrypted=encrypt_phone("4445556666"),
        masked_id="Lead-Msg"
    )
    mock_db_client.collection("customers").document(c.id).set(c.to_dict())

    conv = Conversation(customer_id=c.id)
    mock_db_client.collection("conversations").document(conv.id).set(conv.to_dict())

    m1 = Message(conversation_id=conv.id, direction="INBOUND", text_body="Hi", sender_type="CUSTOMER", message_type="TEXT", delivery_status="DELIVERED")
    m2 = Message(conversation_id=conv.id, direction="OUTBOUND", text_body="Hello", sender_type="AGENT", message_type="TEXT", delivery_status="SENT")
    mock_db_client.collection("messages").document(m1.id).set(m1.to_dict())
    mock_db_client.collection("messages").document(m2.id).set(m2.to_dict())

    admin = User(email="admin@example.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
    mock_db_client.collection("users").document(admin.id).set(admin.to_dict())

    client.post('/api/auth/login', json={
        "email": "admin@example.com",
        "password": "password"
    })

    response = client.get(f'/api/conversations/{conv.id}/messages')
    assert response.status_code == 200
    body = response.json
    assert body['status'] == 'success'
    data = body['data']

    assert len(data) == 2
    assert data[0]['direction'] == "INBOUND"
    assert data[1]['direction'] == "OUTBOUND"

def test_get_messages_includes_media_fields_for_documents(client, mock_db_client):
    """
    The live WebSocket 'new_message' event includes media_url/media_mime_type,
    but this history endpoint is what runs on every page load and conversation
    switch -- if it silently drops those fields, a document/image message
    shows its attachment link only until the next refresh, then it vanishes.
    """
    c = Customer(
        phone_hash=hash_phone("7778889999"),
        real_phone_number_encrypted=encrypt_phone("7778889999"),
        masked_id="Lead-Doc"
    )
    mock_db_client.collection("customers").document(c.id).set(c.to_dict())

    conv = Conversation(customer_id=c.id)
    mock_db_client.collection("conversations").document(conv.id).set(conv.to_dict())

    doc_msg = Message(
        conversation_id=conv.id, direction="INBOUND", sender_type="CUSTOMER",
        message_type="DOCUMENT", text_body="Here's the invoice",
        media_url="/api/media/DEMO_MEDIA_ID_001", media_mime_type="application/pdf",
        delivery_status="DELIVERED"
    )
    mock_db_client.collection("messages").document(doc_msg.id).set(doc_msg.to_dict())

    admin = User(email="docadmin@example.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
    mock_db_client.collection("users").document(admin.id).set(admin.to_dict())
    client.post('/api/auth/login', json={"email": "docadmin@example.com", "password": "password"})

    response = client.get(f'/api/conversations/{conv.id}/messages')
    assert response.status_code == 200
    data = response.json['data']

    assert len(data) == 1
    assert data[0]['media_url'] == "/api/media/DEMO_MEDIA_ID_001"
    assert data[0]['media_mime_type'] == "application/pdf"

def test_get_messages_resets_unread_count(client, mock_db_client):
    c = Customer(
        phone_hash=hash_phone("7778889999"),
        real_phone_number_encrypted=encrypt_phone("7778889999"),
        masked_id="Lead-Unread"
    )
    mock_db_client.collection("customers").document(c.id).set(c.to_dict())

    conv = Conversation(customer_id=c.id, unread_count=3)
    mock_db_client.collection("conversations").document(conv.id).set(conv.to_dict())

    admin = User(email="admin@example.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
    mock_db_client.collection("users").document(admin.id).set(admin.to_dict())

    client.post('/api/auth/login', json={"email": "admin@example.com", "password": "password"})
    response = client.get(f'/api/conversations/{conv.id}/messages')
    assert response.status_code == 200

    refreshed = mock_db_client.collection("conversations").document(conv.id).get().to_dict()
    assert refreshed["unread_count"] == 0

def test_send_message_to_conversation_success(client, mock_db_client, mocker):
    class MockResponse:
        def __init__(self, json_data, status_code):
            self.json_data = json_data
            self.status_code = status_code
        def json(self):
            return self.json_data
        def raise_for_status(self):
            pass
    mocker.patch('requests.post', return_value=MockResponse({"messages": [{"id": "wamid_123"}]}, 200))

    admin = User(id="usr_admin", email="admin@test.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
    customer = Customer(id="cust_1", phone_hash="hash1", real_phone_number_encrypted=encrypt_phone("1234567890"), masked_id="Lead-1234")
    mock_db_client.collection("users").document(admin.id).set(admin.to_dict())
    mock_db_client.collection("customers").document(customer.id).set(customer.to_dict())

    conv = Conversation(id="conv_1", customer_id=customer.id, status="OPEN")
    mock_db_client.collection("conversations").document(conv.id).set(conv.to_dict())

    client.post('/api/auth/login', json={"email": "admin@test.com", "password": "password"})
    response = client.post('/api/conversations/conv_1/messages', json={"text": "Hello customer"})

    assert response.status_code == 200
    body = response.get_json()
    assert body['status'] == 'success'
    data = body['data']
    assert data["text_body"] == "Hello customer"
    assert data["direction"] == "OUTBOUND"
    assert data["sender_type"] == "AGENT"

    saved_docs = list(mock_db_client.collection("messages")
                       .where("conversation_id", "==", "conv_1")
                       .where("direction", "==", "OUTBOUND").stream())
    assert len(saved_docs) == 1
    assert saved_docs[0].to_dict()["sender_id"] == "usr_admin"

def test_send_message_fails_gracefully(client, mock_db_client, mocker):
    import requests
    class MockFailedResponse:
        status_code = 500
    mock_err = requests.exceptions.HTTPError()
    mock_err.response = MockFailedResponse()
    mocker.patch('requests.post', side_effect=mock_err)

    admin = User(id="usr_admin2", email="admin@test.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
    customer = Customer(id="cust_2", phone_hash="hash2", real_phone_number_encrypted=encrypt_phone("12345"), masked_id="Lead-5678")
    mock_db_client.collection("users").document(admin.id).set(admin.to_dict())
    mock_db_client.collection("customers").document(customer.id).set(customer.to_dict())

    conv = Conversation(id="conv_2", customer_id=customer.id, status="OPEN")
    mock_db_client.collection("conversations").document(conv.id).set(conv.to_dict())

    client.post('/api/auth/login', json={"email": "admin@test.com", "password": "password"})
    response = client.post('/api/conversations/conv_2/messages', json={"text": "Fail test"})

    assert response.status_code == 400
    body = response.get_json()
    assert body['status'] == 'error'
    # The raw Meta response body must not be echoed back to the client.
    assert body["message"] == "Failed to send message: Meta API returned HTTP 500"

def test_add_note_does_not_use_inbound_direction(client, mock_db_client):
    """
    Internal notes are never sent over WhatsApp, so they aren't "from the
    customer" -- storing them with direction="INBOUND" (the same value used
    for real customer messages) is a latent trap for any future code that
    filters on direction to mean "customer message" (e.g. 24h-window logic).
    """
    admin = User(id="usr_admin4", email="admin4@test.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
    customer = Customer(id="cust_4", phone_hash="hash4", real_phone_number_encrypted=encrypt_phone("444"), masked_id="Lead-4444")
    mock_db_client.collection("users").document(admin.id).set(admin.to_dict())
    mock_db_client.collection("customers").document(customer.id).set(customer.to_dict())

    conv = Conversation(id="conv_4", customer_id=customer.id, status="OPEN")
    mock_db_client.collection("conversations").document(conv.id).set(conv.to_dict())

    client.post('/api/auth/login', json={"email": "admin4@test.com", "password": "password"})
    response = client.post('/api/conversations/conv_4/notes', json={"text": "Customer seems upset"})

    assert response.status_code == 200
    assert response.get_json()["data"]["direction"] is None

    saved = list(mock_db_client.collection("messages").where("conversation_id", "==", "conv_4").stream())
    assert len(saved) == 1
    assert saved[0].to_dict()["direction"] is None

def test_update_status_to_resolved(client, mock_db_client):
    c = Customer(phone_hash=hash_phone("1112223333"), real_phone_number_encrypted=encrypt_phone("1112223333"), masked_id="Lead-St1")
    mock_db_client.collection("customers").document(c.id).set(c.to_dict())
    conv = Conversation(id="conv_status_1", customer_id=c.id, status="OPEN")
    mock_db_client.collection("conversations").document(conv.id).set(conv.to_dict())

    admin = User(email="statusadmin@test.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
    mock_db_client.collection("users").document(admin.id).set(admin.to_dict())
    client.post('/api/auth/login', json={"email": "statusadmin@test.com", "password": "password"})

    response = client.patch('/api/conversations/conv_status_1/status', json={"status": "RESOLVED"})

    assert response.status_code == 200
    assert response.json['data']['status'] == "RESOLVED"

    updated = mock_db_client.collection("conversations").document("conv_status_1").get().to_dict()
    assert updated["status"] == "RESOLVED"

def test_update_status_rejects_invalid_value(client, mock_db_client):
    c = Customer(phone_hash=hash_phone("2223334444"), real_phone_number_encrypted=encrypt_phone("2223334444"), masked_id="Lead-St2")
    mock_db_client.collection("customers").document(c.id).set(c.to_dict())
    conv = Conversation(id="conv_status_2", customer_id=c.id, status="OPEN")
    mock_db_client.collection("conversations").document(conv.id).set(conv.to_dict())

    admin = User(email="statusadmin2@test.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
    mock_db_client.collection("users").document(admin.id).set(admin.to_dict())
    client.post('/api/auth/login', json={"email": "statusadmin2@test.com", "password": "password"})

    response = client.patch('/api/conversations/conv_status_2/status', json={"status": "DELETED_FOREVER"})

    assert response.status_code == 400
    assert response.json['status'] == 'error'

    unchanged = mock_db_client.collection("conversations").document("conv_status_2").get().to_dict()
    assert unchanged["status"] == "OPEN"

def test_update_status_missing_field(client, mock_db_client):
    admin = User(email="statusadmin3@test.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
    mock_db_client.collection("users").document(admin.id).set(admin.to_dict())
    client.post('/api/auth/login', json={"email": "statusadmin3@test.com", "password": "password"})

    response = client.patch('/api/conversations/conv_status_3/status', json={})

    assert response.status_code == 400

def test_update_status_nonexistent_conversation(client, mock_db_client):
    admin = User(email="statusadmin4@test.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
    mock_db_client.collection("users").document(admin.id).set(admin.to_dict())
    client.post('/api/auth/login', json={"email": "statusadmin4@test.com", "password": "password"})

    response = client.patch('/api/conversations/does-not-exist/status', json={"status": "RESOLVED"})

    assert response.status_code == 404

def test_send_message_rejects_oversized_upload(client, app, mock_db_client):
    """
    The spec's 'enforce size limits in JS' is a UX nicety, not a security
    boundary -- the server must independently cap upload size so a direct
    POST (bypassing the browser) can't exhaust memory.
    """
    import io

    admin = User(id="usr_admin3", email="admin3@test.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
    customer = Customer(id="cust_3", phone_hash="hash3", real_phone_number_encrypted=encrypt_phone("555"), masked_id="Lead-9999")
    mock_db_client.collection("users").document(admin.id).set(admin.to_dict())
    mock_db_client.collection("customers").document(customer.id).set(customer.to_dict())

    conv = Conversation(id="conv_3", customer_id=customer.id, status="OPEN")
    mock_db_client.collection("conversations").document(conv.id).set(conv.to_dict())

    client.post('/api/auth/login', json={"email": "admin3@test.com", "password": "password"})

    app.config['MAX_CONTENT_LENGTH'] = 10  # bytes, for a fast/deterministic test

    response = client.post(
        '/api/conversations/conv_3/messages',
        data={"file": (io.BytesIO(b"x" * 1000), "big.txt")},
        content_type='multipart/form-data'
    )

    assert response.status_code == 413
    body = response.get_json()
    assert body['status'] == 'error'

def test_send_message_missing_customer_returns_404_not_400(client, mock_db_client):
    """
    The route's own upfront check only confirms the conversation exists; it
    can't also catch a dangling customer_id. Whatever decides the final HTTP
    status must recognize "customer not found" as a 404, not fall through to
    a generic 400 because it isn't the literal string "Conversation not
    found" (the previous string-matching implementation's bug).
    """
    admin = User(email="admin5@test.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
    mock_db_client.collection("users").document(admin.id).set(admin.to_dict())

    # customer_id points at a customer document that was never created.
    conv = Conversation(id="conv_5", customer_id="ghost_customer", status="OPEN")
    mock_db_client.collection("conversations").document(conv.id).set(conv.to_dict())

    client.post('/api/auth/login', json={"email": "admin5@test.com", "password": "password"})
    response = client.post('/api/conversations/conv_5/messages', json={"text": "Hello?"})

    assert response.status_code == 404
    assert response.get_json()["status"] == "error"

def test_send_message_invalid_conversation(client, mock_db_client):
    admin = User(email="admin@test.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
    mock_db_client.collection("users").document(admin.id).set(admin.to_dict())

    client.post('/api/auth/login', json={"email": "admin@test.com", "password": "password"})
    response = client.post('/api/conversations/invalid_id/messages', json={"text": "Fail test"})

    assert response.status_code == 404

def test_get_messages_nonexistent_conversation_returns_404(client, mock_db_client):
    admin = User(email="admin@example.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
    mock_db_client.collection("users").document(admin.id).set(admin.to_dict())

    client.post('/api/auth/login', json={"email": "admin@example.com", "password": "password"})

    response = client.get('/api/conversations/invalid-id/messages')
    assert response.status_code == 404

def test_get_messages_empty_history_returns_empty_list(client, mock_db_client):
    c = Customer(phone_hash=hash_phone("empty"), real_phone_number_encrypted=encrypt_phone("empty"), masked_id="Lead-Empty")
    mock_db_client.collection("customers").document(c.id).set(c.to_dict())

    conv = Conversation(customer_id=c.id)
    mock_db_client.collection("conversations").document(conv.id).set(conv.to_dict())

    admin = User(email="admin@example.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
    mock_db_client.collection("users").document(admin.id).set(admin.to_dict())

    client.post('/api/auth/login', json={"email": "admin@example.com", "password": "password"})
    response = client.get(f'/api/conversations/{conv.id}/messages')
    assert response.status_code == 200
    assert response.json == {"status": "success", "data": []}

def test_api_rejects_unauthorized_roles(client, mock_db_client):
    unauth = User(email="unauth@example.com", full_name="Unauth", password_hash=hash_password("password"), role="SYSTEM")
    mock_db_client.collection("users").document(unauth.id).set(unauth.to_dict())

    client.post('/api/auth/login', json={"email": "unauth@example.com", "password": "password"})
    response = client.get('/api/conversations')
    assert response.status_code == 403
