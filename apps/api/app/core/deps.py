"""Shared FastAPI dependencies: current user + RBAC guards.

SSO-ready: only `get_current_user` changes when you move to an IdP; the role checks
below stay identical."""
from __future__ import annotations

import uuid
from collections.abc import Callable

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.db.session import get_db
from app.models.enums import Role
from app.models.user import User

# Points at the form endpoint, which is what the Authorize button in /docs posts to.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token", auto_error=False)

UNAUTHENTICATED = HTTPException(
    status.HTTP_401_UNAUTHORIZED,
    "Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not token:
        raise UNAUTHENTICATED

    try:
        payload = decode_token(token)
        user_id = uuid.UUID(payload["sub"])
    except jwt.ExpiredSignatureError as exc:
        # Distinct from a bad token: the client should send the user to log in again
        # rather than report that something is broken.
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Your session has expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except (jwt.InvalidTokenError, KeyError, ValueError, TypeError) as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Inactive or unknown user",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def get_optional_user(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Identity when present, anonymous when not.

    Used by endpoints that stay open during the hackathon but should still attribute
    an action to a person when one is signed in — so the audit trail records a name
    rather than "system" the moment login is in use.
    """
    if not token:
        return None
    try:
        return await get_current_user(token=token, db=db)
    except HTTPException:
        return None


def require_roles(*roles: Role) -> Callable:
    """Dependency factory for RBAC: `Depends(require_roles(Role.REVIEWER))`.

    Admin passes every check — it is the break-glass role, not a peer of the others.
    """

    async def _guard(user: User = Depends(get_current_user)) -> User:
        if roles and user.role not in roles and user.role != Role.ADMIN:
            allowed = ", ".join(sorted(r.value for r in roles))
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"This action requires one of these roles: {allowed}. "
                f"You are signed in as {user.role.value}.",
            )
        return user

    return _guard
