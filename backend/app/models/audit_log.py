from datetime import datetime, timezone
import uuid
from dataclasses import dataclass, field
from typing import Optional

@dataclass
class AuditLog:
    user_id: str
    action: str
    entity_type: str
    entity_id: str
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    ip_address: Optional[str] = None
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "action": self.action,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "ip_address": self.ip_address,
            "timestamp": self.timestamp
        }
