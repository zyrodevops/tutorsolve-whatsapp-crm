from datetime import datetime, timezone
import uuid
from app.db.database import db
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, DateTime

def generate_uuid():
    return str(uuid.uuid4())

class Customer(db.Model):
    __tablename__ = "customers"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    phone_hash: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    real_phone_number_encrypted: Mapped[str] = mapped_column(String, nullable=False)
    masked_id: Mapped[str] = mapped_column(String, nullable=False)
    whatsapp_name: Mapped[str] = mapped_column(String, nullable=True)
    profile_photo_url: Mapped[str] = mapped_column(String, nullable=True)
    about: Mapped[str] = mapped_column(String, nullable=True)
    external_crm_id: Mapped[str] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
