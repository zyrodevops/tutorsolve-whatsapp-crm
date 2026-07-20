from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Boolean
from app.db.database import db

class BusinessSetting(db.Model):
    __tablename__ = 'business_settings'

    # Using a string ID to allow a single row e.g., 'global_config'
    id: Mapped[str] = mapped_column(String(50), primary_key=True, default="global_config")
    business_hours_start: Mapped[str] = mapped_column(String(5), nullable=True) # e.g., "09:00"
    business_hours_end: Mapped[str] = mapped_column(String(5), nullable=True)   # e.g., "17:00"
    timezone: Mapped[str] = mapped_column(String(50), default="UTC")
    out_of_office_message: Mapped[str] = mapped_column(String, nullable=True)
    first_greeting_message: Mapped[str] = mapped_column(String, nullable=True)
    round_robin_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
