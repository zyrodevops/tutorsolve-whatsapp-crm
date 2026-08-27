import uuid
from dataclasses import dataclass, field
from typing import Optional, Dict

@dataclass
class MetaTemplate:
    name: str
    language: str
    category: str
    components: dict 
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    status: str = "PENDING"
    
    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "language": self.language,
            "category": self.category,
            "status": self.status,
            "components": self.components
        }
