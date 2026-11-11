from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


def to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)


class InputModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


Role = Literal["ADMIN", "TECH_DIRECTOR", "OPERATOR", "VIEWER"]
DeviceType = Literal["CAMERA", "LIGHT", "MICROPHONE", "SWITCH", "MIXER", "PROJECTOR", "PLAYBACK", "OTHER"]
DeviceSource = Literal["DISCOVERED", "MANUAL"]
Severity = Literal["INFO", "WARNING", "CRITICAL"]


class LoginInput(InputModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=1)


class UserCreate(InputModel):
    name: str = Field(min_length=1)
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8)
    role: Role


class UserRoleUpdate(InputModel):
    role: Role


class DeviceCreate(InputModel):
    name: str = Field(min_length=1)
    type: DeviceType
    source: DeviceSource = "MANUAL"
    identifier: str | None = Field(default=None, min_length=1)
    manufacturer: str | None = None
    model: str | None = None
    ip_address: str | None = None
    params: dict[str, str] = Field(default_factory=dict)


class DeviceUpdate(InputModel):
    name: str | None = Field(default=None, min_length=1)
    online: bool | None = None
    params: dict[str, str] | None = None


class BaselineCreate(InputModel):
    name: str = Field(min_length=1)
    venue: str | None = None
    event_date: datetime | None = None
    from_live: bool = False


class BaselineUpdate(InputModel):
    name: str | None = Field(default=None, min_length=1)
    venue: str | None = None
    event_date: datetime | None = None
    active: bool | None = None


class BaselineItemCreate(InputModel):
    label: str = Field(min_length=1)
    type: DeviceType
    expected_params: dict[str, str] = Field(default_factory=dict)
    critical: bool = True
    device_id: int | None = None


class BaselineItemUpdate(InputModel):
    label: str | None = Field(default=None, min_length=1)
    expected_params: dict[str, str] | None = None
    critical: bool | None = None
    device_id: int | None = None
    recapture: bool = False


class ConnectionCreate(InputModel):
    from_device_id: int
    to_device_id: int
    label: str | None = None


class IncidentCreate(InputModel):
    title: str = Field(min_length=1)
    description: str | None = None
    severity: Severity
    device_id: int | None = None


class IncidentUpdate(InputModel):
    resolved: bool


class DiscoveryPortsUpdate(InputModel):
    ports: dict[str, int]