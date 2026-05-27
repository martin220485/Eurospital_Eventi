from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mysql_host: str = "127.0.0.1"
    mysql_port: int = 3306
    mysql_db: str = "eventi_dev"
    mysql_user: str = "eventi"
    mysql_password: str = "eventi"

    database_url: str | None = None
    test_database_url: str | None = None

    jwt_secret: str = "dev-insecure-change-me-please-set-a-real-secret"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    app_secret_key: str = "dev-insecure-change-me"
    setup_token: str = "dev-setup-token-change-me"

    @property
    def sqlalchemy_url(self) -> str:
        if self.database_url:
            return self.database_url
        return (
            f"mysql+pymysql://{self.mysql_user}:{self.mysql_password}"
            f"@{self.mysql_host}:{self.mysql_port}/{self.mysql_db}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
