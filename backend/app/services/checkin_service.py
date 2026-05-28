from sqlalchemy.orm import Session

from app.core.security import TokenError, decode_checkin_token
from app.models import Checkin, Registration


class CheckinError(Exception):
    def __init__(self, message: str, code: int):
        super().__init__(message)
        self.code = code


def check_in(db: Session, *, token: str, operator_id: int | None) -> Registration:
    try:
        reg_id = decode_checkin_token(token)
    except TokenError:
        raise CheckinError("invalid token", 400)
    reg = db.get(Registration, reg_id)
    if reg is None:
        raise CheckinError("registration not found", 404)
    if reg.status == "attended":
        raise CheckinError("already checked in", 409)
    if reg.status != "confirmed":
        raise CheckinError("registration not in a checkable state", 422)
    reg.status = "attended"
    db.add(Checkin(registration_id=reg.id, checked_in_by=operator_id))
    db.flush()
    return reg
