import pytest
import requests
from app.models.user import User
from app.core.security import hash_password, create_access_token

@pytest.fixture
def agent_token(app, mock_db_client):
    user = User(
        full_name="Agent User",
        email="agent@test.com",
        password_hash=hash_password("password"),
        role="AGENT"
    )
    mock_db_client.collection("users").document(user.id).set(user.to_dict())
    return create_access_token(user_id=user.id, role="AGENT")

def test_proxy_media_rejects_malformed_media_id_without_calling_meta(client, agent_token, mocker):
    """
    Meta media IDs are numeric. A malformed id must be rejected with 400
    before it's ever forwarded to Meta's API with our access token.
    """
    client.set_cookie("access_token", agent_token)
    mock_get = mocker.patch("requests.get")

    response = client.get('/api/media/not-a-valid-id;rm -rf')

    assert response.status_code == 400
    assert response.get_json()["status"] == "error"
    mock_get.assert_not_called()

def test_proxy_media_does_not_leak_raw_meta_error_body(client, agent_token, mocker):
    """
    Meta's raw error response body must not be relayed verbatim to the
    client -- log it server-side and return a generic message instead.
    """
    client.set_cookie("access_token", agent_token)

    err_response = requests.Response()
    err_response.status_code = 401
    err_response._content = b'{"error": {"message": "Invalid OAuth access token: super-secret-detail"}}'
    http_error = requests.exceptions.HTTPError(response=err_response)
    mocker.patch("requests.get", side_effect=http_error)

    response = client.get('/api/media/123456789012345')

    assert response.status_code == 401
    body = response.get_json()
    assert body["status"] == "error"
    assert "super-secret-detail" not in body["message"]
