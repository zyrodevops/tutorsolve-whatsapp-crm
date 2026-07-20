import pytest
from app.db.database import db
from app.models.user import User
from app.core.security import hash_password, create_access_token

@pytest.fixture
def test_user(app):
    user = User(
        full_name="Test Agent",
        email="agent@test.com",
        password_hash=hash_password("securepassword123"),
        role="AGENT"
    )
    with app.app_context():
        db.session.add(user)
        db.session.commit()
        return user

def test_login_success(client, test_user):
    response = client.post('/api/auth/login', json={
        "email": "agent@test.com",
        "password": "securepassword123"
    })
    
    assert response.status_code == 200
    data = response.json
    assert data["status"] == "success"
    
    # Verify cookie was set
    cookies = response.headers.getlist('Set-Cookie')
    assert any('access_token=' in cookie for cookie in cookies)
    
    assert data["data"]["user"]["email"] == "agent@test.com"

def test_login_nonexistent_user(client):
    response = client.post('/api/auth/login', json={
        "email": "nobody@test.com",
        "password": "password123"
    })
    
    assert response.status_code == 401
    assert response.json["status"] == "error"

def test_login_missing_fields(client):
    response = client.post('/api/auth/login', json={
        "email": "agent@test.com"
        # missing password
    })
    
    assert response.status_code == 400
    assert response.json["status"] == "error"
    assert "password" in response.json["errors"]

def test_login_inactive_user(client, app, test_user):
    from app.db.database import db
    from app.models.user import User
    
    with app.app_context():
        user = db.session.execute(db.select(User).filter_by(email="agent@test.com")).scalar_one()
        user.system_status = "INACTIVE"
        db.session.commit()
        
    response = client.post('/api/auth/login', json={
        "email": "agent@test.com",
        "password": "securepassword123"
    })
    
    assert response.status_code == 401
    assert response.json["status"] == "error"
    assert response.json["message"] == "Invalid email or password"

def test_login_invalid_password(client, test_user):
    response = client.post('/api/auth/login', json={
        "email": "agent@test.com",
        "password": "wrongpassword"
    })
    
    assert response.status_code == 401
    assert response.json["status"] == "error"

def test_login_user_not_found(client):
    response = client.post('/api/auth/login', json={
        "email": "nobody@test.com",
        "password": "password"
    })

    assert response.status_code == 401

def test_get_current_user_success(client, app, test_user):
    with app.app_context():
        user = db.session.execute(db.select(User).filter_by(email="agent@test.com")).scalar_one()
        token = create_access_token(user_id=user.id, role=user.role)

    client.set_cookie("access_token", token)
    response = client.get('/api/auth/me')

    assert response.status_code == 200
    assert response.json["status"] == "success"
    assert response.json["data"]["email"] == "agent@test.com"

def test_get_current_user_no_cookie(client):
    response = client.get('/api/auth/me')

    assert response.status_code == 401

def test_get_current_user_deactivated(client, app, test_user):
    with app.app_context():
        user = db.session.execute(db.select(User).filter_by(email="agent@test.com")).scalar_one()
        token = create_access_token(user_id=user.id, role=user.role)
        user.system_status = "INACTIVE"
        db.session.commit()

    client.set_cookie("access_token", token)
    response = client.get('/api/auth/me')

    assert response.status_code == 401
