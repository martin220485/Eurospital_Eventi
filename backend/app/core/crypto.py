import base64
import hashlib

from cryptography.fernet import Fernet

from app.core.config import get_settings


def _fernet() -> Fernet:
    # Derive a stable 32-byte urlsafe key from APP_SECRET_KEY.
    digest = hashlib.sha256(get_settings().app_secret_key.encode()).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    return _fernet().decrypt(token.encode()).decode()
