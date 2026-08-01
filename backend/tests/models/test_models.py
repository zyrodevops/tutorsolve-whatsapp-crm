import pytest
from app.models.user import User
from app.models.customer import Customer
from app.models.conversation import Conversation
from app.models.message import Message

def test_user_model(app, mock_db_client):
    user = User(
        full_name="Jane Doe",
        email="jane@example.com",
        password_hash="hashed_pw",
        role="AGENT",
        system_status="ACTIVE",
        agent_status="ONLINE"
    )
    mock_db_client.collection("users").document(user.id).set(user.to_dict())

    saved_user_doc = mock_db_client.collection("users").document(user.id).get()
    assert saved_user_doc.exists
    saved_user = saved_user_doc.to_dict()
    assert saved_user["email"] == "jane@example.com"
    assert saved_user["role"] == "AGENT"

def test_customer_model(app, mock_db_client):
    from app.core.security import encrypt_phone, hash_phone
    customer = Customer(
        phone_hash=hash_phone("12345"),
        real_phone_number_encrypted=encrypt_phone("12345"),
        masked_id="Lead 001",
        whatsapp_name="John"
    )
    mock_db_client.collection("customers").document(customer.id).set(customer.to_dict())

    saved_customer_doc = mock_db_client.collection("customers").document(customer.id).get()
    assert saved_customer_doc.exists
    saved_customer = saved_customer_doc.to_dict()
    assert saved_customer["masked_id"] == "Lead 001"

def test_conversation_and_message_models(app, mock_db_client):
    from app.core.security import encrypt_phone, hash_phone
    customer = Customer(
        phone_hash=hash_phone("123"),
        real_phone_number_encrypted=encrypt_phone("123"),
        masked_id="Lead 002"
    )
    mock_db_client.collection("customers").document(customer.id).set(customer.to_dict())

    convo = Conversation(
        customer_id=customer.id,
        status="OPEN",
        priority="NORMAL"
    )
    mock_db_client.collection("conversations").document(convo.id).set(convo.to_dict())

    msg = Message(
        conversation_id=convo.id,
        sender_type="CUSTOMER",
        message_type="TEXT",
        direction="INBOUND",
        text_body="Hello",
        delivery_status="DELIVERED"
    )
    mock_db_client.collection("messages").document(msg.id).set(msg.to_dict())

    saved_convo_doc = mock_db_client.collection("conversations").document(convo.id).get()
    assert saved_convo_doc.exists
    saved_convo = saved_convo_doc.to_dict()
    assert saved_convo["status"] == "OPEN"

    saved_msg_doc = mock_db_client.collection("messages").document(msg.id).get()
    assert saved_msg_doc.exists
    saved_msg = saved_msg_doc.to_dict()
    assert saved_msg["text_body"] == "Hello"
