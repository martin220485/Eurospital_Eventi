from collections.abc import Callable, Generator

from fastapi import Cookie, Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import TokenError, decode_token
from app.db.session import SessionLocal
from app.models import User
from app.services import rbac, settings_service

_bearer = HTTPBearer(auto_error=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _extract_token(
    creds: HTTPAuthorizationCredentials | None,
    access_cookie: str | None,
) -> str | None:
    if creds is not None:
        return creds.credentials
    return access_cookie


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    access_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
) -> User:
    token = _extract_token(creds, access_token)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token mancante")
    try:
        payload = decode_token(token)
    except TokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token non valido")
    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token non valido")
    user = db.get(User, int(payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utente non valido")
    return user


def require_permission(code: str) -> Callable[..., User]:
    def checker(
        db: Session = Depends(get_db),
        user: User = Depends(get_current_user),
    ) -> User:
        if not rbac.user_has_permission(db, user, code):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permesso negato")
        return user

    return checker


def require_setup_open(db: Session = Depends(get_db)) -> None:
    completed, _ = settings_service.setup_state(db)
    if completed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Setup already completed"
        )


def require_setup_token(x_setup_token: str | None = Header(default=None)) -> None:
    if x_setup_token != get_settings().setup_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Invalid setup token"
        )
