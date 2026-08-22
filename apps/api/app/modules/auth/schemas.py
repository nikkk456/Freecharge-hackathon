from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict

from app.models.enums import Role


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int
    user: UserOut


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str
    role: Role
    is_active: bool


class LoginRequest(BaseModel):
    """JSON login, for the SPA. The OAuth2 form endpoint stays for /docs."""

    email: str
    password: str
