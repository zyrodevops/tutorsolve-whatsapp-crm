from datetime import datetime, timezone
import uuid
from app.db.database import db
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String, DateTime, ForeignKey

def generate_uuid():
    return str(uuid.uuid4())

class Message(db.Model):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id"), nullable=False)
    meta_message_id: Mapped[str] = mapped_column(String, nullable=True)
    sender_type: Mapped[str] = mapped_column(String, nullable=False) # CUSTOMER, AGENT, SYSTEM, INTERNAL_NOTE
    sender_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=True)
    message_type: Mapped[str] = mapped_column(String, nullable=False) # TEXT, IMAGE, VIDEO, AUDIO, DOCUMENT, TEMPLATE, INTERACTIVE
    text_body: Mapped[str] = mapped_column(String, nullable=True)
    media_url: Mapped[str] = mapped_column(String, nullable=True)
    media_mime_type: Mapped[str] = mapped_column(String, nullable=True)
    direction: Mapped[str] = mapped_column(String, nullable=False) # INBOUND, OUTBOUND
    delivery_status: Mapped[str] = mapped_column(String, nullable=False) # SENT, DELIVERED, READ, FAILED
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
