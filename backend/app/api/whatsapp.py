import logging
from flask import Blueprint, request, Response, jsonify
from app.core.config import WHATSAPP_VERIFY_TOKEN
from app.schemas.whatsapp import WebhookPayloadSchema
from marshmallow import ValidationError

logger = logging.getLogger(__name__)

# Webhooks are an exception to the standard /api prefix (API_GUIDELINES.md #5).
bp = Blueprint('whatsapp', __name__)
webhook_schema = WebhookPayloadSchema()

@bp.route('/webhook', methods=['GET', 'POST'])
def webhook():
    if request.method == 'GET':
        """
        Meta Webhook Verification Handshake.
        """
        mode = request.args.get('hub.mode')
        token = request.args.get('hub.verify_token')
        challenge = request.args.get('hub.challenge')

        if not mode or not token:
            return Response("Missing parameters", status=400)

        if mode == 'subscribe' and token == WHATSAPP_VERIFY_TOKEN:
            return Response(challenge, status=200, mimetype='text/plain')
        
        return Response("Verification failed", status=403)

    if request.method == 'POST':
        """
        Meta Incoming Webhook Payload.
        """
        payload = request.get_json() or {}
        
        # 1. Validate strict JSON structure
        try:
            data = webhook_schema.load(payload)
        except ValidationError as err:
            return jsonify({"status": "error", "message": "Invalid payload structure", "errors": err.messages}), 400

        # 2. Extract data safely
        try:
            entry = data['entry'][0]
            change = entry['changes'][0]
            value = change['value']

            # Edge Case 1: Status Updates (read receipts, delivery)
            if 'statuses' in value and value['statuses']:
                return jsonify({"status": "ignored", "reason": "status_update"}), 200

            # Happy Path: Message exists
            if 'messages' in value and value['messages']:
                message = value['messages'][0]

                msg_type = message['type']
                
                # Valid message types we support
                supported_types = ['text', 'image', 'video', 'document', 'audio']
                if msg_type not in supported_types:
                    return jsonify({"status": "ignored", "reason": f"unsupported_type_{msg_type}"}), 200

                contact = value['contacts'][0]
                phone = contact['wa_id']
                name = contact['profile']['name']
                meta_message_id = message['id']
                
                text_body = None
                media_id = None
                mime_type = None
                
                if msg_type == 'text':
                    text_body = message['text']['body']
                else:
                    media_id = message[msg_type]['id']
                    mime_type = message[msg_type].get('mime_type')
                    text_body = message[msg_type].get('caption', '')

                from app.services.whatsapp_service import WhatsAppService
                try:
                    WhatsAppService.process_incoming_message(
                        phone=phone, name=name, text=text_body, meta_message_id=meta_message_id,
                        media_id=media_id, mime_type=mime_type, msg_type=msg_type
                    )
                except Exception:
                    # Meta retries on anything but 200, which would hammer us with the same
                    # broken payload; log it and ack anyway so the retry storm doesn't happen.
                    logger.exception("Failed to process inbound WhatsApp message %s", meta_message_id)

                return jsonify({"status": "success"}), 200

        except (KeyError, IndexError):
            return jsonify({"status": "error", "message": "Malformed payload structure"}), 400

        return jsonify({"status": "ignored", "reason": "unknown_event"}), 200
