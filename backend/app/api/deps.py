from collections.abc import Callable, Generator

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import TokenError, decode_token
from app.db.session import SessionLocal
from app.models import User
from app.services import rbac

_bearer = HTTPBearer(auto_error=True)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = decode_token(creds.credentials)
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
