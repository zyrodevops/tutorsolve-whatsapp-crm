from datetime import datetime, timezone
import uuid
from app.db.database import db
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String, DateTime, Integer, ForeignKey

def generate_uuid():
    return str(uuid.uuid4())

class Conversation(db.Model):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), nullable=False)
    assigned_agent_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=True)
    status: Mapped[str] = mapped_column(String, default="OPEN") # OPEN, PENDING, RESOLVED
    priority: Mapped[str] = mapped_column(String, default="NORMAL") # NORMAL, URGENT
    unread_count: Mapped[int] = mapped_column(Integer, default=0)
    last_message_preview: Mapped[str] = mapped_column(String, nullable=True)
    last_message_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_customer_message_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    whatsapp_window_expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
