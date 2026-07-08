import pytest
from app.db.database import db
from app.models.user import User
from app.core.security import hash_password, create_access_token

@pytest.fixture
def admin_token(app):
    user = User(
        full_name="Admin User",
        email="admin@test.com",
        password_hash=hash_password("adminpass"),
        role="ADMIN"
    )
    with app.app_context():
        db.session.add(user)
        db.session.commit()
        return create_access_token(user_id=user.id, role="ADMIN")

@pytest.fixture
def agent_token(app):
    user = User(
        full_name="Agent User",
        email="agent@test.com",
        password_hash=hash_password("agentpass"),
        role="AGENT"
    )
    with app.app_context():
        db.session.add(user)
        db.session.commit()
        return create_access_token(user_id=user.id, role="AGENT")

from unittest.mock import patch

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
        
        # Verify SendGrid integration was triggered
        mock_send_email.assert_called_once_with("new@test.com", "New Employee", "securepassword")

def test_agent_cannot_create_user(client, agent_token):
    client.set_cookie("access_token", agent_token)
    response = client.post('/api/users', json={
        "full_name": "Rogue Agent",
        "email": "rogue@test.com",
        "password": "password",
        "role": "AGENT"
    })
    
    assert response.status_code == 403

def test_admin_creates_duplicate_user(client, admin_token, app):
    # Setup an existing user
    with app.app_context():
        existing = User(
            full_name="Existing",
            email="existing@test.com",
            password_hash="hash",
            role="AGENT"
        )
        db.session.add(existing)
        db.session.commit()

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

def test_admin_gets_users(client, admin_token, app):
    from app.models.user import User
    from app.db.database import db
    
    # Setup multiple users
    with app.app_context():
        u1 = User(full_name="User 1", email="u1@test.com", password_hash="h", role="AGENT")
        u2 = User(full_name="User 2", email="u2@test.com", password_hash="h", role="MANAGER")
        db.session.add_all([u1, u2])
        db.session.commit()

    client.set_cookie("access_token", admin_token)
    response = client.get('/api/users')
    
    assert response.status_code == 200
    assert response.json["status"] == "success"
    # Ensure all users are returned (including admin and agent from fixtures)
    assert len(response.json["data"]) >= 2
    assert "password_hash" not in response.json["data"][0]

def test_agent_cannot_get_users(client, agent_token):
    client.set_cookie("access_token", agent_token)
    response = client.get('/api/users')
    
    assert response.status_code == 403
    assert response.json["status"] == "error"
