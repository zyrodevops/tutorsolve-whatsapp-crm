from datetime import datetime, timezone
import uuid
from dataclasses import dataclass, field
from typing import Optional

def generate_uuid():
    return str(uuid.uuid4())

@dataclass
class Message:
    conversation_id: str
    sender_type: str
    message_type: str
    # None for INTERNAL_NOTE messages -- they're never sent over WhatsApp, so
    # they aren't "from" or "to" the customer the way real messages are.
    direction: Optional[str]
    delivery_status: str
    id: str = field(default_factory=generate_uuid)
    meta_message_id: Optional[str] = None
    sender_id: Optional[str] = None
    text_body: Optional[str] = None
    media_url: Optional[str] = None
    media_mime_type: Optional[str] = None
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "conversation_id": self.conversation_id,
            "meta_message_id": self.meta_message_id,
            "sender_type": self.sender_type,
            "sender_id": self.sender_id,
            "message_type": self.message_type,
            "text_body": self.text_body,
            "media_url": self.media_url,
            "media_mime_type": self.media_mime_type,
            "direction": self.direction,
            "delivery_status": self.delivery_status,
            "timestamp": self.timestamp
        }
