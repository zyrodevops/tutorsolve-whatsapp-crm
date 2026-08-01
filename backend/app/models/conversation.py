from datetime import datetime, timezone
import uuid
from dataclasses import dataclass, field
from typing import Optional

def generate_uuid():
    return str(uuid.uuid4())

@dataclass
class Conversation:
    customer_id: str
    id: str = field(default_factory=generate_uuid)
    assigned_agent_id: Optional[str] = None
    status: str = "OPEN"
    priority: str = "NORMAL"
    tags: list = field(default_factory=list)
    unread_count: int = 0
    last_message_preview: Optional[str] = None
    last_message_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    last_customer_message_at: Optional[datetime] = None
    whatsapp_window_expires_at: Optional[datetime] = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "customer_id": self.customer_id,
            "assigned_agent_id": self.assigned_agent_id,
            "status": self.status,
            "priority": self.priority,
            "tags": self.tags,
            "unread_count": self.unread_count,
            "last_message_preview": self.last_message_preview,
            "last_message_at": self.last_message_at,
            "last_customer_message_at": self.last_customer_message_at,
            "whatsapp_window_expires_at": self.whatsapp_window_expires_at,
            "created_at": self.created_at,
            "updated_at": self.updated_at
        }
