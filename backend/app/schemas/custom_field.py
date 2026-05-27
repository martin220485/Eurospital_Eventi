from pydantic import BaseModel

_OPTION_TYPES = {"radio", "select", "select_multi", "checkbox_multi"}
_FIELD_TYPES = {
    "text", "textarea", "number", "email", "phone", "date", "time", "datetime",
    "checkbox", "checkbox_multi", "radio", "select", "select_multi", "file", "privacy_consent",
}


class OptionIn(BaseModel):
    label: str
    value: str
    position: int = 0


class OptionOut(OptionIn):
    pass


class CustomFieldIn(BaseModel):
    label: str
    field_type: str
    required: bool = False
    placeholder: str | None = None
    default_value: str | None = None
    validation: dict = {}
    position: int = 0
    options: list[OptionIn] = []


class CustomFieldOut(BaseModel):
    id: int
    label: str
    field_type: str
    required: bool
    placeholder: str | None = None
    default_value: str | None = None
    validation: dict
    position: int
    options: list[OptionOut] = []


class CustomFieldSet(BaseModel):
    fields: list[CustomFieldIn]
