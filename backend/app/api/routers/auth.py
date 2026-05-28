from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models import User
from app.schemas.auth import ChangePasswordIn, LoginRequest, RefreshRequest, TokenPair
from app.schemas.user import UserOut
from app.services import audit_service, auth_service, user_service


def _ip_ua(request: Request) -> tuple[str, str]:
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (
        request.client.host if request.client else ""
    )
    ua = request.headers.get("user-agent", "")
    return ip, ua

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenPair)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)) -> TokenPair:
    ip, ua = _ip_ua(request)
    user = auth_service.authenticate(db, payload.identifier, payload.password)
    if user is None:
        audit_service.log(
            db, action="auth.login.fail", ip=ip, user_agent=ua,
            payload={"identifier": payload.identifier},
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenziali non valide"
        )
    access, refresh = auth_service.issue_token_pair(db, user)
    audit_service.log(
        db, action="auth.login.success", actor_id=user.id, ip=ip, user_agent=ua,
    )
    db.commit()
    return TokenPair(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=TokenPair)
def refresh(payload: RefreshRequest, request: Request, db: Session = Depends(get_db)) -> TokenPair:
    ip, ua = _ip_ua(request)
    try:
        access, new_refresh = auth_service.rotate_refresh(db, payload.refresh_token)
    except auth_service.AuthError:
        audit_service.log(db, action="auth.refresh.fail", ip=ip, user_agent=ua)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token non valido"
        )
    audit_service.log(db, action="auth.refresh", ip=ip, user_agent=ua)
    db.commit()
    return TokenPair(access_token=access, refresh_token=new_refresh)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(payload: RefreshRequest, request: Request, db: Session = Depends(get_db)) -> Response:
    ip, ua = _ip_ua(request)
    auth_service.revoke_refresh(db, payload.refresh_token)
    audit_service.log(db, action="auth.logout", ip=ip, user_agent=ua)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(payload: ChangePasswordIn, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)) -> Response:
    try:
        auth_service.change_password(db, user, old_password=payload.old_password,
                                     new_password=payload.new_password)
    except auth_service.AuthError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vecchia password errata")
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/hints")
def auth_hints(db: Session = Depends(get_db)) -> dict:
    """Hint pubblico per la pagina login (sso attivo, label directory)."""
    from app.services import settings_service
    try:
        ldap_cfg = settings_service.get_ldap(db)
    except Exception:
        return {"sso_enabled": False, "directory_label": None}
    return {
        "sso_enabled": bool(ldap_cfg.sso_enabled),
        "directory_label": "Active Directory aziendale" if ldap_cfg.sso_enabled else None,
    }


@router.get("/me", response_model=UserOut)
def me(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> UserOut:
    perms = sorted(user_service.get_user_permissions(db, user))
    return UserOut(
        id=user.id,
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        roles=sorted(r.name for r in user.roles),
        permissions=perms,
    )
