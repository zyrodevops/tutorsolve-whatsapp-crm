from dataclasses import dataclass, field
from typing import Optional

@dataclass
class BusinessSetting:
    id: str = "global_config"
    business_hours_start: Optional[str] = None
    business_hours_end: Optional[str] = None
    timezone: str = "UTC"
    out_of_office_message: Optional[str] = None
    first_greeting_message: Optional[str] = None
    round_robin_enabled: bool = False

    def to_dict(self):
        return {
            "id": self.id,
            "business_hours_start": self.business_hours_start,
            "business_hours_end": self.business_hours_end,
            "timezone": self.timezone,
            "out_of_office_message": self.out_of_office_message,
            "first_greeting_message": self.first_greeting_message,
            "round_robin_enabled": self.round_robin_enabled
        }
