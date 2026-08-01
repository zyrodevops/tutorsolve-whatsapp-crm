import logging
import requests
from google.cloud import firestore
from app.db.firebase import db
from app.models.customer import Customer
from app.models.conversation import Conversation
from app.models.message import Message
from app.core.config import WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID
from app.core.security import encrypt_phone, decrypt_phone, hash_phone, generate_masked_id
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

class ConversationNotFoundError(Exception):
    """Raised when a conversation_id doesn't correspond to an existing conversation."""

class CustomerNotFoundError(Exception):
    """Raised when a conversation's customer record is missing."""

def _pick_next_agent_id(sorted_agent_ids: list[str], last_assigned_id: str | None) -> str | None:
    """
    Rotates through agents in a fixed order rather than picking randomly, so
    load is distributed evenly instead of unpredictably. Wraps back to the
    start once the last-assigned agent is no longer online (e.g. went offline).
    """
    if not sorted_agent_ids:
        return None
    if last_assigned_id in sorted_agent_ids:
        idx = sorted_agent_ids.index(last_assigned_id)
        return sorted_agent_ids[(idx + 1) % len(sorted_agent_ids)]
    return sorted_agent_ids[0]

class WhatsAppService:
    @staticmethod
    def process_incoming_message(
        phone: str, name: str, text: str | None, meta_message_id: str | None = None,
        media_id: str | None = None, mime_type: str | None = None, msg_type: str = 'text'
    ) -> None:
        if not phone or not isinstance(phone, str) or not phone.strip():
            raise ValueError("Phone number is required")

        messages_ref = db.client.collection("messages")
        if meta_message_id:
            existing = list(messages_ref.where("meta_message_id", "==", meta_message_id).limit(1).stream())
            if existing:
                return

        customers_ref = db.client.collection("customers")
        convs_ref = db.client.collection("conversations")
        routing_state_ref = db.client.collection("business_settings").document("routing_state")

        phone_hash_val = hash_phone(phone)
        customer_ref = customers_ref.document(phone_hash_val)

        @firestore.transactional
        def get_or_create_customer_and_conversation(transaction):
            # --- Reads first: Firestore transactions require every read to
            # happen before any write, so nothing below this block may write. ---
            customer_snapshot = next(transaction.get(customer_ref))
            customer_exists = customer_snapshot.exists

            query = convs_ref.where("customer_id", "==", phone_hash_val).limit(1)
            results = list(query.stream(transaction=transaction))

            online_agents = []
            last_assigned_agent_id = None
            if not results:
                online_agents = list(
                    db.client.collection("users")
                    .where("system_status", "==", "ACTIVE")
                    .where("agent_status", "==", "ONLINE")
                    .stream(transaction=transaction)
                )
                routing_state_snapshot = next(transaction.get(routing_state_ref))
                if routing_state_snapshot.exists:
                    last_assigned_agent_id = routing_state_snapshot.to_dict().get("last_assigned_agent_id")

            # --- Pure decision-making over the data we already read. ---
            is_new_window = False
            needs_reopen = False
            conv_id = None
            if results:
                conv_doc = results[0]
                conv_id = conv_doc.id
                conv_data = conv_doc.to_dict()
                expires_at = conv_data.get("whatsapp_window_expires_at")

                if not expires_at:
                    is_new_window = True
                else:
                    if expires_at.tzinfo is None:
                        expires_at = expires_at.replace(tzinfo=timezone.utc)
                    if datetime.now(timezone.utc) > expires_at:
                        is_new_window = True

                if conv_data.get("status") == "PENDING":
                    needs_reopen = True
            else:
                is_new_window = True

            # --- Writes last. ---
            if not customer_exists:
                transaction.set(customer_ref, Customer(
                    id=phone_hash_val,
                    phone_hash=phone_hash_val,
                    real_phone_number_encrypted=encrypt_phone(phone),
                    whatsapp_name=name,
                    masked_id=generate_masked_id(),
                ).to_dict())

            if not results:
                sorted_agent_ids = sorted(agent_doc.id for agent_doc in online_agents)
                assigned_agent_id = _pick_next_agent_id(sorted_agent_ids, last_assigned_agent_id)
                conversation = Conversation(
                    customer_id=phone_hash_val,
                    status="OPEN",
                    assigned_agent_id=assigned_agent_id
                )
                conv_id = conversation.id
                transaction.set(convs_ref.document(conv_id), conversation.to_dict())
                if assigned_agent_id:
                    transaction.set(routing_state_ref, {"last_assigned_agent_id": assigned_agent_id}, merge=True)
            elif needs_reopen:
                transaction.update(convs_ref.document(conv_id), {"status": "OPEN"})

            return conv_id, is_new_window

        transaction = db.client.transaction()
        conversation_id, is_new_window = get_or_create_customer_and_conversation(transaction)

        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(hours=24)
        message_type = msg_type.upper()
        media_url = f"/api/media/{media_id}" if media_id else None

        message = Message(
            conversation_id=conversation_id,
            meta_message_id=meta_message_id,
            sender_type="CUSTOMER",
            message_type=message_type,
            text_body=text,
            media_url=media_url,
            media_mime_type=mime_type,
            direction="INBOUND",
            delivery_status="DELIVERED"
        )
        messages_ref.document(message.id).set(message.to_dict())

        preview = text[:50] if text else f"[{message_type}]"
        convs_ref.document(conversation_id).update({
            "last_message_preview": preview,
            "unread_count": firestore.Increment(1),
            "last_message_at": now,
            "last_customer_message_at": now,
            "whatsapp_window_expires_at": expires_at
        })

        from app.core.socket_events import socketio
        socketio.emit('conversation_updated', {
            'conversation_id': conversation_id,
            'whatsapp_window_expires_at': expires_at.isoformat()
        })

        socketio.emit('new_message', {
            'conversation_id': conversation_id,
            'message': {
                'id': message.id,
                'text_body': text,
                'media_url': media_url,
                'media_mime_type': mime_type,
                'direction': 'INBOUND',
                'sender_type': 'CUSTOMER',
                'message_type': message_type,
                'timestamp': now.isoformat()
            }
        })
        
        # Trigger greeting automation if this is a new window
        if is_new_window:
            WhatsAppService.send_message(
                conversation_id, 
                "Hi there! Welcome. An agent will be with you shortly.", 
                sender_id="system"
            )

    @staticmethod
    def send_message(conversation_id: str, text: str, sender_id: str | None = None) -> tuple[bool, str | None]:
        convs_ref = db.client.collection("conversations")
        conv_doc = convs_ref.document(conversation_id).get()

        if not conv_doc.exists:
            raise ConversationNotFoundError("Conversation not found")

        conv_data = conv_doc.to_dict()
        customer_id = conv_data.get("customer_id")

        cust_doc = db.client.collection("customers").document(customer_id).get()
        if not cust_doc.exists:
            raise CustomerNotFoundError("Customer not found")

        try:
            to_phone = decrypt_phone(cust_doc.to_dict().get("real_phone_number_encrypted"))
        except ValueError as e:
            return False, str(e)

        url = f"https://graph.facebook.com/v20.0/{WHATSAPP_PHONE_NUMBER_ID}/messages"
        headers = {
            "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}",
            "Content-Type": "application/json"
        }
        payload = {
            "messaging_product": "whatsapp",
            "to": to_phone,
            "type": "text",
            "text": {"body": text}
        }

        try:
            response = requests.post(url, headers=headers, json=payload, timeout=10)
            response.raise_for_status()

            outbound_msg = Message(
                conversation_id=conversation_id,
                sender_type="AGENT",
                sender_id=sender_id,
                message_type="TEXT",
                text_body=text,
                direction="OUTBOUND",
                delivery_status="SENT"
            )
            db.client.collection("messages").document(outbound_msg.id).set(outbound_msg.to_dict())

            now = datetime.now(timezone.utc)
            convs_ref.document(conversation_id).update({
                "last_message_preview": text[:50] if text else "",
                "last_message_at": now
            })

            from app.core.socket_events import socketio
            socketio.emit('new_message', {
                'conversation_id': conversation_id,
                'message': {
                    'id': outbound_msg.id,
                    'text_body': text,
                    'direction': 'OUTBOUND',
                    'sender_type': 'AGENT',
                    'timestamp': now.isoformat()
                }
            })

            return True, None

        except requests.exceptions.RequestException as e:
            status = getattr(e.response, "status_code", 500)
            body = getattr(e.response, "text", "")
            logger.warning("Meta API request failed with HTTP %s: %s", status, body)
            return False, f"Failed to send message: Meta API returned HTTP {status}"

    @staticmethod
    def send_media_message(conversation_id: str, file_bytes: bytes, mime_type: str, filename: str, text: str, sender_id: str | None = None) -> tuple[bool, str | None]:
        convs_ref = db.client.collection("conversations")
        conv_doc = convs_ref.document(conversation_id).get()

        if not conv_doc.exists:
            raise ConversationNotFoundError("Conversation not found")

        customer_id = conv_doc.to_dict().get("customer_id")
        cust_doc = db.client.collection("customers").document(customer_id).get()
        if not cust_doc.exists:
            raise CustomerNotFoundError("Customer not found")

        try:
            to_phone = decrypt_phone(cust_doc.to_dict().get("real_phone_number_encrypted"))
        except ValueError as e:
            return False, str(e)

        # Step 1: Upload media to Meta
        upload_url = f"https://graph.facebook.com/v20.0/{WHATSAPP_PHONE_NUMBER_ID}/media"
        headers = {"Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}"}
        
        files = {
            "file": (filename, file_bytes, mime_type)
        }
        data = {
            "messaging_product": "whatsapp",
            "type": mime_type
        }

        try:
            upload_resp = requests.post(upload_url, headers=headers, data=data, files=files, timeout=30)
            upload_resp.raise_for_status()
            media_id = upload_resp.json().get("id")
        except requests.exceptions.RequestException as e:
            status = getattr(e.response, "status_code", 500)
            body = getattr(e.response, "text", "")
            logger.warning("Meta media upload failed with HTTP %s: %s", status, body)
            return False, f"Failed to upload media: Meta API returned HTTP {status}"

        # Determine WhatsApp msg type based on mime type
        if mime_type.startswith("image/"):
            msg_type = "image"
        elif mime_type.startswith("video/"):
            msg_type = "video"
        elif mime_type.startswith("audio/"):
            msg_type = "audio"
        else:
            msg_type = "document"

        # Step 2: Send message with media id
        send_url = f"https://graph.facebook.com/v20.0/{WHATSAPP_PHONE_NUMBER_ID}/messages"
        json_headers = {
            "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}",
            "Content-Type": "application/json"
        }
        
        media_payload = {"id": media_id}
        if text:
            if msg_type == "document":
                media_payload["filename"] = filename
                media_payload["caption"] = text
            else:
                media_payload["caption"] = text
        elif msg_type == "document":
            media_payload["filename"] = filename

        payload = {
            "messaging_product": "whatsapp",
            "to": to_phone,
            "type": msg_type,
            msg_type: media_payload
        }

        try:
            send_resp = requests.post(send_url, headers=json_headers, json=payload, timeout=10)
            send_resp.raise_for_status()

            media_url = f"/api/media/{media_id}"
            outbound_msg = Message(
                conversation_id=conversation_id,
                sender_type="AGENT",
                sender_id=sender_id,
                message_type=msg_type.upper(),
                text_body=text,
                media_url=media_url,
                media_mime_type=mime_type,
                direction="OUTBOUND",
                delivery_status="SENT"
            )
            db.client.collection("messages").document(outbound_msg.id).set(outbound_msg.to_dict())

            now = datetime.now(timezone.utc)
            preview = text[:50] if text else f"[{msg_type.upper()}]"
            convs_ref.document(conversation_id).update({
                "last_message_preview": preview,
                "last_message_at": now
            })

            from app.core.socket_events import socketio
            socketio.emit('new_message', {
                'conversation_id': conversation_id,
                'message': {
                    'id': outbound_msg.id,
                    'text_body': text,
                    'media_url': media_url,
                    'media_mime_type': mime_type,
                    'direction': 'OUTBOUND',
                    'sender_type': 'AGENT',
                    'message_type': msg_type.upper(),
                    'timestamp': now.isoformat()
                }
            })

            return True, None

        except requests.exceptions.RequestException as e:
            status = getattr(e.response, "status_code", 500)
            body = getattr(e.response, "text", "")
            logger.warning("Meta API request failed with HTTP %s: %s", status, body)
            return False, f"Failed to send message: Meta API returned HTTP {status}"

    @staticmethod
    def send_template_message(conversation_id: str, template_name: str, language_code: str = "en_US", sender_id: str | None = None) -> tuple[bool, str | None]:
        convs_ref = db.client.collection("conversations")
        conv_doc = convs_ref.document(conversation_id).get()

        if not conv_doc.exists:
            raise ConversationNotFoundError("Conversation not found")

        customer_id = conv_doc.to_dict().get("customer_id")
        cust_doc = db.client.collection("customers").document(customer_id).get()
        if not cust_doc.exists:
            raise CustomerNotFoundError("Customer not found")

        try:
            to_phone = decrypt_phone(cust_doc.to_dict().get("real_phone_number_encrypted"))
        except ValueError as e:
            return False, str(e)

        url = f"https://graph.facebook.com/v20.0/{WHATSAPP_PHONE_NUMBER_ID}/messages"
        headers = {
            "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "messaging_product": "whatsapp",
            "to": to_phone,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {
                    "code": language_code
                }
            }
        }

        try:
            response = requests.post(url, headers=headers, json=payload, timeout=10)
            response.raise_for_status()

            # Record the sent template as a message
            outbound_msg = Message(
                conversation_id=conversation_id,
                sender_type="AGENT",
                sender_id=sender_id,
                message_type="TEMPLATE",
                text_body=f"[Template Sent: {template_name}]",
                direction="OUTBOUND",
                delivery_status="SENT"
            )
            db.client.collection("messages").document(outbound_msg.id).set(outbound_msg.to_dict())

            now = datetime.now(timezone.utc)
            convs_ref.document(conversation_id).update({
                "last_message_preview": f"Template: {template_name}",
                "last_message_at": now
            })

            from app.core.socket_events import socketio
            socketio.emit('new_message', {
                'conversation_id': conversation_id,
                'message': {
                    'id': outbound_msg.id,
                    'text_body': f"[Template Sent: {template_name}]",
                    'direction': 'OUTBOUND',
                    'sender_type': 'AGENT',
                    'message_type': 'TEMPLATE',
                    'timestamp': now.isoformat()
                }
            })

            return True, None

        except requests.exceptions.RequestException as e:
            status = getattr(e.response, "status_code", 500)
            body = getattr(e.response, "text", "")
            logger.warning("Meta API request failed with HTTP %s: %s", status, body)
            return False, f"Failed to send message: Meta API returned HTTP {status}"
