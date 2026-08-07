from flask import Blueprint, jsonify, g, request
from app.core.auth_middleware import require_role
from app.db.firebase import db
from google.cloud.firestore_v1 import Query
from app.services.whatsapp_service import WhatsAppService, ConversationNotFoundError, CustomerNotFoundError

bp = Blueprint('conversations', __name__, url_prefix='/api/conversations')

VALID_CONVERSATION_STATUSES = {"OPEN", "PENDING", "RESOLVED"}

@bp.route('', methods=['GET'])
@require_role('ADMIN', 'MANAGER', 'AGENT')
def get_conversations():
    convs_ref = db.client.collection("conversations")
    docs = convs_ref.order_by("last_message_at", direction=Query.DESCENDING).stream()

    # Round robin means the same few agents repeat across many conversations
    # -- resolve each agent id's name at most once per request rather than on
    # every conversation.
    agent_name_cache: dict[str, str | None] = {}

    conversations = []
    for doc in docs:
        conv = doc.to_dict()
        cust_doc = db.client.collection("customers").document(conv.get("customer_id")).get()
        cust = cust_doc.to_dict() if cust_doc.exists else {}

        last_message_at = conv.get("last_message_at")
        expires_at = conv.get("whatsapp_window_expires_at")

        assigned_agent_id = conv.get("assigned_agent_id")
        assigned_agent_name = None
        if assigned_agent_id:
            if assigned_agent_id not in agent_name_cache:
                agent_doc = db.client.collection("users").document(assigned_agent_id).get()
                agent_name_cache[assigned_agent_id] = agent_doc.to_dict().get("full_name") if agent_doc.exists else None
            assigned_agent_name = agent_name_cache[assigned_agent_id]

        conversations.append({
            "id": conv.get("id"),
            "status": conv.get("status"),
            "tags": conv.get("tags", []),
            "whatsapp_window_expires_at": expires_at.isoformat() if hasattr(expires_at, "isoformat") else str(expires_at) if expires_at else None,
            "unread_count": conv.get("unread_count", 0),
            "last_message_preview": conv.get("last_message_preview"),
            "last_message_at": last_message_at.isoformat() if hasattr(last_message_at, "isoformat") else str(last_message_at) if last_message_at else None,
            "assigned_agent_id": assigned_agent_id,
            "assigned_agent_name": assigned_agent_name,
            "masked_id": cust.get("masked_id"),
            "whatsapp_name": cust.get("whatsapp_name"),
            "profile_photo_url": cust.get("profile_photo_url")
        })

    return jsonify({"status": "success", "data": conversations}), 200

@bp.route('/<conversation_id>/messages', methods=['GET'])
@require_role('ADMIN', 'MANAGER', 'AGENT')
def get_messages(conversation_id):
    conv_doc = db.client.collection("conversations").document(conversation_id).get()
    if not conv_doc.exists:
        return jsonify({"status": "error", "message": "Conversation not found"}), 404

    conv_data = conv_doc.to_dict()
    
    msgs_ref = db.client.collection("messages").where("conversation_id", "==", conversation_id).order_by("timestamp", direction=Query.ASCENDING)
    messages = msgs_ref.stream()

    if conv_data.get("unread_count", 0) > 0:
        db.client.collection("conversations").document(conversation_id).update({"unread_count": 0})

    msg_data = []
    for m_doc in messages:
        msg = m_doc.to_dict()
        ts = msg.get("timestamp")
        msg_data.append({
            "id": msg.get("id"),
            "direction": msg.get("direction"),
            "sender_type": msg.get("sender_type"),
            "message_type": msg.get("message_type"),
            "text_body": msg.get("text_body"),
            "media_url": msg.get("media_url"),
            "media_mime_type": msg.get("media_mime_type"),
            "delivery_status": msg.get("delivery_status"),
            "timestamp": ts.isoformat() if hasattr(ts, "isoformat") else str(ts)
        })

    return jsonify({"status": "success", "data": msg_data}), 200

@bp.route('/<conversation_id>/messages', methods=['POST'])
@require_role('ADMIN', 'MANAGER', 'AGENT')
def send_message(conversation_id):
    from app.db.firebase import db
    from datetime import datetime, timezone
    
    # 24-Hour Rule Check
    conv_doc = db.client.collection("conversations").document(conversation_id).get()
    if not conv_doc.exists:
        return jsonify({"status": "error", "message": "Conversation not found"}), 404
        
    expires_at = conv_doc.to_dict().get("whatsapp_window_expires_at")
    if expires_at:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires_at:
            return jsonify({"status": "error", "message": "The 24-hour WhatsApp window has closed. You cannot send standard messages until the customer replies."}), 403

    try:
        if request.content_type and request.content_type.startswith('multipart/form-data'):
            file = request.files.get('file')
            text = request.form.get('text', '')
            if not file:
                return jsonify({"status": "error", "message": "Missing 'file'"}), 400

            file_bytes = file.read()
            mime_type = file.mimetype
            filename = file.filename
            success, error = WhatsAppService.send_media_message(
                conversation_id, file_bytes, mime_type, filename, text, sender_id=g.current_user.get("id")
            )
        else:
            data = request.get_json()
            if not data or 'text' not in data:
                return jsonify({"status": "error", "message": "Missing 'text' in request body"}), 400

            text = data['text']
            success, error = WhatsAppService.send_message(conversation_id, text, sender_id=g.current_user.get("id"))
    except (ConversationNotFoundError, CustomerNotFoundError) as e:
        return jsonify({"status": "error", "message": str(e)}), 404

    if not success:
        return jsonify({"status": "error", "message": error}), 400

    msg_docs = list(db.client.collection("messages")
        .where("conversation_id", "==", conversation_id)
        .where("direction", "==", "OUTBOUND")
        .order_by("timestamp", direction=Query.DESCENDING)
        .limit(1).stream())

    if not msg_docs:
        return jsonify({"status": "error", "message": "Message was sent but could not be retrieved"}), 500

    msg = msg_docs[0].to_dict()
    ts = msg.get("timestamp")
    
    return jsonify({
        "status": "success",
        "data": {
            "id": msg.get("id"),
            "direction": msg.get("direction"),
            "sender_type": msg.get("sender_type"),
            "message_type": msg.get("message_type"),
            "text_body": msg.get("text_body"),
            "media_url": msg.get("media_url"),
            "media_mime_type": msg.get("media_mime_type"),
            "delivery_status": msg.get("delivery_status"),
            "timestamp": ts.isoformat() if hasattr(ts, "isoformat") else str(ts)
        }
    }), 200

@bp.route('/<conversation_id>/notes', methods=['POST'])
@require_role('ADMIN', 'MANAGER', 'AGENT')
def add_note(conversation_id):
    data = request.get_json()
    if not data or 'text' not in data:
        return jsonify({"status": "error", "message": "Missing 'text' in request body"}), 400

    from app.models.message import Message
    from datetime import datetime, timezone
    
    note_msg = Message(
        conversation_id=conversation_id,
        sender_type="INTERNAL_NOTE",
        sender_id=g.current_user.get("id"),
        message_type="TEXT",
        text_body=data['text'],
        direction=None,
        delivery_status="DELIVERED"
    )
    db.client.collection("messages").document(note_msg.id).set(note_msg.to_dict())

    now = datetime.now(timezone.utc)
    from app.core.socket_events import socketio
    socketio.emit('new_message', {
        'conversation_id': conversation_id,
        'message': {
            'id': note_msg.id,
            'text_body': data['text'],
            'direction': None,
            'sender_type': 'INTERNAL_NOTE',
            'timestamp': now.isoformat()
        }
    })

    return jsonify({
        "status": "success",
        "data": {
            "id": note_msg.id,
            "direction": None,
            "sender_type": "INTERNAL_NOTE",
            "message_type": "TEXT",
            "text_body": data['text'],
            "delivery_status": "DELIVERED",
            "timestamp": now.isoformat()
        }
    }), 200

@bp.route('/<conversation_id>/tags', methods=['PUT'])
@require_role('ADMIN', 'MANAGER', 'AGENT')
def update_tags(conversation_id):
    data = request.get_json()
    if not data or 'tags' not in data:
        return jsonify({"status": "error", "message": "Missing 'tags' in request body"}), 400

    tags = data['tags']
    if not isinstance(tags, list):
        return jsonify({"status": "error", "message": "'tags' must be a list"}), 400

    conv_ref = db.client.collection("conversations").document(conversation_id)
    if not conv_ref.get().exists:
        return jsonify({"status": "error", "message": "Conversation not found"}), 404

    conv_ref.update({"tags": tags})

    return jsonify({
        "status": "success",
        "message": "Tags updated successfully",
        "data": {"tags": tags}
    }), 200

@bp.route('/<conversation_id>/status', methods=['PATCH'])
@require_role('ADMIN', 'MANAGER', 'AGENT')
def update_status(conversation_id):
    data = request.get_json()
    if not data or 'status' not in data:
        return jsonify({"status": "error", "message": "Missing 'status' in request body"}), 400

    new_status = data['status']
    if new_status not in VALID_CONVERSATION_STATUSES:
        return jsonify({
            "status": "error",
            "message": f"'status' must be one of {sorted(VALID_CONVERSATION_STATUSES)}"
        }), 400

    conv_ref = db.client.collection("conversations").document(conversation_id)
    if not conv_ref.get().exists:
        return jsonify({"status": "error", "message": "Conversation not found"}), 404

    conv_ref.update({"status": new_status})

    return jsonify({
        "status": "success",
        "message": "Conversation status updated successfully",
        "data": {"status": new_status}
    }), 200

@bp.route('/<conversation_id>/messages/template', methods=['POST'])
@require_role('ADMIN', 'MANAGER', 'AGENT')
def send_template_message_endpoint(conversation_id):
    data = request.json
    if not data or not data.get('template_name'):
        return jsonify({"status": "error", "message": "template_name is required"}), 400

    template_name = data.get('template_name')
    language_code = data.get('language_code', 'en_US')

    sender_id = g.current_user.get("id")

    try:
        success, err = WhatsAppService.send_template_message(
            conversation_id=conversation_id,
            template_name=template_name,
            language_code=language_code,
            sender_id=sender_id
        )
    except (ConversationNotFoundError, CustomerNotFoundError) as e:
        return jsonify({"status": "error", "message": str(e)}), 404

    if not success:
        return jsonify({"status": "error", "message": f"Failed to send template: {err}"}), 400

    msg_docs = list(db.client.collection("messages")
        .where("conversation_id", "==", conversation_id)
        .where("direction", "==", "OUTBOUND")
        .order_by("timestamp", direction=Query.DESCENDING)
        .limit(1).stream())

    if not msg_docs:
        return jsonify({"status": "error", "message": "Template sent but could not retrieve message"}), 500

    msg = msg_docs[0].to_dict()
    ts = msg.get("timestamp")

    return jsonify({
        "status": "success",
        "data": {
            "id": msg.get("id"),
            "direction": msg.get("direction"),
            "sender_type": msg.get("sender_type"),
            "message_type": msg.get("message_type"),
            "text_body": msg.get("text_body"),
            "delivery_status": msg.get("delivery_status"),
            "timestamp": ts.isoformat() if hasattr(ts, "isoformat") else str(ts)
        }
    }), 200
