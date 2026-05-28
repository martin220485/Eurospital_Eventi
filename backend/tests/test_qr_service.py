from app.services.qr_service import png_for_token


def test_png_for_token_returns_png_bytes():
    data = png_for_token("some-token-string")
    assert isinstance(data, bytes)
    assert data[:8] == b"\x89PNG\r\n\x1a\n"  # PNG magic header
