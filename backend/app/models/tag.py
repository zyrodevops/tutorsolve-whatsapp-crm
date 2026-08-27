from dataclasses import dataclass, field
import uuid

@dataclass
class Tag:
    name: str
    color_hex: str
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    
    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "color_hex": self.color_hex
        }
