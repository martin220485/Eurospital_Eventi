import pytest

from app.core.security import TokenError, create_checkin_token, decode_checkin_token


def test_checkin_token_roundtrip():
    tok = create_checkin_token(42)
    assert decode_checkin_token(tok) == 42


def test_decode_rejects_non_checkin_token():
    from app.core.security import create_access_token
    with pytest.raises(TokenError):
        decode_checkin_token(create_access_token("42"))


def test_decode_rejects_garbage():
    with pytest.raises(TokenError):
        decode_checkin_token("not-a-token")
