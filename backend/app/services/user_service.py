from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models import Permission, Role, User


def create_user(
    db: Session, *, email: str, username: str, password: str, full_name: str | None = None
) -> User:
    user = User(
        email=email,
        username=username,
        hashed_password=hash_password(password),
        full_name=full_name,
        is_active=True,
    )
    db.add(user)
    db.flush()
    return user


def get_by_identifier(db: Session, identifier: str) -> User | None:
    stmt = select(User).where(or_(User.email == identifier, User.username == identifier))
    return db.scalar(stmt)


def assign_role(db: Session, user: User, role_name: str) -> None:
    role = db.scalar(select(Role).where(Role.name == role_name))
    if role is None:
        raise ValueError(f"role not found: {role_name}")
    if role not in user.roles:
        user.roles.append(role)
        db.flush()


def get_user_permissions(db: Session, user: User) -> set[str]:
    stmt = (
        select(Permission.code)
        .join(Role.permissions)
        .join(Role.users)
        .where(User.id == user.id)
    )
    return {code for code in db.scalars(stmt)}
