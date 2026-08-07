import logging
import pytest
from unittest.mock import patch
from app.models.user import User
from app.core.security import hash_password, create_access_token, create_password_reset_token

@pytest.fixture
def test_user(app, mock_db_client):
    user = User(
        full_name="Test Agent",
        email="agent@test.com",
        password_hash=hash_password("securepassword123"),
        role="AGENT"
    )
    mock_db_client.collection("users").document(user.id).set(user.to_dict())
    return user

def test_login_success(client, test_user):
    response = client.post('/api/auth/login', json={
        "email": "agent@test.com",
        "password": "securepassword123"
    })
    
    assert response.status_code == 200
    data = response.json
    assert data["status"] == "success"
    
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
    })
    
    assert response.status_code == 400
    assert response.json["status"] == "error"
    assert "password" in response.json["errors"]

def test_login_inactive_user_with_correct_password_gets_a_distinct_message(client, mock_db_client, test_user):
    """
    A deactivated account with the RIGHT password must not see the generic
    "Invalid email or password" -- that's actively misleading (the agent
    knows their password is correct) and won't tell them to contact an admin.
    """
    mock_db_client.collection("users").document(test_user.id).update({"system_status": "INACTIVE"})

    response = client.post('/api/auth/login', json={
        "email": "agent@test.com",
        "password": "securepassword123"
    })

    assert response.status_code == 403
    assert response.json["status"] == "error"
    assert "deactivated" in response.json["message"].lower()
    assert response.json["code"] == "ACCOUNT_DEACTIVATED"

def test_login_inactive_user_with_wrong_password_still_gets_generic_message(client, mock_db_client, test_user):
    """
    A wrong password must always look identical whether or not the account
    is deactivated -- otherwise a wrong-password guess against a deactivated
    account's email would confirm the account exists and is deactivated.
    """
    mock_db_client.collection("users").document(test_user.id).update({"system_status": "INACTIVE"})

    response = client.post('/api/auth/login', json={
        "email": "agent@test.com",
        "password": "wrongpassword"
    })

    assert response.status_code == 401
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

def test_get_current_user_success(client, test_user):
    token = create_access_token(user_id=test_user.id, role=test_user.role)
    client.set_cookie("access_token", token)
    response = client.get('/api/auth/me')

    assert response.status_code == 200
    assert response.json["status"] == "success"
    assert response.json["data"]["email"] == "agent@test.com"

def test_get_current_user_includes_agent_status(client, mock_db_client, test_user):
    """
    The frontend (AppShell) only updates its online/busy/offline indicator
    when agent_status is present in this response; otherwise it silently
    keeps its default (OFFLINE) after every page reload, even though the
    user's real status in the database is unchanged.
    """
    mock_db_client.collection("users").document(test_user.id).update({"agent_status": "ONLINE"})
    token = create_access_token(user_id=test_user.id, role=test_user.role)
    client.set_cookie("access_token", token)

    response = client.get('/api/auth/me')

    assert response.status_code == 200
    assert response.json["data"]["agent_status"] == "ONLINE"

def test_get_current_user_no_cookie(client):
    response = client.get('/api/auth/me')
    assert response.status_code == 401

def test_get_current_user_deactivated(client, mock_db_client, test_user):
    mock_db_client.collection("users").document(test_user.id).update({"system_status": "INACTIVE"})
    token = create_access_token(user_id=test_user.id, role=test_user.role)

    client.set_cookie("access_token", token)
    response = client.get('/api/auth/me')

    assert response.status_code == 401

def test_forgot_password_known_email_sends_email(client, test_user):
    with patch("app.services.auth_service.EmailService.send_password_reset_email") as mock_send:
        response = client.post('/api/auth/forgot-password', json={"email": "agent@test.com"})

        assert response.status_code == 200
        assert response.json["status"] == "success"
        mock_send.assert_called_once()
        args, _ = mock_send.call_args
        assert args[0] == "agent@test.com"

def test_forgot_password_unknown_email_gives_same_response(client):
    with patch("app.services.auth_service.EmailService.send_password_reset_email") as mock_send:
        response = client.post('/api/auth/forgot-password', json={"email": "nobody@test.com"})

        assert response.status_code == 200
        assert response.json["status"] == "success"
        mock_send.assert_not_called()

def test_forgot_password_invalid_email_format(client):
    response = client.post('/api/auth/forgot-password', json={"email": "not-an-email"})
    assert response.status_code == 400
    assert response.json["status"] == "error"

def test_reset_password_success(client, mock_db_client, test_user):
    token = create_password_reset_token(test_user.id)
    response = client.post('/api/auth/reset-password', json={
        "token": token,
        "new_password": "brandnewpassword"
    })

    assert response.status_code == 200
    assert response.json["status"] == "success"

    login_response = client.post('/api/auth/login', json={
        "email": "agent@test.com",
        "password": "brandnewpassword"
    })
    assert login_response.status_code == 200

def test_reset_password_rejects_access_token(client, test_user):
    # An ordinary login token must not double as a password-reset token.
    login_token = create_access_token(user_id=test_user.id, role=test_user.role)
    response = client.post('/api/auth/reset-password', json={
        "token": login_token,
        "new_password": "brandnewpassword"
    })

    assert response.status_code == 400
    assert response.json["status"] == "error"

def test_reset_password_rejects_invalid_token(client):
    response = client.post('/api/auth/reset-password', json={
        "token": "not-a-real-token",
        "new_password": "brandnewpassword"
    })

    assert response.status_code == 400
    assert response.json["status"] == "error"

def test_reset_password_rejects_short_password(client, test_user):
    token = create_password_reset_token(test_user.id)
    response = client.post('/api/auth/reset-password', json={
        "token": token,
        "new_password": "short"
    })

    assert response.status_code == 400
    assert "new_password" in response.json["errors"]

def test_reset_password_revokes_existing_refresh_tokens(client, mock_db_client, test_user):
    """
    A refresh token issued before a password reset must stop working after
    the reset -- otherwise an attacker holding a stolen refresh token keeps
    a working session straight through the user's own reset.
    """
    login_response = client.post('/api/auth/login', json={
        "email": "agent@test.com",
        "password": "securepassword123"
    })
    old_refresh_cookie = next(
        c for c in login_response.headers.getlist('Set-Cookie') if c.startswith('refresh_token=')
    )
    old_refresh_token = old_refresh_cookie.split('refresh_token=')[1].split(';')[0]

    reset_token = create_password_reset_token(test_user.id)
    reset_response = client.post('/api/auth/reset-password', json={
        "token": reset_token,
        "new_password": "brandnewpassword"
    })
    assert reset_response.status_code == 200

    client.set_cookie("refresh_token", old_refresh_token)
    refresh_response = client.post('/api/auth/refresh')

    assert refresh_response.status_code == 401
    assert refresh_response.json["status"] == "error"

def test_refresh_logs_unexpected_errors_with_detail(client, test_user, caplog):
    """
    /refresh's generic client-facing message is intentional (don't leak
    whether a token is expired vs. revoked vs. the user is inactive), but an
    unexpected failure (e.g. a Firestore outage) must still be logged with
    real detail server-side -- otherwise it's indistinguishable from a
    routine expired-token request in the logs.
    """
    login_response = client.post('/api/auth/login', json={
        "email": "agent@test.com",
        "password": "securepassword123"
    })
    refresh_cookie = next(
        c for c in login_response.headers.getlist('Set-Cookie') if c.startswith('refresh_token=')
    )
    refresh_token = refresh_cookie.split('refresh_token=')[1].split(';')[0]
    client.set_cookie("refresh_token", refresh_token)

    with patch("app.api.auth.db.client.collection", side_effect=RuntimeError("firestore is down")):
        with caplog.at_level(logging.WARNING):
            response = client.post('/api/auth/refresh')

    assert response.status_code == 401
    assert response.get_json()["message"] == "Invalid or expired refresh token"
    assert any("firestore is down" in record.message for record in caplog.records)

def test_reset_password_rejects_deactivated_user(client, mock_db_client, test_user):
    token = create_password_reset_token(test_user.id)
    mock_db_client.collection("users").document(test_user.id).update({"system_status": "INACTIVE"})

    response = client.post('/api/auth/reset-password', json={
        "token": token,
        "new_password": "brandnewpassword"
    })

    assert response.status_code == 400
    assert response.json["status"] == "error"
