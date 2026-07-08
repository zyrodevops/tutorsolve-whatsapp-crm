import uuid
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String
from app.db.database import db

class MetaTemplate(db.Model):
    __tablename__ = 'meta_templates'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    template_name: Mapped[str] = mapped_column(String(100), nullable=False)
    meta_template_id: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    language_code: Mapped[str] = mapped_column(String(10), nullable=False)
    body: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="PENDING") # APPROVED, PENDING, REJECTED
