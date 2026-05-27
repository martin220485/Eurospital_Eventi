from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_permission
from app.schemas.category import CategoryIn, CategoryOut
from app.services import category_service

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut], dependencies=[Depends(require_permission("events.read"))])
def list_categories(db: Session = Depends(get_db)) -> list:
    return category_service.list_categories(db)


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_permission("categories.write"))])
def create(payload: CategoryIn, db: Session = Depends(get_db)) -> CategoryOut:
    try:
        cat = category_service.create(db, name=payload.name, color=payload.color,
                                      description=payload.description)
    except category_service.CategoryError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    db.commit()
    return cat


@router.patch("/{cat_id}", response_model=CategoryOut,
              dependencies=[Depends(require_permission("categories.write"))])
def update(cat_id: int, payload: CategoryIn, db: Session = Depends(get_db)) -> CategoryOut:
    try:
        cat = category_service.update(db, cat_id, name=payload.name, color=payload.color,
                                      description=payload.description)
    except category_service.CategoryError as exc:
        code = status.HTTP_404_NOT_FOUND if str(exc) == "not found" else status.HTTP_409_CONFLICT
        raise HTTPException(status_code=code, detail=str(exc))
    db.commit()
    return cat


@router.delete("/{cat_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_permission("categories.write"))])
def delete(cat_id: int, db: Session = Depends(get_db)) -> None:
    try:
        category_service.delete(db, cat_id)
    except category_service.CategoryError as exc:
        code = status.HTTP_404_NOT_FOUND if str(exc) == "not found" else status.HTTP_409_CONFLICT
        raise HTTPException(status_code=code, detail=str(exc))
    db.commit()
