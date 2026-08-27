from datetime import datetime, timezone
import uuid
from dataclasses import dataclass, field
from typing import Optional

def generate_uuid():
    return str(uuid.uuid4())

@dataclass
class Customer:
    phone_hash: str
    real_phone_number_encrypted: str
    masked_id: str
    id: str = field(default_factory=generate_uuid)
    whatsapp_name: Optional[str] = None
    profile_photo_url: Optional[str] = None
    about: Optional[str] = None
    external_crm_id: Optional[str] = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "phone_hash": self.phone_hash,
            "real_phone_number_encrypted": self.real_phone_number_encrypted,
            "masked_id": self.masked_id,
            "whatsapp_name": self.whatsapp_name,
            "profile_photo_url": self.profile_photo_url,
            "about": self.about,
            "external_crm_id": self.external_crm_id,
            "created_at": self.created_at,
            "updated_at": self.updated_at
        }
