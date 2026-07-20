from datetime import datetime, timezone
import uuid
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, DateTime
from app.db.database import db

class Tag(db.Model):
    __tablename__ = 'tags'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    color_hex: Mapped[str] = mapped_column(String(7), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
