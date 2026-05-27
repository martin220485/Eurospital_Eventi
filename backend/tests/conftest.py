import os

import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from alembic import command
from app.core.config import get_settings


def _test_url() -> str:
    settings = get_settings()
    url = settings.test_database_url or os.environ.get("TEST_DATABASE_URL")
    if not url:
        raise RuntimeError("TEST_DATABASE_URL must be set to run tests")
    return url


@pytest.fixture(scope="session")
def engine():
    eng = create_engine(_test_url(), pool_pre_ping=True, future=True)
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", _test_url())
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield eng
    eng.dispose()


@pytest.fixture
def db(engine):
    connection = engine.connect()
    trans = connection.begin()
    TestingSession = sessionmaker(bind=connection, autoflush=False, expire_on_commit=False)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()
        trans.rollback()
        connection.close()


@pytest.fixture
def client(db):
    from app.api.deps import get_db

    from app.main import app

    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
