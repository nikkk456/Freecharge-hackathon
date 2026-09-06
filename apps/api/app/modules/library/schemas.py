from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict

from app.models.enums import KciFrequency, KciStatus


class FunctionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    name: str
    description: str | None


class KciOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    name: str
    target: str | None
    current_value: str | None
    status: KciStatus
    # How often the reading is refreshed. "99.6% vs >=99%" means something different
    # measured daily than measured quarterly, so a detail view has to say which.
    frequency: KciFrequency


class ControlOut(BaseModel):
    """A control plus the two things a reviewer actually needs next to it: who owns
    it, and whether its indicator is healthy right now."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    name: str
    description: str | None
    owner_function: FunctionOut | None
    kcis: list[KciOut]


class KciWithControlOut(KciOut):
    control_code: str
    control_name: str


class LibraryStats(BaseModel):
    functions: int
    controls: int
    kcis: int
    users: int
    circulars: int
    kci_status_mix: dict[str, int]
