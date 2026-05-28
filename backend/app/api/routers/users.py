from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_permission
from app.models import Role, User
from app.services import audit_service, gdpr_service, user_service

router = APIRouter(prefix="/api/admin", tags=["users-admin"])

_PERM = "users.admin"


def _ip(request: Request) -> str:
    return request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (
        request.client.host if request.client else ""
    )


@router.post(
    "/users/{user_id}/anonymize",
    dependencies=[Depends(require_permission(_PERM))],
)
def anonymize_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> dict:
    try:
        anon = gdpr_service.anonymize_user(db, user_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="utente non trovato")
    audit_service.log(
        db, action="user.anonymize", actor_id=actor.id,
        target_type="user", target_id=user_id, ip=_ip(request),
        payload={"new_email": anon.email},
    )
    db.commit()
    return {
        "ok": True, "user_id": anon.id,
        "anonymized_at": datetime.utcnow().isoformat(),
    }


@router.get(
    "/audit-logs",
    dependencies=[Depends(require_permission(_PERM))],
)
def list_audit_logs(
    actor_id: int | None = None,
    action: str | None = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
) -> dict:
    limit = max(1, min(limit, 500))
    offset = max(0, offset)
    rows, total = audit_service.list_logs(
        db, actor_id=actor_id, action=action, limit=limit, offset=offset
    )
    items = [
        {
            "id": r.id, "actor_id": r.actor_id, "action": r.action,
            "target_type": r.target_type, "target_id": r.target_id,
            "ip": r.ip, "user_agent": r.user_agent, "payload": r.payload,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
    return {"items": items, "total": total}


# ----- Anagrafica utenti (CRUD admin) -----

class UserListItem(BaseModel):
    id: int
    username: str
    email: str
    full_name: str | None
    department: str | None
    auth_source: str
    is_active: bool
    roles: list[str] = []
    created_at: datetime | None = None


class UserCreateIn(BaseModel):
    email: EmailStr
    username: str
    password: str
    full_name: str | None = None
    department: str | None = None
    role: str | None = None


class UserUpdateIn(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = None
    department: str | None = None
    is_active: bool | None = None


def _to_item(u: User) -> UserListItem:
    return UserListItem(
        id=u.id, username=u.username, email=u.email, full_name=u.full_name,
        department=u.department, auth_source=u.auth_source, is_active=u.is_active,
        roles=sorted(r.name for r in u.roles), created_at=u.created_at,
    )


@router.get(
    "/users",
    response_model=dict,
    dependencies=[Depends(require_permission(_PERM))],
)
def list_users(
    q: str | None = None,
    active: bool | None = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
) -> dict:
    stmt = select(User)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(User.username.like(like), User.email.like(like), User.full_name.like(like)))
    if active is not None:
        stmt = stmt.where(User.is_active == active)
    total = len(list(db.scalars(stmt).all()))
    rows = db.scalars(stmt.order_by(User.id.desc()).limit(min(limit, 500)).offset(max(offset, 0))).all()
    return {"items": [_to_item(u).model_dump(mode="json") for u in rows], "total": total}


@router.post(
    "/users",
    response_model=UserListItem,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission(_PERM))],
)
def create_user(payload: UserCreateIn, request: Request, db: Session = Depends(get_db),
                actor: User = Depends(get_current_user)) -> UserListItem:
    try:
        user = user_service.create_user(
            db, email=payload.email, username=payload.username, password=payload.password
        )
        if payload.full_name is not None:
            user.full_name = payload.full_name
        if payload.department is not None:
            user.department = payload.department
        if payload.role:
            user_service.assign_role(db, user, payload.role)
        db.flush()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    audit_service.log(db, action="user.create", actor_id=actor.id,
                      target_type="user", target_id=user.id, ip=_ip(request))
    db.commit()
    db.refresh(user)
    return _to_item(user)


@router.patch(
    "/users/{user_id}",
    response_model=UserListItem,
    dependencies=[Depends(require_permission(_PERM))],
)
def update_user(user_id: int, payload: UserUpdateIn, request: Request,
                db: Session = Depends(get_db),
                actor: User = Depends(get_current_user)) -> UserListItem:
    u = db.get(User, user_id)
    if u is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="utente non trovato")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(u, k, v)
    db.flush()
    audit_service.log(db, action="user.update", actor_id=actor.id,
                      target_type="user", target_id=user_id, ip=_ip(request),
                      payload=data)
    db.commit()
    db.refresh(u)
    return _to_item(u)


@router.post(
    "/users/{user_id}/roles/{role_name}",
    response_model=UserListItem,
    dependencies=[Depends(require_permission(_PERM))],
)
def assign_role(user_id: int, role_name: str, request: Request,
                db: Session = Depends(get_db),
                actor: User = Depends(get_current_user)) -> UserListItem:
    u = db.get(User, user_id)
    if u is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="utente non trovato")
    try:
        user_service.assign_role(db, u, role_name)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    audit_service.log(db, action="user.role_assign", actor_id=actor.id,
                      target_type="user", target_id=user_id, ip=_ip(request),
                      payload={"role": role_name})
    db.commit()
    db.refresh(u)
    return _to_item(u)


@router.get(
    "/roles",
    response_model=list[str],
    dependencies=[Depends(require_permission(_PERM))],
)
def list_roles(db: Session = Depends(get_db)) -> list[str]:
    rows = db.scalars(select(Role.name).order_by(Role.name)).all()
    return list(rows)
