import pytest
from app.models.user import User
from app.core.security import hash_password, create_access_token

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

def test_reveal_number_does_not_leak_raw_exception_text(client, admin_token, mock_db_client, mocker):
    """
    An unexpected Firestore failure must not surface raw internal exception
    text to the client -- that can leak implementation detail and violates
    CODING_STANDARDS.md's explicit-error-handling rule.
    """
    client.set_cookie("access_token", admin_token)
    # "users" must keep working -- the @require_role decorator looks up the
    # current user via that collection before the route body ever runs.
    real_collection = mock_db_client.collection
    def flaky_collection(name):
        if name == "users":
            return real_collection(name)
        raise RuntimeError("super secret internal connection string leaked here")
    mocker.patch("app.api.admin.db.client.collection", side_effect=flaky_collection)

    response = client.post('/api/admin/reveal-number', json={"conversation_id": "conv_1"})

    assert response.status_code == 500
    body = response.get_json()
    assert body["status"] == "error"
    assert "super secret internal connection string" not in body["message"]

def test_get_analytics_does_not_leak_raw_exception_text(client, admin_token, mock_db_client, mocker):
    client.set_cookie("access_token", admin_token)
    # "users" must keep working -- the @require_role decorator looks up the
    # current user via that collection before the route body ever runs.
    real_collection = mock_db_client.collection
    def flaky_collection(name):
        if name == "users":
            return real_collection(name)
        raise RuntimeError("super secret internal connection string leaked here")
    mocker.patch("app.api.admin.db.client.collection", side_effect=flaky_collection)

    response = client.get('/api/admin/analytics')

    assert response.status_code == 500
    body = response.get_json()
    assert body["status"] == "error"
    assert "super secret internal connection string" not in body["message"]
