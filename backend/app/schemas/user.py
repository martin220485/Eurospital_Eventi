from pydantic import BaseModel


class UserOut(BaseModel):
    id: int
    email: str
    username: str
    full_name: str | None
    roles: list[str]
    permissions: list[str]
