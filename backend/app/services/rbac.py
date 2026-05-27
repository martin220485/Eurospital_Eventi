from sqlalchemy.orm import Session

from app.models import User
from app.services.user_service import get_user_permissions


def user_has_permission(db: Session, user: User, code: str) -> bool:
    return code in get_user_permissions(db, user)
