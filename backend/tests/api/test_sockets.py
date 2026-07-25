import pytest
from app.core.socket_events import socketio
from app.models.user import User
from app.db.database import db
import jwt
from flask import current_app
from app.core.config import SECRET_KEY

def hash_password(password: str) -> str:
    import bcrypt
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def test_socket_rejects_unauthenticated_connection(app):
    socket_client = socketio.test_client(app)
    # The client shouldn't be connected because we didn't have a cookie
    assert socket_client.is_connected() is False

def test_socket_accepts_authenticated_connection(client, app):
    with app.app_context():
        User.query.delete()
        admin = User(email="admin@example.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
        db.session.add(admin)
        db.session.commit()
    
    client.post('/api/auth/login', json={"email": "admin@example.com", "password": "password"})
    
    socket_client = socketio.test_client(app, flask_test_client=client)
    assert socket_client.is_connected() is True

def test_socket_rejects_expired_token(client, app):
    from datetime import datetime, timezone, timedelta
    with app.app_context():
        User.query.delete()
        admin = User(email="admin@example.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
        db.session.add(admin)
        db.session.commit()
        
        expired_token = jwt.encode(
            {
                "sub": admin.id, 
                "role": admin.role,
                "exp": datetime.now(timezone.utc) - timedelta(hours=1)
            },
            SECRET_KEY,
            algorithm="HS256"
        )
    client.set_cookie('access_token', expired_token)
    socket_client = socketio.test_client(app, flask_test_client=client)
    assert socket_client.is_connected() is False

def test_socket_rejects_invalid_token(client, app):
    client.set_cookie('access_token', "invalid.token.string")
    socket_client = socketio.test_client(app, flask_test_client=client)
    assert socket_client.is_connected() is False

def test_socket_rejects_inactive_user(client, app):
    with app.app_context():
        User.query.delete()
        inactive = User(email="inactive@example.com", full_name="Inactive", password_hash=hash_password("password"), role="AGENT", system_status="INACTIVE")
        db.session.add(inactive)
        db.session.commit()
        
        valid_token = jwt.encode(
            {
                "sub": inactive.id, 
                "role": inactive.role,
            },
            SECRET_KEY,
            algorithm="HS256"
        )
    client.set_cookie('access_token', valid_token)
    socket_client = socketio.test_client(app, flask_test_client=client)
    assert socket_client.is_connected() is False
