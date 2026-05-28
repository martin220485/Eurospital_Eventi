from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_permission
from app.schemas.ldap import (
    LdapPreviewOut, LdapSettingsIn, LdapSettingsOut, LdapSyncResult, LdapTestResult,
)
from app.services import ldap_service, settings_service, setup_service

router = APIRouter(prefix="/api/admin/ldap", tags=["ldap"])

_PERM = "users.ldap_sync"


@router.get(
    "/settings",
    response_model=LdapSettingsOut,
    dependencies=[Depends(require_permission(_PERM))],
)
def get_settings(db: Session = Depends(get_db)) -> LdapSettingsOut:
    cfg = settings_service.get_ldap(db)
    return LdapSettingsOut(
        sso_enabled=cfg.sso_enabled,
        server_uri=cfg.server_uri,
        base_dn=cfg.base_dn,
        bind_dn=cfg.bind_dn,
        user_filter=cfg.user_filter,
        group_filter=cfg.group_filter,
        attr_mapping=cfg.attr_mapping or {},
        users_group=cfg.users_group,
        admins_group=cfg.admins_group,
        has_bind_password=bool(cfg.bind_pw_encrypted),
    )


@router.put(
    "/settings",
    response_model=LdapSettingsOut,
    dependencies=[Depends(require_permission(_PERM))],
)
def save_settings(payload: LdapSettingsIn, db: Session = Depends(get_db)) -> LdapSettingsOut:
    settings_service.save_ldap(
        db,
        bind_pw=payload.bind_password,
        server_uri=payload.server_uri,
        base_dn=payload.base_dn,
        bind_dn=payload.bind_dn,
        user_filter=payload.user_filter,
        group_filter=payload.group_filter,
        attr_mapping=payload.attr_mapping or {},
        users_group=payload.users_group,
        admins_group=payload.admins_group,
        sso_enabled=payload.sso_enabled,
    )
    db.commit()
    return get_settings(db=db)


@router.post(
    "/test-connection",
    response_model=LdapTestResult,
    dependencies=[Depends(require_permission(_PERM))],
)
def test_connection(db: Session = Depends(get_db)) -> LdapTestResult:
    cfg = settings_service.get_ldap(db)
    pw = settings_service.ldap_bind_password(db) or ""
    try:
        res = setup_service.test_ldap(
            server_uri=cfg.server_uri or "", bind_dn=cfg.bind_dn or "", bind_pw=pw,
        )
        return LdapTestResult(ok=bool(res.get("ok")), message=res.get("error"))
    except Exception as exc:
        return LdapTestResult(ok=False, message=str(exc))


@router.get(
    "/preview",
    response_model=LdapPreviewOut,
    dependencies=[Depends(require_permission(_PERM))],
)
def preview(username: str, db: Session = Depends(get_db)) -> LdapPreviewOut:
    try:
        info = ldap_service.find_user(db, username)
    except ldap_service.LdapError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    if info is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="utente non trovato in LDAP")
    cfg = settings_service.get_ldap(db)
    roles = ldap_service._mapped_roles(cfg, info["groups"])
    return LdapPreviewOut(
        dn=info["dn"], attrs=info["attrs"], groups=info["groups"], mapped_roles=roles,
    )


@router.post(
    "/sync-user/{username}",
    response_model=LdapSyncResult,
    dependencies=[Depends(require_permission(_PERM))],
)
def sync_user(username: str, db: Session = Depends(get_db)) -> LdapSyncResult:
    from app.models import User
    existing = db.query(User).filter_by(username=username).one_or_none()
    try:
        user = ldap_service.sync_user(db, username)
    except ldap_service.LdapError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    db.commit()
    return LdapSyncResult(
        ok=True, action=("updated" if existing else "created"), user_id=user.id,
    )


@router.post(
    "/sync-all",
    response_model=LdapSyncResult,
    dependencies=[Depends(require_permission(_PERM))],
)
def sync_all(db: Session = Depends(get_db)) -> LdapSyncResult:
    cfg = settings_service.get_ldap(db)
    if not cfg.users_group:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="users_group non configurato")
    try:
        res = ldap_service.sync_users_in_group(db, cfg.users_group)
    except ldap_service.LdapError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    db.commit()
    return LdapSyncResult(
        ok=True, created=res["created"], updated=res["updated"], errors=res["errors"],
    )
