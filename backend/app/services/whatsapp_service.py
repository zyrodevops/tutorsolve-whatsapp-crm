import requests
from app.db.database import db
from app.models.customer import Customer, generate_uuid
from app.models.conversation import Conversation
from app.models.message import Message
from app.core.config import WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID
from app.core.security import encrypt_phone, decrypt_phone, hash_phone

class WhatsAppService:
    @staticmethod
    def process_incoming_message(phone: str, name: str, text: str, meta_message_id: str | None = None) -> None:
        """
        Takes raw extracted data from the webhook, finds or provisions a Customer
        using deterministic hashing, creates an open Conversation if none exists,
        and saves the inbound Message.
        """
        if not phone or not isinstance(phone, str) or not phone.strip():
            raise ValueError("Phone number is required")
            
        if meta_message_id:
            existing = db.session.execute(
                db.select(Message).filter_by(meta_message_id=meta_message_id)
            ).scalar_one_or_none()
            if existing:
                # Meta redelivers on a slow/failed ack; this message was already saved.
                return

        phone_hash_val = hash_phone(phone)
        customer = db.session.execute(
            db.select(Customer).filter_by(phone_hash=phone_hash_val)
        ).scalar_one_or_none()

        if not customer:
            from sqlalchemy.exc import IntegrityError
            try:
                with db.session.begin_nested():
                    new_id = generate_uuid()
                    customer = Customer(
                        id=new_id,
                        phone_hash=phone_hash_val,
                        real_phone_number_encrypted=encrypt_phone(phone),
                        whatsapp_name=name,
                        masked_id=f"Lead-{new_id[:8]}"
                    )
                    db.session.add(customer)
            except IntegrityError:
                customer = db.session.execute(
                    db.select(Customer).filter_by(phone_hash=phone_hash_val)
                ).scalar_one()

        from sqlalchemy.exc import IntegrityError
        conversation = db.session.execute(
            db.select(Conversation).filter_by(customer_id=customer.id).filter(Conversation.status.in_(["OPEN", "PENDING"]))
        ).scalar_one_or_none()

        if not conversation:
            try:
                with db.session.begin_nested():
                    conversation = Conversation(customer_id=customer.id, status="OPEN")
                    db.session.add(conversation)
                    db.session.flush()
            except IntegrityError:
                conversation = db.session.execute(
                    db.select(Conversation).filter_by(customer_id=customer.id).filter(Conversation.status.in_(["OPEN", "PENDING"]))
                ).scalar_one()
        elif conversation.status == "PENDING":
            conversation.status = "OPEN"

        message = Message(
            conversation_id=conversation.id,
            meta_message_id=meta_message_id,
            sender_type="CUSTOMER",
            message_type="TEXT",
            text_body=text,
            direction="INBOUND",
            delivery_status="DELIVERED"
        )
        db.session.add(message)
        
        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone.utc)
        
        # Update conversation stats
        conversation.last_message_preview = text[:50] if text else ""
        conversation.unread_count += 1
        conversation.last_message_at = now
        conversation.last_customer_message_at = now
        conversation.whatsapp_window_expires_at = now + timedelta(hours=24)
        
        db.session.commit()

        # Broadcast the new message via WebSockets
        from app.core.socket_events import socketio
        socketio.emit('new_message', {
            'conversation_id': conversation.id,
            'message': {
                'id': message.id,
                'text_body': text,
                'direction': 'INBOUND',
                'sender_type': 'CUSTOMER',
                'timestamp': now.isoformat()
            }
        })

    @staticmethod
    def send_message(conversation_id: str, text: str, sender_id: str | None = None) -> tuple[bool, str | None]:
        """
        Fires an HTTP POST request to Meta to send a message, and if successful,
        saves the outbound message to the database. Internally decrypts the phone number.
        """
        conversation = db.session.execute(
            db.select(Conversation).filter_by(id=conversation_id)
        ).scalar_one_or_none()
        
        if not conversation:
            return False, "Conversation not found"
            
        customer = db.session.execute(
            db.select(Customer).filter_by(id=conversation.customer_id)
        ).scalar_one_or_none()
        
        if not customer:
            return False, "Customer not found"
            
        to_phone = decrypt_phone(customer.real_phone_number_encrypted)
        
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
            
            # Save outbound message on success
            outbound_msg = Message(
                conversation_id=conversation_id,
                sender_type="AGENT",
                sender_id=sender_id,
                message_type="TEXT",
                text_body=text,
                direction="OUTBOUND",
                delivery_status="SENT"
            )
            db.session.add(outbound_msg)

            from datetime import datetime, timezone
            now = datetime.now(timezone.utc)
            conversation.last_message_preview = text[:50] if text else ""
            conversation.last_message_at = now

            db.session.commit()

            # Broadcast the new message via WebSockets so other agents' open
            # views of this conversation update without a manual refresh.
            from app.core.socket_events import socketio
            socketio.emit('new_message', {
                'conversation_id': conversation.id,
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
            return False, f"HTTP {status}: {str(e)} - Meta Response: {body}"
