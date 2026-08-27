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

def test_admin_gets_audit_logs(client, admin_token, mock_db_client):
    from datetime import datetime, timezone

    docs = list(mock_db_client.collection("users").where("email", "==", "admin@test.com").limit(1).stream())
    admin_id = docs[0].to_dict()["id"]

    mock_db_client.collection("audit_logs").add({
        "user_id": admin_id,
        "action": "REVEAL_NUMBER",
        "entity_type": "CUSTOMER",
        "entity_id": "cust-1",
        "ip_address": "127.0.0.1",
        "timestamp": datetime(2026, 1, 1, tzinfo=timezone.utc)
    })
    mock_db_client.collection("audit_logs").add({
        "user_id": admin_id,
        "action": "REVEAL_NUMBER",
        "entity_type": "CUSTOMER",
        "entity_id": "cust-2",
        "ip_address": "127.0.0.1",
        "timestamp": datetime(2026, 1, 2, tzinfo=timezone.utc)
    })

    client.set_cookie("access_token", admin_token)
    response = client.get('/api/admin/audit-logs')

    assert response.status_code == 200
    body = response.get_json()
    assert body["status"] == "success"
    entries = body["data"]
    assert len(entries) == 2
    # Newest first.
    assert entries[0]["entity_id"] == "cust-2"
    assert entries[1]["entity_id"] == "cust-1"
    assert entries[0]["action"] == "REVEAL_NUMBER"
    assert entries[0]["user"]["full_name"] == "Admin User"
    assert entries[0]["user"]["email"] == "admin@test.com"

def test_agent_cannot_get_audit_logs(client, agent_token):
    client.set_cookie("access_token", agent_token)
    response = client.get('/api/admin/audit-logs')
    assert response.status_code == 403

def test_audit_logs_no_cookie(client):
    response = client.get('/api/admin/audit-logs')
    assert response.status_code == 401

def test_audit_log_entry_survives_deleted_user(client, admin_token, mock_db_client):
    """
    A user who performed an action may later be deleted -- the log entry
    must still render instead of erroring or vanishing.
    """
    from datetime import datetime, timezone

    mock_db_client.collection("audit_logs").add({
        "user_id": "long-gone-user-id",
        "action": "REVEAL_NUMBER",
        "entity_type": "CUSTOMER",
        "entity_id": "cust-3",
        "ip_address": "127.0.0.1",
        "timestamp": datetime(2026, 1, 3, tzinfo=timezone.utc)
    })

    client.set_cookie("access_token", admin_token)
    response = client.get('/api/admin/audit-logs')

    assert response.status_code == 200
    entries = response.get_json()["data"]
    assert entries[0]["user"]["full_name"] == "Unknown User"

def test_get_audit_logs_does_not_leak_raw_exception_text(client, admin_token, mock_db_client, mocker):
    client.set_cookie("access_token", admin_token)
    real_collection = mock_db_client.collection
    def flaky_collection(name):
        if name == "users":
            return real_collection(name)
        raise RuntimeError("super secret internal connection string leaked here")
    mocker.patch("app.api.admin.db.client.collection", side_effect=flaky_collection)

    response = client.get('/api/admin/audit-logs')

    assert response.status_code == 500
    body = response.get_json()
    assert body["status"] == "error"
    assert "super secret internal connection string" not in body["message"]

def _make_conversation_with_messages(mock_db_client, customer_email_seed, message_specs):
    """
    message_specs: list of (sender_type, direction, timestamp) tuples.
    """
    from app.models.customer import Customer
    from app.models.conversation import Conversation
    from app.models.message import Message
    from app.core.security import encrypt_phone, hash_phone

    customer = Customer(
        phone_hash=hash_phone(customer_email_seed),
        real_phone_number_encrypted=encrypt_phone(customer_email_seed),
        masked_id=f"Lead-{customer_email_seed}"
    )
    mock_db_client.collection("customers").document(customer.id).set(customer.to_dict())
    conv = Conversation(customer_id=customer.id)
    mock_db_client.collection("conversations").document(conv.id).set(conv.to_dict())

    for sender_type, direction, ts in message_specs:
        msg = Message(
            conversation_id=conv.id, sender_type=sender_type, message_type="TEXT",
            direction=direction, delivery_status="DELIVERED", timestamp=ts
        )
        mock_db_client.collection("messages").document(msg.id).set(msg.to_dict())

    return conv.id

def test_get_analytics_includes_avg_response_time(client, admin_token, mock_db_client):
    from datetime import datetime, timezone, timedelta

    t0 = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    _make_conversation_with_messages(mock_db_client, "resp1", [
        ("CUSTOMER", "INBOUND", t0),
        ("AGENT", "OUTBOUND", t0 + timedelta(minutes=5)),
    ])

    client.set_cookie("access_token", admin_token)
    response = client.get('/api/admin/analytics')

    assert response.status_code == 200
    assert response.get_json()["data"]["avg_response_time_seconds"] == 300

def test_get_analytics_averages_across_multiple_response_pairs(client, admin_token, mock_db_client):
    from datetime import datetime, timezone, timedelta

    t0 = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    _make_conversation_with_messages(mock_db_client, "resp2", [
        ("CUSTOMER", "INBOUND", t0),
        ("AGENT", "OUTBOUND", t0 + timedelta(minutes=2)),   # 120s
        ("CUSTOMER", "INBOUND", t0 + timedelta(minutes=10)),
        ("AGENT", "OUTBOUND", t0 + timedelta(minutes=14)),  # 240s
    ])

    client.set_cookie("access_token", admin_token)
    response = client.get('/api/admin/analytics')

    assert response.status_code == 200
    # Average of 120s and 240s = 180s
    assert response.get_json()["data"]["avg_response_time_seconds"] == 180

def test_get_analytics_response_time_null_when_no_agent_replies(client, admin_token, mock_db_client):
    from datetime import datetime, timezone

    t0 = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    _make_conversation_with_messages(mock_db_client, "resp3", [
        ("CUSTOMER", "INBOUND", t0),
    ])

    client.set_cookie("access_token", admin_token)
    response = client.get('/api/admin/analytics')

    assert response.status_code == 200
    assert response.get_json()["data"]["avg_response_time_seconds"] is None

def test_get_analytics_response_time_pools_across_conversations(client, admin_token, mock_db_client):
    from datetime import datetime, timezone, timedelta

    t0 = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    _make_conversation_with_messages(mock_db_client, "resp4a", [
        ("CUSTOMER", "INBOUND", t0),
        ("AGENT", "OUTBOUND", t0 + timedelta(minutes=1)),  # 60s
    ])
    _make_conversation_with_messages(mock_db_client, "resp4b", [
        ("CUSTOMER", "INBOUND", t0),
        ("AGENT", "OUTBOUND", t0 + timedelta(minutes=3)),  # 180s
    ])

    client.set_cookie("access_token", admin_token)
    response = client.get('/api/admin/analytics')

    assert response.status_code == 200
    # (60 + 180) / 2 = 120
    assert response.get_json()["data"]["avg_response_time_seconds"] == 120

def test_get_business_settings_returns_defaults_when_unset(client, admin_token):
    client.set_cookie("access_token", admin_token)
    response = client.get('/api/admin/business-settings')

    assert response.status_code == 200
    data = response.get_json()["data"]
    assert data["business_hours_start"] is None
    assert data["business_hours_end"] is None
    assert data["timezone"] == "UTC"
    assert data["out_of_office_message"] is None
    assert data["first_greeting_message"] is None
    assert data["round_robin_enabled"] is True

def test_admin_updates_business_settings(client, admin_token, mock_db_client):
    client.set_cookie("access_token", admin_token)
    response = client.put('/api/admin/business-settings', json={
        "business_hours_start": "09:00",
        "business_hours_end": "17:00",
        "timezone": "Asia/Kolkata",
        "out_of_office_message": "We're closed right now, back at 9am!",
        "first_greeting_message": "Welcome to TutorSolve!",
        "round_robin_enabled": False
    })

    assert response.status_code == 200
    data = response.get_json()["data"]
    assert data["business_hours_start"] == "09:00"
    assert data["round_robin_enabled"] is False

    saved = mock_db_client.collection("business_settings").document("global_config").get().to_dict()
    assert saved["first_greeting_message"] == "Welcome to TutorSolve!"
    assert saved["round_robin_enabled"] is False

def test_update_business_settings_rejects_invalid_time_format(client, admin_token):
    client.set_cookie("access_token", admin_token)
    response = client.put('/api/admin/business-settings', json={
        "business_hours_start": "9am",
        "business_hours_end": "17:00"
    })
    assert response.status_code == 400

def test_update_business_settings_rejects_non_bool_round_robin(client, admin_token):
    client.set_cookie("access_token", admin_token)
    response = client.put('/api/admin/business-settings', json={"round_robin_enabled": "yes"})
    assert response.status_code == 400

def test_update_business_settings_rejects_unknown_timezone(client, admin_token):
    client.set_cookie("access_token", admin_token)
    response = client.put('/api/admin/business-settings', json={"timezone": "Mars/OlympusMons"})
    assert response.status_code == 400

def test_agent_cannot_get_business_settings(client, agent_token):
    client.set_cookie("access_token", agent_token)
    response = client.get('/api/admin/business-settings')
    assert response.status_code == 403

def test_agent_cannot_update_business_settings(client, agent_token):
    client.set_cookie("access_token", agent_token)
    response = client.put('/api/admin/business-settings', json={"round_robin_enabled": False})
    assert response.status_code == 403

def test_get_business_settings_does_not_leak_raw_exception_text(client, admin_token, mock_db_client, mocker):
    client.set_cookie("access_token", admin_token)
    real_collection = mock_db_client.collection
    def flaky_collection(name):
        if name == "users":
            return real_collection(name)
        raise RuntimeError("super secret internal connection string leaked here")
    mocker.patch("app.api.admin.db.client.collection", side_effect=flaky_collection)

    response = client.get('/api/admin/business-settings')

    assert response.status_code == 500
    body = response.get_json()
    assert body["status"] == "error"
    assert "super secret internal connection string" not in body["message"]

def test_admin_creates_meta_template(client, admin_token, mock_db_client):
    client.set_cookie("access_token", admin_token)
    response = client.post('/api/admin/meta-templates', json={
        "template_name": "order_confirmation",
        "meta_template_id": "1122334455",
        "language_code": "en_US",
        "body": "Your order {{1}} has shipped!"
    })

    assert response.status_code == 201
    data = response.get_json()["data"]
    assert data["template_name"] == "order_confirmation"
    assert data["status"] == "APPROVED"

    saved = list(mock_db_client.collection("meta_templates").stream())
    assert len(saved) == 1

def test_create_meta_template_missing_fields(client, admin_token):
    client.set_cookie("access_token", admin_token)
    response = client.post('/api/admin/meta-templates', json={"template_name": "incomplete"})
    assert response.status_code == 400

def test_agent_cannot_create_meta_template(client, agent_token):
    client.set_cookie("access_token", agent_token)
    response = client.post('/api/admin/meta-templates', json={
        "template_name": "x", "language_code": "en_US"
    })
    assert response.status_code == 403

def test_agent_can_list_meta_templates(client, agent_token, mock_db_client):
    mock_db_client.collection("meta_templates").document("t1").set({
        "id": "t1", "template_name": "hello_world", "meta_template_id": "9988776655",
        "language_code": "en_US", "status": "APPROVED", "body": "Hi!"
    })

    client.set_cookie("access_token", agent_token)
    response = client.get('/api/admin/meta-templates')

    assert response.status_code == 200
    data = response.get_json()["data"]
    assert len(data) == 1
    assert data[0]["template_name"] == "hello_world"

def test_admin_deletes_meta_template(client, admin_token, mock_db_client):
    mock_db_client.collection("meta_templates").document("t2").set({
        "id": "t2", "template_name": "to_delete", "language_code": "en_US", "status": "APPROVED"
    })

    client.set_cookie("access_token", admin_token)
    response = client.delete('/api/admin/meta-templates/t2')

    assert response.status_code == 200
    assert mock_db_client.collection("meta_templates").document("t2").get().exists is False

def test_agent_cannot_delete_meta_template(client, agent_token):
    client.set_cookie("access_token", agent_token)
    response = client.delete('/api/admin/meta-templates/t2')
    assert response.status_code == 403

def test_admin_creates_tag(client, admin_token, mock_db_client):
    client.set_cookie("access_token", admin_token)
    response = client.post('/api/admin/tags', json={"name": "VIP", "color_hex": "#FF0000"})

    assert response.status_code == 201
    data = response.get_json()["data"]
    assert data["name"] == "VIP"
    assert data["color_hex"] == "#FF0000"

    saved = list(mock_db_client.collection("tags").stream())
    assert len(saved) == 1

def test_create_tag_missing_fields(client, admin_token):
    client.set_cookie("access_token", admin_token)
    response = client.post('/api/admin/tags', json={"name": "Incomplete"})
    assert response.status_code == 400

def test_create_tag_rejects_invalid_color_hex(client, admin_token):
    client.set_cookie("access_token", admin_token)
    response = client.post('/api/admin/tags', json={"name": "Bad Color", "color_hex": "red"})
    assert response.status_code == 400

def test_create_tag_rejects_duplicate_name(client, admin_token, mock_db_client):
    mock_db_client.collection("tags").document("existing").set({"id": "existing", "name": "VIP", "color_hex": "#111111"})

    client.set_cookie("access_token", admin_token)
    response = client.post('/api/admin/tags', json={"name": "VIP", "color_hex": "#222222"})
    assert response.status_code == 400

def test_agent_cannot_create_tag(client, agent_token):
    client.set_cookie("access_token", agent_token)
    response = client.post('/api/admin/tags', json={"name": "x", "color_hex": "#111111"})
    assert response.status_code == 403

def test_agent_can_list_tags(client, agent_token, mock_db_client):
    mock_db_client.collection("tags").document("t1").set({"id": "t1", "name": "VIP", "color_hex": "#FF0000"})

    client.set_cookie("access_token", agent_token)
    response = client.get('/api/admin/tags')

    assert response.status_code == 200
    data = response.get_json()["data"]
    assert len(data) == 1
    assert data[0]["name"] == "VIP"

def test_admin_deletes_tag(client, admin_token, mock_db_client):
    mock_db_client.collection("tags").document("t2").set({"id": "t2", "name": "to_delete", "color_hex": "#111111"})

    client.set_cookie("access_token", admin_token)
    response = client.delete('/api/admin/tags/t2')

    assert response.status_code == 200
    assert mock_db_client.collection("tags").document("t2").get().exists is False

def test_agent_cannot_delete_tag(client, agent_token):
    client.set_cookie("access_token", agent_token)
    response = client.delete('/api/admin/tags/t2')
    assert response.status_code == 403
