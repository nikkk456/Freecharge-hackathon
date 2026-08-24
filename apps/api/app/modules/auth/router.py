from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_current_user
from app.core.logging import get_logger
from app.core.security import create_access_token, verify_password
from app.db.session import get_db
from app.models.user import User
from app.modules.auth.schemas import LoginRequest, Token, UserOut

log = get_logger("auth")

router = APIRouter(prefix="/auth", tags=["auth"])

# One message for every failure mode. Saying "no such user" would let anyone probe
# which addresses exist; saying "wrong password" confirms an address is real.
BAD_CREDENTIALS = "Incorrect email or password."


async def _authenticate(db: AsyncSession, email: str, password: str) -> User:
    user = (
        await db.execute(select(User).where(func.lower(User.email) == email.strip().lower()))
    ).scalar_one_or_none()

    # Hash even when the user is missing, so a wrong address does not return
    # measurably faster than a wrong password.
    hashed = user.hashed_password if user else "$2b$12$" + ("x" * 53)
    correct = verify_password(password, hashed)

    if user is None or not correct:
        log.info("login_failed", email=email[:64], reason="credentials")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, BAD_CREDENTIALS)
    if not user.is_active:
        log.info("login_failed", email=email[:64], reason="inactive")
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account is disabled.")

    log.info("login_ok", user_id=str(user.id), role=user.role.value)
    return user


def _token_for(user: User) -> Token:
    return Token(
        access_token=create_access_token(subject=str(user.id), role=user.role.value),
        expires_in_minutes=settings.access_token_expire_minutes,
        user=UserOut.model_validate(user),
    )


@router.post("/login", response_model=Token)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> Token:
    """JSON login used by the web app."""
    return _token_for(await _authenticate(db, payload.email, payload.password))


@router.post("/token", response_model=Token)
async def login_form(
    form: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)
) -> Token:
    """OAuth2 password-form login, so the Authorize button in /docs works."""
    return _token_for(await _authenticate(db, form.username, form.password))


@router.get("/users", response_model=list[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[UserOut]:
    """Active users, for assigning ownership in the tracker.

    Only active accounts: someone who has left should not appear in a list of people
    work can be handed to. Requires sign-in — this is a staff directory, not public.
    """
    rows = (
        await db.execute(
            select(User).where(User.is_active.is_(True)).order_by(User.full_name)
        )
    ).scalars()
    return [UserOut.model_validate(u) for u in rows]


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)
