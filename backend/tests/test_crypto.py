from app.core import crypto


def test_encrypt_decrypt_roundtrip():
    secret = "smtp-password-123"
    token = crypto.encrypt(secret)
    assert token != secret
    assert crypto.decrypt(token) == secret


def test_encrypt_is_non_deterministic():
    a = crypto.encrypt("same")
    b = crypto.encrypt("same")
    assert a != b
    assert crypto.decrypt(a) == crypto.decrypt(b) == "same"
