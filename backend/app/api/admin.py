import logging
import re
from flask import Blueprint, jsonify, request, g
from app.db.firebase import db
from firebase_admin import firestore
from google.cloud.firestore_v1 import Query
from app.core.security import decrypt_phone
from app.core.auth_middleware import require_role
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

bp = Blueprint('admin', __name__, url_prefix='/api/admin')
GENERIC_ERROR_MESSAGE = "An unexpected error occurred. Please try again."

def _as_utc(dt):
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt

def _calculate_avg_response_time_seconds() -> float | None:
    """
    Pools every (customer message -> next agent reply) gap across all
    conversations into one average, rather than averaging per-conversation
    averages -- a conversation with many quick exchanges should weigh in
    proportionally to how many replies it took, not get diluted to one point.
    """
    response_gaps_seconds = []
    conversations = db.client.collection("conversations").stream()
    for conv in conversations:
        msgs = (
            db.client.collection("messages")
            .where("conversation_id", "==", conv.id)
            .order_by("timestamp", direction=Query.ASCENDING)
            .stream()
        )
        pending_customer_ts = None
        for m_doc in msgs:
            m = m_doc.to_dict()
            if m.get("sender_type") == "CUSTOMER" and m.get("direction") == "INBOUND":
                if pending_customer_ts is None:
                    pending_customer_ts = m.get("timestamp")
            elif m.get("sender_type") == "AGENT" and m.get("direction") == "OUTBOUND":
                if pending_customer_ts is not None:
                    delta = (_as_utc(m.get("timestamp")) - _as_utc(pending_customer_ts)).total_seconds()
                    if delta >= 0:
                        response_gaps_seconds.append(delta)
                    pending_customer_ts = None

    if not response_gaps_seconds:
        return None
    return sum(response_gaps_seconds) / len(response_gaps_seconds)

@bp.route('/analytics', methods=['GET'])
@require_role('ADMIN')
def get_analytics():
    try:
        users = list(db.client.collection("users").stream())
        total_agents = len([u for u in users if u.to_dict().get("role") == "AGENT"])
        online_agents = len([u for u in users if u.to_dict().get("role") == "AGENT" and u.to_dict().get("agent_status") == "ONLINE"])

        conversations = list(db.client.collection("conversations").stream())
        total_conversations = len(conversations)
        open_conversations = len([c for c in conversations if c.to_dict().get("status") == "OPEN"])
        resolved_conversations = len([c for c in conversations if c.to_dict().get("status") == "RESOLVED"])

        avg_response_time_seconds = _calculate_avg_response_time_seconds()

        return jsonify({
            "status": "success",
            "data": {
                "total_agents": total_agents,
                "online_agents": online_agents,
                "total_conversations": total_conversations,
                "open_conversations": open_conversations,
                "resolved_conversations": resolved_conversations,
                "avg_response_time_seconds": avg_response_time_seconds
            }
        }), 200
    except Exception:
        logger.exception("Unexpected error in %s", request.path)
        return jsonify({"status": "error", "message": GENERIC_ERROR_MESSAGE}), 500

@bp.route('/reveal-number', methods=['POST'])
@require_role('ADMIN')
def reveal_number():
    data = request.get_json()
    if not data or 'conversation_id' not in data:
        return jsonify({"status": "error", "message": "Missing conversation_id"}), 400
        
    conversation_id = data['conversation_id']
    
    try:
        conv_doc = db.client.collection("conversations").document(conversation_id).get()
        if not conv_doc.exists:
            return jsonify({"status": "error", "message": "Conversation not found"}), 404
            
        customer_id = conv_doc.to_dict().get("customer_id")
        
        customer_doc = db.client.collection("customers").document(customer_id).get()
        if not customer_doc.exists:
            return jsonify({"status": "error", "message": "Customer not found"}), 404
            
        encrypted_phone = customer_doc.to_dict().get("real_phone_number_encrypted")
        if not encrypted_phone:
            return jsonify({"status": "error", "message": "No phone number available"}), 404
            
        try:
            real_phone = decrypt_phone(encrypted_phone)
        except ValueError:
            real_phone = encrypted_phone
        
        # Log to audit_logs
        db.client.collection("audit_logs").add({
            "user_id": g.current_user["id"],
            "action": "REVEAL_NUMBER",
            "entity_type": "CUSTOMER",
            "entity_id": customer_id,
            "ip_address": request.remote_addr or "unknown",
            "timestamp": datetime.now(timezone.utc)
        })
        
        return jsonify({
            "status": "success",
            "data": {
                "real_phone_number": real_phone
            }
        }), 200
    except Exception:
        logger.exception("Unexpected error in %s", request.path)
        return jsonify({"status": "error", "message": GENERIC_ERROR_MESSAGE}), 500

BUSINESS_SETTINGS_DOC_ID = "global_config"
BUSINESS_SETTINGS_DEFAULTS = {
    "business_hours_start": None,
    "business_hours_end": None,
    "timezone": "UTC",
    "out_of_office_message": None,
    "first_greeting_message": None,
    "round_robin_enabled": True,
}
TIME_FORMAT_PATTERN = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")

@bp.route('/business-settings', methods=['GET'])
@require_role('ADMIN')
def get_business_settings():
    try:
        doc = db.client.collection("business_settings").document(BUSINESS_SETTINGS_DOC_ID).get()
        settings = {**BUSINESS_SETTINGS_DEFAULTS, **(doc.to_dict() if doc.exists else {})}
        return jsonify({"status": "success", "data": settings}), 200
    except Exception:
        logger.exception("Unexpected error in %s", request.path)
        return jsonify({"status": "error", "message": GENERIC_ERROR_MESSAGE}), 500

@bp.route('/business-settings', methods=['PUT'])
@require_role('ADMIN')
def update_business_settings():
    data = request.get_json()
    if not data:
        return jsonify({"status": "error", "message": "Missing request body"}), 400

    updates = {}

    for field in ("business_hours_start", "business_hours_end"):
        if field in data:
            value = data[field]
            if value is not None:
                if not isinstance(value, str) or not TIME_FORMAT_PATTERN.match(value):
                    return jsonify({"status": "error", "message": f"'{field}' must be in HH:MM 24-hour format"}), 400
            updates[field] = value

    if "timezone" in data:
        tz_value = data["timezone"]
        if tz_value is not None:
            from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
            try:
                ZoneInfo(tz_value)
            except (ZoneInfoNotFoundError, ValueError):
                return jsonify({"status": "error", "message": "Unknown timezone"}), 400
        updates["timezone"] = tz_value

    for field in ("out_of_office_message", "first_greeting_message"):
        if field in data:
            value = data[field]
            if value is not None and not isinstance(value, str):
                return jsonify({"status": "error", "message": f"'{field}' must be a string"}), 400
            updates[field] = value

    if "round_robin_enabled" in data:
        value = data["round_robin_enabled"]
        if not isinstance(value, bool):
            return jsonify({"status": "error", "message": "'round_robin_enabled' must be a boolean"}), 400
        updates["round_robin_enabled"] = value

    try:
        db.client.collection("business_settings").document(BUSINESS_SETTINGS_DOC_ID).set(updates, merge=True)
        doc = db.client.collection("business_settings").document(BUSINESS_SETTINGS_DOC_ID).get()
        settings = {**BUSINESS_SETTINGS_DEFAULTS, **doc.to_dict()}
        return jsonify({"status": "success", "message": "Business settings updated", "data": settings}), 200
    except Exception:
        logger.exception("Unexpected error in %s", request.path)
        return jsonify({"status": "error", "message": GENERIC_ERROR_MESSAGE}), 500

@bp.route('/quick-replies', methods=['GET'])
@require_role('ADMIN', 'MANAGER', 'AGENT')
def get_quick_replies():
    try:
        docs = db.client.collection("quick_replies").stream()
        replies = [{"id": doc.id, **doc.to_dict()} for doc in docs]
        return jsonify({"status": "success", "data": replies}), 200
    except Exception:
        logger.exception("Unexpected error in %s", request.path)
        return jsonify({"status": "error", "message": GENERIC_ERROR_MESSAGE}), 500

@bp.route('/quick-replies', methods=['POST'])
@require_role('ADMIN')
def create_quick_reply():
    data = request.get_json()
    if not data or 'shortcut' not in data or 'message' not in data:
        return jsonify({"status": "error", "message": "Missing shortcut or message"}), 400
    
    try:
        doc_ref = db.client.collection("quick_replies").document()
        reply_data = {
            "shortcut": data["shortcut"].lower(),
            "message": data["message"],
            "created_by": g.current_user["id"],
            "created_at": datetime.now(timezone.utc)
        }
        doc_ref.set(reply_data)
        return jsonify({"status": "success", "data": {"id": doc_ref.id, **reply_data}}), 201
    except Exception:
        logger.exception("Unexpected error in %s", request.path)
        return jsonify({"status": "error", "message": GENERIC_ERROR_MESSAGE}), 500

@bp.route('/audit-logs', methods=['GET'])
@require_role('ADMIN')
def get_audit_logs():
    try:
        limit = min(int(request.args.get('limit', 200)), 500)
        docs = list(
            db.client.collection("audit_logs")
            .order_by("timestamp", direction=Query.DESCENDING)
            .limit(limit)
            .stream()
        )

        user_cache: dict[str, dict] = {}
        entries = []
        for doc in docs:
            entry = doc.to_dict()
            user_id = entry.get("user_id")

            if user_id not in user_cache:
                user_doc = db.client.collection("users").document(user_id).get() if user_id else None
                if user_doc is not None and user_doc.exists:
                    u = user_doc.to_dict()
                    user_cache[user_id] = {"full_name": u.get("full_name"), "email": u.get("email")}
                else:
                    user_cache[user_id] = {"full_name": "Unknown User", "email": None}

            timestamp = entry.get("timestamp")
            entries.append({
                "id": doc.id,
                "action": entry.get("action"),
                "entity_type": entry.get("entity_type"),
                "entity_id": entry.get("entity_id"),
                "ip_address": entry.get("ip_address"),
                "timestamp": timestamp.isoformat() if hasattr(timestamp, "isoformat") else str(timestamp),
                "user": user_cache[user_id]
            })

        return jsonify({"status": "success", "data": entries}), 200
    except Exception:
        logger.exception("Unexpected error in %s", request.path)
        return jsonify({"status": "error", "message": GENERIC_ERROR_MESSAGE}), 500

@bp.route('/meta-templates', methods=['GET'])
@require_role('ADMIN', 'MANAGER', 'AGENT')
def get_meta_templates():
    try:
        docs = db.client.collection("meta_templates").stream()
        templates = [{"id": doc.id, **doc.to_dict()} for doc in docs]
        return jsonify({"status": "success", "data": templates}), 200
    except Exception:
        logger.exception("Unexpected error in %s", request.path)
        return jsonify({"status": "error", "message": GENERIC_ERROR_MESSAGE}), 500

@bp.route('/meta-templates', methods=['POST'])
@require_role('ADMIN')
def create_meta_template():
    data = request.get_json()
    if not data or not data.get('template_name') or not data.get('language_code'):
        return jsonify({"status": "error", "message": "Missing template_name or language_code"}), 400

    try:
        doc_ref = db.client.collection("meta_templates").document()
        template_data = {
            "template_name": data["template_name"],
            "meta_template_id": data.get("meta_template_id", ""),
            "language_code": data["language_code"],
            "body": data.get("body", ""),
            # Templates recorded here have already been approved through Meta
            # Business Manager -- this app doesn't submit new templates for
            # approval, it just mirrors ones the admin knows are usable.
            "status": "APPROVED",
        }
        doc_ref.set(template_data)
        return jsonify({"status": "success", "data": {"id": doc_ref.id, **template_data}}), 201
    except Exception:
        logger.exception("Unexpected error in %s", request.path)
        return jsonify({"status": "error", "message": GENERIC_ERROR_MESSAGE}), 500

@bp.route('/meta-templates/<template_id>', methods=['DELETE'])
@require_role('ADMIN')
def delete_meta_template(template_id):
    try:
        db.client.collection("meta_templates").document(template_id).delete()
        return jsonify({"status": "success"}), 200
    except Exception:
        logger.exception("Unexpected error in %s", request.path)
        return jsonify({"status": "error", "message": GENERIC_ERROR_MESSAGE}), 500

COLOR_HEX_PATTERN = re.compile(r"^#[0-9A-Fa-f]{6}$")

@bp.route('/tags', methods=['GET'])
@require_role('ADMIN', 'MANAGER', 'AGENT')
def get_tags():
    try:
        docs = db.client.collection("tags").stream()
        tags = [{"id": doc.id, **doc.to_dict()} for doc in docs]
        return jsonify({"status": "success", "data": tags}), 200
    except Exception:
        logger.exception("Unexpected error in %s", request.path)
        return jsonify({"status": "error", "message": GENERIC_ERROR_MESSAGE}), 500

@bp.route('/tags', methods=['POST'])
@require_role('ADMIN')
def create_tag():
    data = request.get_json()
    if not data or not data.get('name') or not data.get('color_hex'):
        return jsonify({"status": "error", "message": "Missing name or color_hex"}), 400

    if not COLOR_HEX_PATTERN.match(data['color_hex']):
        return jsonify({"status": "error", "message": "'color_hex' must be a hex color like #FF0000"}), 400

    name = data['name'].strip()
    if not name:
        return jsonify({"status": "error", "message": "Missing name or color_hex"}), 400

    try:
        existing = list(db.client.collection("tags").where("name", "==", name).limit(1).stream())
        if existing:
            return jsonify({"status": "error", "message": f"A tag named '{name}' already exists"}), 400

        doc_ref = db.client.collection("tags").document()
        tag_data = {"name": name, "color_hex": data['color_hex']}
        doc_ref.set(tag_data)
        return jsonify({"status": "success", "data": {"id": doc_ref.id, **tag_data}}), 201
    except Exception:
        logger.exception("Unexpected error in %s", request.path)
        return jsonify({"status": "error", "message": GENERIC_ERROR_MESSAGE}), 500

@bp.route('/tags/<tag_id>', methods=['DELETE'])
@require_role('ADMIN')
def delete_tag(tag_id):
    try:
        db.client.collection("tags").document(tag_id).delete()
        return jsonify({"status": "success"}), 200
    except Exception:
        logger.exception("Unexpected error in %s", request.path)
        return jsonify({"status": "error", "message": GENERIC_ERROR_MESSAGE}), 500

@bp.route('/quick-replies/<reply_id>', methods=['DELETE'])
@require_role('ADMIN')
def delete_quick_reply(reply_id):
    try:
        db.client.collection("quick_replies").document(reply_id).delete()
        return jsonify({"status": "success"}), 200
    except Exception:
        logger.exception("Unexpected error in %s", request.path)
        return jsonify({"status": "error", "message": GENERIC_ERROR_MESSAGE}), 500

