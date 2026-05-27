from pydantic import BaseModel


class VisibilityIn(BaseModel):
    mode: str = "all"
    groups: list[str] = []


class VisibilityOut(BaseModel):
    mode: str
    groups: list[str]
