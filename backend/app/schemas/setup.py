from pydantic import BaseModel, EmailStr, Field


class SetupStatus(BaseModel):
    setup_completed: bool
    current_step: int


class OpResult(BaseModel):
    ok: bool
    error: str | None = None


class MigrateResult(BaseModel):
    revision: str
    tables: list[str]
    views: list[str]


class AdminCreate(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=8, max_length=128)


class SmtpIn(BaseModel):
    host: str
    port: int
    tls_mode: str = "starttls"
    from_address: EmailStr
    from_name: str | None = None
    username: str | None = None
    password: str | None = None


class SmtpTestIn(SmtpIn):
    pass


class LdapIn(BaseModel):
    server_uri: str
    base_dn: str
    bind_dn: str
    bind_pw: str | None = None
    user_filter: str | None = None
    group_filter: str | None = None
    attr_mapping: dict = {}
    users_group: str | None = None
    admins_group: str | None = None
    sso_enabled: bool = False


class LdapTestIn(BaseModel):
    server_uri: str
    bind_dn: str
    bind_pw: str


class PlatformIn(BaseModel):
    name: str
    logo_url: str | None = None
    primary_color: str = "#0a66c2"
    language: str = "it"
    timezone: str = "Europe/Rome"
    public_url: str | None = None
    retention_days: int | None = None
