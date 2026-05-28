"""DB engine bootstrap + swap a runtime per cambio target.

Bootstrap: usa `Settings.sqlalchemy_url` (env). Dopo il boot, se in
`platform_settings.db_override_encrypted` esiste un override, l'app può
richiamare `apply_db_override()` per rifare l'engine con i nuovi parametri.
Le richieste in volo terminano col vecchio engine.
"""
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings


def _make_engine(url: str) -> Engine:
    return create_engine(url, pool_pre_ping=True, future=True)


def _make_session(eng: Engine):
    return sessionmaker(bind=eng, autoflush=False, expire_on_commit=False, class_=Session)


engine: Engine = _make_engine(get_settings().sqlalchemy_url)
SessionLocal = _make_session(engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def swap_engine(new_url: str) -> None:
    """Sostituisce engine globale e rifa il bind del sessionmaker in-place.

    Usa SessionLocal.configure(bind=...) per mantenere lo stesso oggetto
    sessionmaker: i moduli che hanno già importato SessionLocal continuano
    a vedere il nuovo bind senza dover essere reimportati.
    """
    global engine
    old = engine
    new_eng = _make_engine(new_url)
    # smoke ping
    with new_eng.connect() as c:
        c.exec_driver_sql("SELECT 1")
    engine = new_eng
    SessionLocal.configure(bind=new_eng)
    try:
        old.dispose()
    except Exception:
        pass


def apply_db_override_from_settings() -> bool:
    """Legge platform_settings.db_override_encrypted; se presente, swappa engine.

    Ritorna True se è stato applicato un override.
    """
    from app.core.crypto import decrypt
    from app.models import PlatformSettings

    db = SessionLocal()
    try:
        cfg = db.get(PlatformSettings, 1)
        if cfg is None or not cfg.db_override_encrypted:
            return False
        try:
            new_url = decrypt(cfg.db_override_encrypted)
        except Exception:
            return False
    finally:
        db.close()
    if not new_url:
        return False
    try:
        swap_engine(new_url)
        return True
    except Exception:
        return False
