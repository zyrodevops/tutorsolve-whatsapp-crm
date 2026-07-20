from datetime import datetime, timezone
import uuid
from app.db.database import db
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, DateTime

def generate_uuid():
    return str(uuid.uuid4())

class User(db.Model):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_uuid)
    full_name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False) # ADMIN, MANAGER, AGENT
    system_status: Mapped[str] = mapped_column(String, default="ACTIVE")
    agent_status: Mapped[str] = mapped_column(String, default="OFFLINE") # ONLINE, BUSY, OFFLINE
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_login: Mapped[datetime] = mapped_column(DateTime, nullable=True)
