import requests
from app.db.database import db
from app.models.customer import Customer, generate_uuid
from app.models.conversation import Conversation
from app.models.message import Message
from app.core.config import WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID

class WhatsAppService:
    @staticmethod
    def process_incoming_message(phone: str, name: str, text: str, meta_message_id: str | None = None) -> None:
        """
        Takes raw extracted data from the webhook, finds or provisions a Customer,
        creates an open Conversation if none exists, and saves the inbound Message.
        """
        if meta_message_id:
            existing = db.session.execute(
                db.select(Message).filter_by(meta_message_id=meta_message_id)
            ).scalar_one_or_none()
            if existing:
                # Meta redelivers on a slow/failed ack; this message was already saved.
                return

        customer = db.session.execute(
            db.select(Customer).filter_by(real_phone_number_encrypted=phone)
        ).scalar_one_or_none()

        if not customer:
            from sqlalchemy.exc import IntegrityError
            try:
                with db.session.begin_nested():
                    new_id = generate_uuid()
                    customer = Customer(
                        id=new_id,
                        real_phone_number_encrypted=phone,
                        whatsapp_name=name,
                        # Derived from the customer's own unique id, not the phone number,
                        # so two numbers sharing the same last digits can't collide.
                        masked_id=f"Lead-{new_id[:8]}"
                    )
                    db.session.add(customer)
            except IntegrityError:
                customer = db.session.execute(
                    db.select(Customer).filter_by(real_phone_number_encrypted=phone)
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
                # Lost the race to a concurrent delivery for the same customer;
                # use the conversation it just created instead of a duplicate.
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

    @staticmethod
    def send_message(conversation_id: str, to_phone: str, text: str) -> tuple[bool, str | None]:
        """
        Fires an HTTP POST request to Meta to send a message, and if successful,
        saves the outbound message to the database.
        """
        url = f"https://graph.facebook.com/v17.0/{WHATSAPP_PHONE_NUMBER_ID}/messages"
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
                message_type="TEXT",
                text_body=text,
                direction="OUTBOUND",
                delivery_status="SENT"
            )
            db.session.add(outbound_msg)
            db.session.commit()
            
            return True, None
            
        except requests.exceptions.RequestException as e:
            status = getattr(e.response, "status_code", 500)
            return False, f"HTTP {status}: {str(e)}"
