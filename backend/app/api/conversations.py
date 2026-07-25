from flask import Blueprint, jsonify, g
from app.core.auth_middleware import require_role
from app.db.database import db
from app.models.conversation import Conversation
from app.models.customer import Customer
from app.models.message import Message

bp = Blueprint('conversations', __name__, url_prefix='/api/conversations')

@bp.route('', methods=['GET'])
@require_role('ADMIN', 'MANAGER', 'AGENT')
def get_conversations():
    # Join with Customer to get masked PII securely
    results = db.session.execute(
        db.select(Conversation, Customer.masked_id, Customer.whatsapp_name, Customer.profile_photo_url)
        .join(Customer, Conversation.customer_id == Customer.id)
        .order_by(Conversation.last_message_at.desc().nullslast())
    ).all()

    conversations = []
    for conv, masked_id, whatsapp_name, profile_photo_url in results:
        data = {
            "id": conv.id,
            "status": conv.status,
            "unread_count": conv.unread_count,
            "last_message_preview": conv.last_message_preview,
            "last_message_at": conv.last_message_at.isoformat() if conv.last_message_at else None,
            "assigned_agent_id": conv.assigned_agent_id,
            "masked_id": masked_id,
            "whatsapp_name": whatsapp_name,
            "profile_photo_url": profile_photo_url
        }
        conversations.append(data)

    return jsonify({"status": "success", "data": conversations}), 200

@bp.route('/<conversation_id>/messages', methods=['GET'])
@require_role('ADMIN', 'MANAGER', 'AGENT')
def get_messages(conversation_id):
    conv = db.session.get(Conversation, conversation_id)
    if not conv:
        return jsonify({"status": "error", "message": "Conversation not found"}), 404

    messages = db.session.execute(
        db.select(Message)
        .filter_by(conversation_id=conversation_id)
        .order_by(Message.timestamp.asc())
    ).scalars().all()

    # Opening a chat is how an agent acknowledges the customer's unread messages.
    if conv.unread_count:
        conv.unread_count = 0
        db.session.commit()

    msg_data = [{
        "id": msg.id,
        "direction": msg.direction,
        "sender_type": msg.sender_type,
        "message_type": msg.message_type,
        "text_body": msg.text_body,
        "delivery_status": msg.delivery_status,
        "timestamp": msg.timestamp.isoformat()
    } for msg in messages]

    return jsonify({"status": "success", "data": msg_data}), 200

@bp.route('/<conversation_id>/messages', methods=['POST'])
@require_role('ADMIN', 'MANAGER', 'AGENT')
def send_message(conversation_id):
    from flask import request
    from app.services.whatsapp_service import WhatsAppService

    data = request.get_json()
    if not data or 'text' not in data:
        return jsonify({"status": "error", "message": "Missing 'text' in request body"}), 400

    text = data['text']

    conv = db.session.get(Conversation, conversation_id)
    if not conv:
        return jsonify({"status": "error", "message": "Conversation not found"}), 404

    success, error = WhatsAppService.send_message(conversation_id, text, sender_id=g.current_user.id)
    if not success:
        return jsonify({"status": "error", "message": error}), 400

    # The message should have been saved to the DB by the service
    msg = db.session.execute(
        db.select(Message)
        .filter_by(conversation_id=conversation_id, direction="OUTBOUND")
        .order_by(Message.timestamp.desc())
    ).scalars().first()

    if not msg:
        return jsonify({"status": "error", "message": "Message was sent but could not be retrieved"}), 500

    return jsonify({
        "status": "success",
        "data": {
            "id": msg.id,
            "direction": msg.direction,
            "sender_type": msg.sender_type,
            "message_type": msg.message_type,
            "text_body": msg.text_body,
            "delivery_status": msg.delivery_status,
            "timestamp": msg.timestamp.isoformat()
        }
    }), 200
