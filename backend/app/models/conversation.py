from datetime import datetime, timezone
import uuid
from app.db.database import db
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String, DateTime, Integer, ForeignKey, Index, text

def generate_uuid():
    return str(uuid.uuid4())

class Conversation(db.Model):
    __tablename__ = "conversations"
    __table_args__ = (
        # At most one OPEN/PENDING conversation per customer, enforced at the DB level
        # so two concurrent webhook deliveries can't both create one (see whatsapp_service.py).
        Index(
            "ix_one_active_conversation_per_customer",
            "customer_id",
            unique=True,
            sqlite_where=text("status IN ('OPEN', 'PENDING')"),
            postgresql_where=text("status IN ('OPEN', 'PENDING')"),
        ),
    )

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
