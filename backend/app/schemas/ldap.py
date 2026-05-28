from pydantic import BaseModel


class LdapSettingsOut(BaseModel):
    sso_enabled: bool
    server_uri: str | None
    base_dn: str | None
    bind_dn: str | None
    user_filter: str | None
    group_filter: str | None
    attr_mapping: dict
    users_group: str | None
    admins_group: str | None
    has_bind_password: bool


class LdapSettingsIn(BaseModel):
    sso_enabled: bool = False
    server_uri: str | None = None
    base_dn: str | None = None
    bind_dn: str | None = None
    bind_password: str | None = None
    user_filter: str | None = None
    group_filter: str | None = None
    attr_mapping: dict = {}
    users_group: str | None = None
    admins_group: str | None = None


class LdapPreviewOut(BaseModel):
    dn: str
    attrs: dict
    groups: list[str]
    mapped_roles: list[str]


class LdapSyncResult(BaseModel):
    ok: bool
    action: str | None = None
    user_id: int | None = None
    created: int | None = None
    updated: int | None = None
    errors: int | None = None
    message: str | None = None


class LdapTestResult(BaseModel):
    ok: bool
    message: str | None = None
