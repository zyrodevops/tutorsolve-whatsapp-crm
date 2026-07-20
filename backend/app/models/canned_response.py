from datetime import datetime
import uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String, Boolean, DateTime, ForeignKey
from app.db.database import db

class CannedResponse(db.Model):
    __tablename__ = 'canned_responses'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    shortcut: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    message_body: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey('users.id'), nullable=False)

    creator = relationship("User")
