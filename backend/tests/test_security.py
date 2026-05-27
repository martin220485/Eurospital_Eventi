import pytest

from app.core import security


def test_hash_and_verify_password():
    hashed = security.hash_password("s3cret")
    assert hashed != "s3cret"
    assert security.verify_password("s3cret", hashed) is True
    assert security.verify_password("wrong", hashed) is False


def test_access_token_roundtrip():
    token = security.create_access_token("42")
    payload = security.decode_token(token)
    assert payload["sub"] == "42"
    assert payload["type"] == "access"


def test_decode_rejects_tampered_token():
    token = security.create_access_token("1")
    with pytest.raises(security.TokenError):
        security.decode_token(token + "x")


def test_refresh_token_helpers():
    raw = security.generate_refresh_token()
    assert len(raw) >= 32
    h = security.hash_refresh_token(raw)
    assert h == security.hash_refresh_token(raw)
    assert h != raw
