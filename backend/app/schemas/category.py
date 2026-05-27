from pydantic import BaseModel, Field


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    color: str = "#0a66c2"
    description: str | None = None


class CategoryOut(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    name: str
    color: str
    description: str | None = None
