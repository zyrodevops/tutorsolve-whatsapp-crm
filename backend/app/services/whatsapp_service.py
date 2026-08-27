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

MESSAGE_PREVIEW_LABELS = {
    "TEXT": "Message",
    "IMAGE": "\U0001F4F7 Photo",
    "VIDEO": "\U0001F3A5 Video",
    "AUDIO": "\U0001F3B5 Audio",
    "VOICE": "\U0001F3A4 Voice message",
    "DOCUMENT": "\U0001F4C4 Document",
    "STICKER": "Sticker",
}

def _build_message_preview(text: str | None, message_type: str) -> str:
    """
    The inbox chat list shows this as the one-line summary of a conversation.
    A caption/body always wins; without one, fall back to a WhatsApp-style
    friendly label instead of the raw message_type -- both because a bare
    "[DOCUMENT]" reads as a bug, not a feature, and because an empty string
    makes the chat list wrongly claim "No messages yet" for a real message.
    """
    if text:
        return text[:50]
    return MESSAGE_PREVIEW_LABELS.get(message_type, message_type.title())

DEFAULT_GREETING_MESSAGE = "Hi there! Welcome. An agent will be with you shortly."
BUSINESS_SETTINGS_DOC_ID = "global_config"

def _is_within_business_hours(settings: dict, now: datetime | None = None) -> bool:
    """
    No hours configured means "always open" -- a business that hasn't set
    hours yet shouldn't suddenly go silent outside some arbitrary default window.
    """
    start = settings.get("business_hours_start")
    end = settings.get("business_hours_end")
    if not start or not end:
        return True

    from zoneinfo import ZoneInfo
    try:
        tz = ZoneInfo(settings.get("timezone") or "UTC")
    except Exception:
        tz = ZoneInfo("UTC")

    now_local = (now or datetime.now(timezone.utc)).astimezone(tz)

    try:
        start_h, start_m = (int(p) for p in start.split(":"))
        end_h, end_m = (int(p) for p in end.split(":"))
    except (ValueError, AttributeError):
        return True

    start_minutes = start_h * 60 + start_m
    end_minutes = end_h * 60 + end_m
    now_minutes = now_local.hour * 60 + now_local.minute

    if start_minutes <= end_minutes:
        return start_minutes <= now_minutes < end_minutes
    # Overnight window (e.g. 22:00 -> 06:00) wraps past midnight.
    return now_minutes >= start_minutes or now_minutes < end_minutes

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

# Meta's status webhooks don't guarantee delivery order, so a status can only
# move a message forward through this progression -- a late "delivered" must
# never overwrite an already-recorded "read". FAILED is terminal and applies
# unconditionally regardless of rank.
STATUS_RANK = {"SENT": 1, "DELIVERED": 2, "READ": 3}
META_STATUS_TO_DELIVERY_STATUS = {
    "sent": "SENT",
    "delivered": "DELIVERED",
    "read": "READ",
    "failed": "FAILED",
}

def _extract_meta_error(e: requests.exceptions.RequestException) -> str:
    status = getattr(e.response, "status_code", 500)
    if e.response is not None:
        try:
            err_json = e.response.json()
            if isinstance(err_json, dict) and "error" in err_json and "message" in err_json["error"]:
                return f"{err_json['error']['message']} (HTTP {status})"
        except Exception:
            pass
    return f"Meta API returned HTTP {status}"

class WhatsAppService:
    @staticmethod
    def process_status_update(meta_message_id: str, status: str) -> None:
        new_delivery_status = META_STATUS_TO_DELIVERY_STATUS.get(status)
        if not new_delivery_status:
            return

        matches = list(
            db.client.collection("messages")
            .where("meta_message_id", "==", meta_message_id)
            .limit(1)
            .stream()
        )
        if not matches:
            return

        msg_doc = matches[0]
        msg_data = msg_doc.to_dict()
        current_delivery_status = msg_data.get("delivery_status")

        if new_delivery_status != "FAILED":
            current_rank = STATUS_RANK.get(current_delivery_status, 0)
            new_rank = STATUS_RANK.get(new_delivery_status, 0)
            if new_rank <= current_rank:
                return

        db.client.collection("messages").document(msg_doc.id).update({"delivery_status": new_delivery_status})

        from app.core.socket_events import socketio
        socketio.emit('message_status_updated', {
            'conversation_id': msg_data.get("conversation_id"),
            'message_id': msg_doc.id,
            'delivery_status': new_delivery_status
        })

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
        business_settings_ref = db.client.collection("business_settings").document(BUSINESS_SETTINGS_DOC_ID)

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
            round_robin_enabled = True
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

                settings_snapshot = next(transaction.get(business_settings_ref))
                if settings_snapshot.exists:
                    round_robin_enabled = settings_snapshot.to_dict().get("round_robin_enabled", True)

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
                assigned_agent_id = None
                if round_robin_enabled:
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

        preview = _build_message_preview(text, message_type)
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
            settings_doc = business_settings_ref.get()
            settings = settings_doc.to_dict() if settings_doc.exists else {}

            if _is_within_business_hours(settings):
                greeting = settings.get("first_greeting_message") or DEFAULT_GREETING_MESSAGE
                WhatsAppService.send_message(conversation_id, greeting, sender_id="system")
            else:
                out_of_office = settings.get("out_of_office_message")
                if out_of_office:
                    WhatsAppService.send_message(conversation_id, out_of_office, sender_id="system")

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

        url = f"https://graph.facebook.com/v25.0/{WHATSAPP_PHONE_NUMBER_ID}/messages"
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
                "last_message_preview": _build_message_preview(text, "TEXT"),
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
            err_msg = _extract_meta_error(e)
            return False, f"Failed to send message: {err_msg}"

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
        upload_url = f"https://graph.facebook.com/v25.0/{WHATSAPP_PHONE_NUMBER_ID}/media"
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
            err_msg = _extract_meta_error(e)
            return False, f"Failed to upload media: {err_msg}"

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
        send_url = f"https://graph.facebook.com/v25.0/{WHATSAPP_PHONE_NUMBER_ID}/messages"
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
            preview = _build_message_preview(text, msg_type.upper())
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
            err_msg = _extract_meta_error(e)
            return False, f"Failed to send message: {err_msg}"

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

        url = f"https://graph.facebook.com/v25.0/{WHATSAPP_PHONE_NUMBER_ID}/messages"
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
            err_msg = _extract_meta_error(e)
            return False, f"Failed to send message: {err_msg}"

