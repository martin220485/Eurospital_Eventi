from pydantic import BaseModel


class CheckinIn(BaseModel):
    token: str


class CheckinResult(BaseModel):
    registration_id: int
    user_id: int
    username: str
    event_title: str
    status: str
