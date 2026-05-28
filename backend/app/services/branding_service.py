"""Branding: upload logo + generazione favicon (32x32 ICO)."""
import io
import os
from pathlib import Path

from PIL import Image

from app.core.config import get_settings

ALLOWED_EXT = {"png", "jpg", "jpeg", "gif"}
MAX_LOGO_BYTES = 5 * 1024 * 1024  # 5 MB


def _branding_dir() -> Path:
    upload = Path(get_settings().upload_dir) / "branding"
    upload.mkdir(parents=True, exist_ok=True)
    return upload


def logo_path() -> Path | None:
    """Ritorna il path del logo salvato (se presente)."""
    d = _branding_dir()
    for ext in ALLOWED_EXT:
        p = d / f"logo.{ext}"
        if p.exists():
            return p
    return None


def favicon_path() -> Path:
    return _branding_dir() / "favicon.ico"


def save_logo(content: bytes, ext: str) -> dict:
    """Salva il logo (sostituendo eventuali file precedenti) + genera favicon ICO."""
    ext = (ext or "").lower().lstrip(".")
    if ext not in ALLOWED_EXT:
        raise ValueError(f"estensione non supportata: {ext}")
    if len(content) > MAX_LOGO_BYTES:
        raise ValueError("file troppo grande (>5 MB)")

    # apri immagine per validare
    try:
        img = Image.open(io.BytesIO(content))
        img.verify()
        img = Image.open(io.BytesIO(content))  # reopen dopo verify
    except Exception as exc:
        raise ValueError(f"immagine non valida: {exc}")

    d = _branding_dir()
    # rimuovi precedenti
    for old in ALLOWED_EXT:
        try:
            (d / f"logo.{old}").unlink(missing_ok=True)
        except Exception:
            pass

    logo_file = d / f"logo.{ext}"
    logo_file.write_bytes(content)

    # genera favicon 32x32 (multi-size 16,32,48)
    fav = img.convert("RGBA")
    sizes = [(16, 16), (32, 32), (48, 48)]
    # quadrato croppato centrato
    w, h = fav.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    fav_sq = fav.crop((left, top, left + side, top + side))
    fav_resized = fav_sq.resize((48, 48), Image.LANCZOS)
    favicon_file = favicon_path()
    fav_resized.save(favicon_file, format="ICO", sizes=sizes)

    return {
        "logo_filename": logo_file.name,
        "logo_size": len(content),
        "favicon_filename": favicon_file.name,
    }


def delete_branding() -> None:
    d = _branding_dir()
    for ext in ALLOWED_EXT:
        try:
            (d / f"logo.{ext}").unlink(missing_ok=True)
        except Exception:
            pass
    try:
        favicon_path().unlink(missing_ok=True)
    except Exception:
        pass
