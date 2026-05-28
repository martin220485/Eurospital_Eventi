from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models import User
from app.services import gdpr_service

router = APIRouter(prefix="/api/me", tags=["me"])


@router.get("/data-export")
def data_export(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> JSONResponse:
    data = gdpr_service.export_for(db, user)
    return JSONResponse(
        content=data,
        headers={
            "Content-Disposition": f'attachment; filename="data-export-{user.id}.json"',
        },
    )
