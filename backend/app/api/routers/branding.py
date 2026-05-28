"""Upload logo + servizio pubblico di logo + favicon."""
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_permission
from app.models import User
from app.services import audit_service, branding_service

router = APIRouter(tags=["branding"])

_PERM = "users.admin"


@router.post(
    "/api/admin/platform/logo",
    dependencies=[Depends(require_permission(_PERM))],
)
async def upload_logo(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
) -> dict:
    fname = file.filename or ""
    ext = fname.rsplit(".", 1)[-1] if "." in fname else ""
    content = await file.read()
    try:
        res = branding_service.save_logo(content, ext)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (
        request.client.host if request.client else ""
    )
    audit_service.log(db, action="branding.logo.update", actor_id=actor.id,
                      target_type="branding", target_id=1, ip=ip,
                      payload={"filename": res["logo_filename"], "size": res["logo_size"]})
    db.commit()
    return {"ok": True, **res}


@router.delete(
    "/api/admin/platform/logo",
    dependencies=[Depends(require_permission(_PERM))],
)
def delete_logo(request: Request, db: Session = Depends(get_db),
                actor: User = Depends(get_current_user)) -> dict:
    branding_service.delete_branding()
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (
        request.client.host if request.client else ""
    )
    audit_service.log(db, action="branding.logo.delete", actor_id=actor.id,
                      target_type="branding", target_id=1, ip=ip)
    db.commit()
    return {"ok": True}


@router.get("/api/public/logo")
def public_logo() -> Response:
    p = branding_service.logo_path()
    if p is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="no logo")
    media = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
             "gif": "image/gif"}.get(p.suffix.lstrip(".").lower(), "application/octet-stream")
    return FileResponse(str(p), media_type=media)


@router.get("/favicon.ico")
def favicon() -> Response:
    p = branding_service.favicon_path()
    if not p.exists():
        # 404 vuoto evita errori bruttosi su browser senza branding configurato
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    return FileResponse(str(p), media_type="image/x-icon")
