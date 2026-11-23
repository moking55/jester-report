"""Open an uploaded .docx without trusting it (SPEC-template-store.md v1.15 "ความปลอดภัย").

A .docx is a zip of XML parts in folders, so the flat template-zip reader does not apply; the same rules do:
a size cap, an entry cap, sizes counted from the bytes actually inflated, no paths out of the package, no
symlinks or encrypted entries, and no DOCTYPE in any XML part (no entity expansion, no external entities).
"""

from __future__ import annotations

import io
import posixpath
import stat
import zipfile
from xml.etree import ElementTree as ET

from ..bundle import _read
from ..errors import StoreError

MAX_DOCX_BYTES = 25 * 1024 * 1024
MAX_ENTRIES = 1000
MAX_XML_BYTES = 10 * 1024 * 1024
OLE_MAGIC = bytes.fromhex("d0cf11e0a1b11ae1")  # encrypted .docx and old .doc are OLE files, not zips
NOT_WORD = "ไม่ใช่ไฟล์ Word (.docx)"


def _invalid(message: str) -> StoreError:
    return StoreError("INPUT_INVALID", message)


class Package:
    def __init__(self, zf: zipfile.ZipFile, infos: dict[str, zipfile.ZipInfo]) -> None:
        self._zf, self._infos = zf, infos

    def has(self, name: str) -> bool:
        return name in self._infos

    def read(self, name: str, limit: int) -> bytes:
        return _read(self._zf, self._infos[name], limit, "part")

    def xml(self, name: str) -> ET.Element | None:
        """The part parsed, or None when the package does not have it."""
        if name not in self._infos:
            return None
        raw = self.read(name, MAX_XML_BYTES)
        if b"<!DOCTYPE" in raw.upper():
            raise _invalid(f"{name}: a DOCTYPE is not allowed")
        try:
            return ET.fromstring(raw)
        except ET.ParseError:
            raise _invalid(f"{name} is not valid XML") from None

    def rels(self, part: str) -> dict[str, str]:
        """rId -> part name inside the package; external targets and paths out of the package are left out."""
        folder, base = posixpath.split(part)
        root = self.xml(posixpath.join(folder, "_rels", f"{base}.rels"))
        out: dict[str, str] = {}
        for rel in root if root is not None else ():
            rid, target = rel.get("Id"), rel.get("Target") or ""
            if not rid or rel.get("TargetMode") == "External":
                continue
            path = posixpath.normpath(
                target.lstrip("/") if target.startswith("/") else posixpath.join(folder, target)
            )
            if not path.startswith("../") and path != ".." and path in self._infos:
                out[rid] = path
        return out


def open_docx(data: bytes) -> Package:
    if len(data) > MAX_DOCX_BYTES:
        raise StoreError("PAYLOAD_TOO_LARGE", f"a Word file is at most {MAX_DOCX_BYTES // (1024 * 1024)} MB")
    if data.startswith(OLE_MAGIC):
        raise _invalid("ไฟล์ Word นี้เข้ารหัส/มีรหัสผ่าน หรือเป็น .doc รุ่นเก่า: เปิดใน Word แล้วบันทึกเป็น .docx ที่ไม่มีรหัสผ่าน")
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise _invalid(NOT_WORD) from None
    infos = zf.infolist()
    if len(infos) > MAX_ENTRIES:
        raise StoreError("PAYLOAD_TOO_LARGE", f"a Word file holds at most {MAX_ENTRIES} parts")
    by_name: dict[str, zipfile.ZipInfo] = {}
    for info in infos:
        name = info.filename
        parts = name.split("/")
        if name.startswith("/") or "\\" in name or ".." in parts or (len(name) > 1 and name[1] == ":"):
            raise _invalid(f"part outside the package: {name[:100]}")
        if stat.S_ISLNK(info.external_attr >> 16) or info.flag_bits & 0x1:
            raise _invalid(f"symlinked or encrypted part: {name[:100]}")
        if info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
            raise _invalid("parts must be stored or deflated")
        if not info.is_dir():
            by_name[name] = info
    if "[Content_Types].xml" not in by_name or "word/document.xml" not in by_name:
        raise _invalid(NOT_WORD)
    return Package(zf, by_name)
