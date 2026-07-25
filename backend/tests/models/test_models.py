import pytest
from app.models.user import User
from app.models.customer import Customer
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.tag import Tag
from app.models.canned_response import CannedResponse
from app.models.meta_template import MetaTemplate
from app.models.audit_log import AuditLog
from app.models.business_setting import BusinessSetting
from app.db.database import db
from sqlalchemy.exc import IntegrityError

def test_user_model(app):
    user = User(
        full_name="Jane Doe",
        email="jane@example.com",
        password_hash="hashed_pw",
        role="AGENT",
        system_status="ACTIVE",
        agent_status="ONLINE"
    )
    db.session.add(user)
    db.session.commit()

    saved_user = db.session.get(User, user.id)
    assert saved_user is not None
    assert saved_user.email == "jane@example.com"
    assert saved_user.role == "AGENT"

def test_user_unique_email(app):
    user1 = User(full_name="A", email="test@test.com", password_hash="pw", role="AGENT")
    user2 = User(full_name="B", email="test@test.com", password_hash="pw", role="AGENT")
    
    db.session.add(user1)
    db.session.commit()
    
    db.session.add(user2)
    with pytest.raises(IntegrityError):
        db.session.commit()

def test_customer_model(app):
    from app.core.security import encrypt_phone, hash_phone
    customer = Customer(
        phone_hash=hash_phone("12345"),
        real_phone_number_encrypted=encrypt_phone("12345"),
        masked_id="Lead 001",
        whatsapp_name="John"
    )
    db.session.add(customer)
    db.session.commit()

    saved_customer = db.session.get(Customer, customer.id)
    assert saved_customer is not None
    assert saved_customer.masked_id == "Lead 001"

from app.models.conversation import Conversation
from app.models.message import Message

def test_conversation_and_message_models(app):
    from app.core.security import encrypt_phone, hash_phone
    customer = Customer(
        phone_hash=hash_phone("123"),
        real_phone_number_encrypted=encrypt_phone("123"),
        masked_id="Lead 002"
    )
    db.session.add(customer)
    db.session.flush()

    convo = Conversation(
        customer_id=customer.id,
        status="OPEN",
        priority="NORMAL"
    )
    db.session.add(convo)
    db.session.flush()

    msg = Message(
        conversation_id=convo.id,
        sender_type="CUSTOMER",
        message_type="TEXT",
        direction="INBOUND",
        text_body="Hello",
        delivery_status="DELIVERED"
    )
    db.session.add(msg)
    db.session.commit()

    saved_convo = db.session.get(Conversation, convo.id)
    assert saved_convo is not None
    assert saved_convo.status == "OPEN"

    saved_msg = db.session.get(Message, msg.id)
    assert saved_msg is not None
    assert saved_msg.text_body == "Hello"

