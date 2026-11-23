"""Pictures in a .docx -> draft assets and top-level <img> blocks (SPEC-template-store.md v1.15)."""

from __future__ import annotations

import posixpath
import re
from decimal import Decimal
from xml.etree.ElementTree import Element

from ..assets import detect
from ..errors import StoreError
from ..limits import ASSET_FILE
from .body import Ctx

WP = "{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
EMU_PER_MM = Decimal(36000)
KINDS = ("png", "jpg", "jpeg", "gif")


def _asset_name(ctx: Ctx, path: str, data: bytes) -> str:
    base = re.sub(r"[^A-Za-z0-9._-]", "-", posixpath.basename(path)).lstrip("._-") or "image.png"
    stem, ext = base.rsplit(".", 1) if "." in base else (base, "png")
    stem = stem[:80] or "image"
    name, n = f"{stem}.{ext.lower()}", 1
    while name in ctx.assets and ctx.assets[name] != data:  # the same picture twice is one asset
        n += 1
        name = f"{stem}-{n}.{ext.lower()}"
    return name


def drawing(ctx: Ctx, el: Element) -> str | None:
    if el.find(WP + "anchor") is not None:
        ctx.warn(
            "DOCX_FLOATING_IMAGE",
            'รูปที่วางลอย (ไม่ได้อยู่ในบรรทัด) ข้ามไป: ตั้งเป็น "อยู่ในบรรทัดกับข้อความ" ใน Word แล้วนำเข้าใหม่',
        )
        return None
    inline = el.find(WP + "inline")
    if inline is None:
        return None
    if any(e.tag.endswith("}txbx") for e in inline.iter()):
        ctx.warn("DOCX_TEXTBOX", "text box ข้ามไป (ข้อความในนั้นไม่ถูกนำเข้า)")
        return None
    blip = inline.find(f".//{A}blip")
    if blip is None:
        ctx.warn("DOCX_SHAPE", "รูปทรง/กราฟ/SmartArt ข้ามไป")
        return None
    path = ctx.rels.get(blip.get(R + "embed") or "")
    if path is None:
        ctx.warn("DOCX_EXTERNAL_IMAGE", "รูปที่ลิงก์จากภายนอกไฟล์ข้ามไป")
        return None
    ext = path.rsplit(".", 1)[-1].lower()
    if ext not in KINDS:
        ctx.warn("DOCX_IMAGE_TYPE", f"รูปชนิด .{ext} ข้ามไป (ใช้ได้ png, jpg, gif)")
        return None
    try:
        data = ctx.pkg.read(path, ctx.image_limit)
    except StoreError:
        limit = ctx.image_limit // (1024 * 1024)
        ctx.warn("DOCX_IMAGE_TOO_LARGE", f"รูป {posixpath.basename(path)} ใหญ่เกิน {limit} MB ข้ามไป")
        return None
    name = _asset_name(ctx, path, data)
    try:
        if not ASSET_FILE.match(name):
            raise StoreError("UNSUPPORTED_MEDIA_TYPE", name)
        detect(name, data)
    except StoreError:
        ctx.warn("DOCX_IMAGE_TYPE", f"รูป {posixpath.basename(path)} อ่านไม่ได้ ข้ามไป")
        return None
    ctx.assets[name] = data
    extent = inline.find(WP + "extent")
    cx = Decimal(extent.get("cx") or 0) if extent is not None else Decimal(0)
    width = (cx / EMU_PER_MM).quantize(Decimal("0.1")) if cx else Decimal(40)
    return f'<img src="{name}" alt="" style="width: {format(width.normalize(), "f")}mm">'
