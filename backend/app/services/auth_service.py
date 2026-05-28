from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.models import RefreshToken, User
from app.services.user_service import get_by_identifier

_DUMMY_HASH = hash_password("dummy-password-for-timing")


class AuthError(Exception):
    pass


def authenticate(db: Session, identifier: str, password: str) -> User | None:
    user = get_by_identifier(db, identifier)
    if user is None or not user.hashed_password:
        verify_password(password, _DUMMY_HASH)
        return None
    if not user.is_active or not verify_password(password, user.hashed_password):
        return None
    return user


def issue_token_pair(db: Session, user: User) -> tuple[str, str]:
    settings = get_settings()
    raw_refresh = generate_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(raw_refresh),
            expires_at=datetime.now(UTC)
            + timedelta(days=settings.refresh_token_expire_days),
        )
    )
    db.flush()
    return create_access_token(str(user.id)), raw_refresh


def _active_refresh(db: Session, raw_refresh: str) -> RefreshToken:
    row = db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw_refresh))
    )
    if row is None or row.revoked_at is not None:
        raise AuthError("invalid refresh token")
    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if expires < datetime.now(UTC):
        raise AuthError("expired refresh token")
    return row


def rotate_refresh(db: Session, raw_refresh: str) -> tuple[str, str]:
    row = _active_refresh(db, raw_refresh)
    row.revoked_at = datetime.now(UTC)
    db.flush()
    user = db.get(User, row.user_id)
    if user is None or not user.is_active:
        raise AuthError("inactive user")
    return issue_token_pair(db, user)


def revoke_refresh(db: Session, raw_refresh: str) -> None:
    row = db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw_refresh))
    )
    if row is not None and row.revoked_at is None:
        row.revoked_at = datetime.now(UTC)
        db.flush()


def change_password(db: Session, user: User, *, old_password: str, new_password: str) -> None:
    if not user.hashed_password or not verify_password(old_password, user.hashed_password):
        raise AuthError("invalid old password")
    user.hashed_password = hash_password(new_password)
    db.flush()
