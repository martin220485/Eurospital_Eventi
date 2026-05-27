from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_setup_open, require_setup_token
from app.schemas.setup import (
    AdminCreate,
    LdapIn,
    LdapTestIn,
    MigrateResult,
    OpResult,
    PlatformIn,
    SetupStatus,
    SmtpIn,
    SmtpTestIn,
)
from app.services import setup_service, settings_service

router = APIRouter(prefix="/api/setup", tags=["setup"])

_gated = [Depends(require_setup_open), Depends(require_setup_token)]


@router.get("/status", response_model=SetupStatus)
def get_status(db: Session = Depends(get_db)) -> SetupStatus:
    return SetupStatus(**setup_service.status(db))


@router.post("/db/test", response_model=OpResult, dependencies=_gated)
def db_test() -> OpResult:
    return OpResult(**setup_service.test_db_connection())


@router.post("/db/migrate", response_model=MigrateResult, dependencies=_gated)
def db_migrate(db: Session = Depends(get_db)) -> MigrateResult:
    result = setup_service.run_migrations()
    setup_service.set_step(db, 4)
    db.commit()
    return MigrateResult(**result)


@router.post("/admin", status_code=status.HTTP_201_CREATED, dependencies=_gated)
def create_admin(payload: AdminCreate, db: Session = Depends(get_db)) -> dict:
    try:
        user = setup_service.create_first_admin(
            db, email=payload.email, username=payload.username, password=payload.password
        )
    except setup_service.SetupError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    setup_service.set_step(db, 5)
    db.commit()
    return {"id": user.id, "username": user.username}


@router.put("/smtp", dependencies=_gated)
def save_smtp(payload: SmtpIn, db: Session = Depends(get_db)) -> dict:
    settings_service.save_smtp(
        db,
        host=payload.host,
        port=payload.port,
        tls_mode=payload.tls_mode,
        from_address=payload.from_address,
        from_name=payload.from_name,
        username=payload.username,
        password=payload.password,
    )
    setup_service.set_step(db, 6)
    db.commit()
    return settings_service.smtp_masked(db)


@router.post("/smtp/test", response_model=OpResult, dependencies=_gated)
def smtp_test(payload: SmtpTestIn) -> OpResult:
    return OpResult(
        **setup_service.test_smtp(
            host=payload.host,
            port=payload.port,
            tls_mode=payload.tls_mode,
            username=payload.username,
            password=payload.password,
            from_address=payload.from_address,
        )
    )


@router.put("/ad", dependencies=_gated)
def save_ad(payload: LdapIn, db: Session = Depends(get_db)) -> dict:
    settings_service.save_ldap(
        db,
        server_uri=payload.server_uri,
        base_dn=payload.base_dn,
        bind_dn=payload.bind_dn,
        bind_pw=payload.bind_pw,
        user_filter=payload.user_filter,
        group_filter=payload.group_filter,
        attr_mapping=payload.attr_mapping,
        users_group=payload.users_group,
        admins_group=payload.admins_group,
        sso_enabled=payload.sso_enabled,
    )
    setup_service.set_step(db, 7)
    db.commit()
    return {"ok": True}


@router.post("/ad/test", response_model=OpResult, dependencies=_gated)
def ad_test(payload: LdapTestIn) -> OpResult:
    return OpResult(
        **setup_service.test_ldap(
            server_uri=payload.server_uri, bind_dn=payload.bind_dn, bind_pw=payload.bind_pw
        )
    )


@router.put("/platform", dependencies=_gated)
def save_platform(payload: PlatformIn, db: Session = Depends(get_db)) -> dict:
    settings_service.save_platform(db, **payload.model_dump())
    setup_service.set_step(db, 8)
    db.commit()
    return payload.model_dump()


@router.post("/complete", dependencies=_gated)
def complete(db: Session = Depends(get_db)) -> dict:
    try:
        setup_service.complete(db)
    except setup_service.SetupError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    db.commit()
    return {"setup_completed": True}
