"""Asset type from bytes, never from the client's Content-Type (SPEC-template-store.md)."""

from __future__ import annotations

import hashlib
import io
import re

from fontTools.ttLib import TTFont

from ..report_definition.problems import AssetInfo
from .errors import StoreError

# extension -> content type; woff2 is not accepted in v1 (ttf/otf cover Thai document fonts)
CONTENT_TYPES = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "svg": "image/svg+xml",
    "ttf": "font/ttf",
    "otf": "font/otf",
}
_MAGIC = {
    "png": (b"\x89PNG\r\n\x1a\n",),
    "jpg": (b"\xff\xd8\xff",),
    "jpeg": (b"\xff\xd8\xff",),
    "ttf": (b"\x00\x01\x00\x00", b"true"),
    "otf": (b"OTTO",),
}
_SVG_START = re.compile(rb"^\s*(?:<\?xml[^>]*>\s*|<!--.*?-->\s*|<!DOCTYPE[^>]*>\s*)*<svg[\s>]", re.S | re.I)


def _unsupported(name: str) -> StoreError:
    return StoreError(
        "UNSUPPORTED_MEDIA_TYPE", f"{name!r} is not a {', '.join(sorted(set(CONTENT_TYPES)))} file"
    )


def font_family(data: bytes) -> str | None:
    """Typographic family (name ID 16) when present, else the legacy family (name ID 1)."""
    try:
        font = TTFont(io.BytesIO(data), lazy=True)
        names = font["name"]
    except Exception:  # fontTools raises many types on broken files; any failure = not a usable font
        return None
    for name_id in (16, 1):
        value = names.getDebugName(name_id)
        if value:
            return value.strip()
    return None


def detect(name: str, data: bytes) -> AssetInfo:
    """AssetInfo for an upload, or UNSUPPORTED_MEDIA_TYPE when the bytes do not match the extension."""
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in CONTENT_TYPES:
        raise _unsupported(name)
    if ext == "svg":
        ok = bool(_SVG_START.match(data.removeprefix(b"\xef\xbb\xbf")[:4096]))
    else:
        ok = data.startswith(_MAGIC[ext])
    family = font_family(data) if ok and ext in ("ttf", "otf") else None
    if not ok or (ext in ("ttf", "otf") and family is None):
        raise _unsupported(name)
    return AssetInfo(CONTENT_TYPES[ext], hashlib.sha256(data).hexdigest(), family)
