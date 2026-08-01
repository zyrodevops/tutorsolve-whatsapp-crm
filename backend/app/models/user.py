from datetime import datetime, timezone
import uuid
from dataclasses import dataclass, field
from typing import Optional

def generate_uuid():
    return str(uuid.uuid4())

@dataclass
class User:
    full_name: str
    email: str
    password_hash: str
    role: str
    id: str = field(default_factory=generate_uuid)
    system_status: str = "ACTIVE"
    agent_status: str = "OFFLINE"
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    last_login: Optional[datetime] = None
    # Bumped on password reset so refresh tokens issued before the reset stop
    # working (the token embeds the version it was issued under).
    token_version: int = 0

    def to_dict(self):
        return {
            "id": self.id,
            "full_name": self.full_name,
            "email": self.email,
            "password_hash": self.password_hash,
            "role": self.role,
            "system_status": self.system_status,
            "agent_status": self.agent_status,
            "created_at": self.created_at,
            "last_login": self.last_login,
            "token_version": self.token_version
        }
