from app.core.socket_events import socketio
from app.models.user import User
import jwt
from app.core.config import SECRET_KEY

def hash_password(password: str) -> str:
    import bcrypt
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def test_socket_rejects_unauthenticated_connection(app):
    socket_client = socketio.test_client(app)
    # The client shouldn't be connected because we didn't have a cookie
    assert socket_client.is_connected() is False

def test_socket_accepts_authenticated_connection(client, app, mock_db_client):
    admin = User(email="admin@example.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
    mock_db_client.collection("users").document(admin.id).set(admin.to_dict())

    client.post('/api/auth/login', json={"email": "admin@example.com", "password": "password"})

    socket_client = socketio.test_client(app, flask_test_client=client)
    assert socket_client.is_connected() is True

def test_socket_rejects_expired_token(client, app, mock_db_client):
    from datetime import datetime, timezone, timedelta
    admin = User(email="admin@example.com", full_name="Admin", password_hash=hash_password("password"), role="ADMIN")
    mock_db_client.collection("users").document(admin.id).set(admin.to_dict())

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

def test_socket_rejects_inactive_user(client, app, mock_db_client):
    inactive = User(email="inactive@example.com", full_name="Inactive", password_hash=hash_password("password"), role="AGENT", system_status="INACTIVE")
    mock_db_client.collection("users").document(inactive.id).set(inactive.to_dict())

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
