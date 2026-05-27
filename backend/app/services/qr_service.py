import io

import segno


def png_for_token(token: str) -> bytes:
    qr = segno.make(token, error="m")
    buf = io.BytesIO()
    qr.save(buf, kind="png", scale=5, border=2)
    return buf.getvalue()
