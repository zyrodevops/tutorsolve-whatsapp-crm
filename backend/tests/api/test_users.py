import pytest
from app.models.user import User
from app.models.customer import Customer
from app.models.conversation import Conversation
from app.core.security import hash_password, create_access_token, encrypt_phone, hash_phone
from unittest.mock import patch

@pytest.fixture
def admin_token(app, mock_db_client):
    user = User(
        full_name="Admin User",
        email="admin@test.com",
        password_hash=hash_password("adminpass"),
        role="ADMIN"
    )
    mock_db_client.collection("users").document(user.id).set(user.to_dict())
    return create_access_token(user_id=user.id, role="ADMIN")

@pytest.fixture
def agent_token(app, mock_db_client):
    user = User(
        full_name="Agent User",
        email="agent@test.com",
        password_hash=hash_password("agentpass"),
        role="AGENT"
    )
    mock_db_client.collection("users").document(user.id).set(user.to_dict())
    return create_access_token(user_id=user.id, role="AGENT")


def test_admin_creates_user_success(client, admin_token):
    client.set_cookie("access_token", admin_token)

    with patch("app.services.email_service.EmailService.send_welcome_email") as mock_send_email:
        response = client.post('/api/users', json={
            "full_name": "New Employee",
            "email": "new@test.com",
            "password": "securepassword",
            "role": "AGENT"
        })

        assert response.status_code == 201
        assert response.json["status"] == "success"
        assert response.json["data"]["email"] == "new@test.com"

        mock_send_email.assert_called_once()
        call_args = mock_send_email.call_args[0]
        assert call_args[0] == "new@test.com"
        assert call_args[1] == "New Employee"
        # The plaintext password must never be emailed -- a setup link is sent instead.
        assert "securepassword" not in call_args[2]
        assert "/reset-password?token=" in call_args[2]

def test_agent_cannot_create_user(client, agent_token):
    client.set_cookie("access_token", agent_token)
    response = client.post('/api/users', json={
        "full_name": "Rogue Agent",
        "email": "rogue@test.com",
        "password": "password",
        "role": "AGENT"
    })

    assert response.status_code == 403

def test_admin_creates_duplicate_user(client, admin_token, mock_db_client):
    existing = User(
        full_name="Existing",
        email="existing@test.com",
        password_hash="hash",
        role="AGENT"
    )
    mock_db_client.collection("users").document(existing.id).set(existing.to_dict())

    client.set_cookie("access_token", admin_token)
    response = client.post('/api/users', json={
        "full_name": "Duplicate",
        "email": "existing@test.com",
        "password": "password",
        "role": "AGENT"
    })

    assert response.status_code == 400
    assert response.json["status"] == "error"

def test_admin_creates_user_invalid_role(client, admin_token):
    client.set_cookie("access_token", admin_token)
    response = client.post('/api/users', json={
        "full_name": "Bad Role",
        "email": "badrole@test.com",
        "password": "password",
        "role": "SUPERADMIN"
    })

    assert response.status_code == 400
    assert "role" in response.json["errors"]

def test_admin_creates_user_missing_fields(client, admin_token):
    client.set_cookie("access_token", admin_token)
    response = client.post('/api/users', json={
        "email": "missing@test.com",
        "role": "AGENT"
        # missing full_name and password
    })

    assert response.status_code == 400
    assert "full_name" in response.json["errors"]
    assert "password" in response.json["errors"]

def test_create_user_no_cookie(client):
    response = client.post('/api/users', json={
        "full_name": "No Cookie",
        "email": "nocookie@test.com",
        "password": "password",
        "role": "AGENT"
    })

    assert response.status_code == 401
    assert response.json["message"] == "Missing authentication cookie"

def test_create_user_forged_cookie(client):
    client.set_cookie("access_token", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature")
    response = client.post('/api/users', json={
        "full_name": "Forged",
        "email": "forged@test.com",
        "password": "password",
        "role": "AGENT"
    })

    assert response.status_code == 401
    assert response.json["message"] == "Invalid token"

def test_delete_user_success(client, admin_token, mock_db_client):
    user = User(
        full_name="To Delete",
        email="delete@example.com",
        password_hash="hash",
        role="AGENT"
    )
    mock_db_client.collection("users").document(user.id).set(user.to_dict())

    client.set_cookie("access_token", admin_token)
    response = client.delete(f"/api/users/{user.id}")
    assert response.status_code == 200
    assert response.get_json()["status"] == "success"

def test_delete_user_not_found(client, admin_token):
    client.set_cookie("access_token", admin_token)
    response = client.delete("/api/users/non-existent-id")
    assert response.status_code == 404
    assert response.get_json()["status"] == "error"

def test_delete_user_with_assigned_conversation_is_refused(client, admin_token, mock_db_client):
    agent = User(
        full_name="Busy Agent",
        email="busy-agent@example.com",
        password_hash="hash",
        role="AGENT"
    )
    mock_db_client.collection("users").document(agent.id).set(agent.to_dict())

    customer = Customer(
        phone_hash=hash_phone("15550001111"),
        real_phone_number_encrypted=encrypt_phone("15550001111"),
        masked_id="Lead-test"
    )
    mock_db_client.collection("customers").document(customer.id).set(customer.to_dict())

    conv = Conversation(customer_id=customer.id, assigned_agent_id=agent.id)
    mock_db_client.collection("conversations").document(conv.id).set(conv.to_dict())

    client.set_cookie("access_token", admin_token)
    response = client.delete(f"/api/users/{agent.id}")
    assert response.status_code == 409
    assert response.get_json()["status"] == "error"

def test_delete_self(client, admin_token, mock_db_client):
    docs = list(mock_db_client.collection("users").where("email", "==", "admin@test.com").limit(1).stream())
    admin_id = docs[0].to_dict()["id"]

    client.set_cookie("access_token", admin_token)
    response = client.delete(f"/api/users/{admin_id}")
    assert response.status_code == 400
    assert response.get_json()["message"] == "You cannot delete your own account"

def test_admin_gets_users(client, admin_token, mock_db_client):
    u1 = User(full_name="User 1", email="u1@test.com", password_hash="h", role="AGENT")
    u2 = User(full_name="User 2", email="u2@test.com", password_hash="h", role="MANAGER")
    mock_db_client.collection("users").document(u1.id).set(u1.to_dict())
    mock_db_client.collection("users").document(u2.id).set(u2.to_dict())

    client.set_cookie("access_token", admin_token)
    response = client.get('/api/users')

    assert response.status_code == 200
    assert response.json["status"] == "success"
    # Ensure all users are returned (including the admin from the fixture)
    assert len(response.json["data"]) >= 2
    assert "password_hash" not in response.json["data"][0]

def test_agent_cannot_get_users(client, agent_token):
    client.set_cookie("access_token", agent_token)
    response = client.get('/api/users')

    assert response.status_code == 403
    assert response.json["status"] == "error"
