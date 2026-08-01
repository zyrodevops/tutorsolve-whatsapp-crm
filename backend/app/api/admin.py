import logging
from flask import Blueprint, jsonify, request, g
from app.db.firebase import db
from firebase_admin import firestore
from app.core.security import decrypt_phone
from app.core.auth_middleware import require_role
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

bp = Blueprint('admin', __name__, url_prefix='/api/admin')
GENERIC_ERROR_MESSAGE = "An unexpected error occurred. Please try again."

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

        return jsonify({
            "status": "success",
            "data": {
                "total_agents": total_agents,
                "online_agents": online_agents,
                "total_conversations": total_conversations,
                "open_conversations": open_conversations,
                "resolved_conversations": resolved_conversations
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

@bp.route('/quick-replies/<reply_id>', methods=['DELETE'])
@require_role('ADMIN')
def delete_quick_reply(reply_id):
    try:
        db.client.collection("quick_replies").document(reply_id).delete()
        return jsonify({"status": "success"}), 200
    except Exception:
        logger.exception("Unexpected error in %s", request.path)
        return jsonify({"status": "error", "message": GENERIC_ERROR_MESSAGE}), 500

