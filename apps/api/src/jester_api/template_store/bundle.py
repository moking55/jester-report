"""Template zip: write and read the flat `jester.json` bundle (SPEC-template-store.md "A1"). No DB here.

Reading trusts nothing in the zip: names, counts and sizes are checked before and while reading, and sizes
are counted from the bytes actually inflated, never from the headers (a zip bomb lies there).
"""

from __future__ import annotations

import hashlib
import io
import json
import stat
import zipfile
from dataclasses import dataclass, field
from typing import Any

from ..tags import TagError, normalize_tags
from .errors import StoreError
from .limits import (
    ASSET_FILE,
    MAX_ASSET_BYTES,
    MAX_DRAFT_BYTES,
    MAX_FILES,
    MAX_TEXT_BYTES,
    REQUIRED_FILES,
    TEMPLATE_ID,
    TEXT_FILE,
)

FORMAT_VERSION = 1
MANIFEST = "jester.json"
MAX_ZIP_BYTES = 25 * 1024 * 1024
MAX_ENTRIES = 1 + 2 * MAX_FILES
MAX_MANIFEST_BYTES = 64 * 1024
_FIXED_TIME = (1980, 1, 1, 0, 0, 0)  # the same files give the same zip bytes
_CHUNK = 64 * 1024


@dataclass(frozen=True)
class Bundle:
    id: str
    name: str
    files: dict[str, str]
    assets: dict[str, bytes]
    tags: list[str] = field(default_factory=list)


def write_zip(manifest: dict[str, Any], files: dict[str, str], assets: dict[str, bytes]) -> bytes:
    """Entries sorted by name, deflated, with a fixed timestamp; `manifest` is written as given."""
    entries = {
        MANIFEST: json.dumps(manifest, ensure_ascii=False, indent=2).encode(),
        **{name: content.encode() for name, content in files.items()},
        **assets,
    }
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in sorted(entries):
            info = zipfile.ZipInfo(name, _FIXED_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            zf.writestr(info, entries[name])
    return out.getvalue()


def _invalid(message: str) -> StoreError:
    return StoreError("INPUT_INVALID", message)


def _too_large(message: str) -> StoreError:
    return StoreError("PAYLOAD_TOO_LARGE", message)


def _check_entry(info: zipfile.ZipInfo) -> None:
    name = info.filename
    if "/" in name or "\\" in name or name.startswith(".") or info.is_dir():
        raise _invalid(f"zip entries must be plain files at the top level: {name[:100]}")
    if stat.S_ISLNK(info.external_attr >> 16):
        raise _invalid(f"zip entry is a symlink: {name[:100]}")
    if info.flag_bits & 0x1:
        raise _invalid("encrypted zip entries are not supported")
    if info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
        raise _invalid("zip entries must be stored or deflated")


def _read(zf: zipfile.ZipFile, info: zipfile.ZipInfo, limit: int, what: str) -> bytes:
    """Inflate one entry, stopping as soon as it passes `limit` bytes."""
    out = bytearray()
    try:
        with zf.open(info) as f:
            while chunk := f.read(_CHUNK):
                out += chunk
                if len(out) > limit:
                    raise _too_large(f"{what} {info.filename} is larger than {limit // 1024} KB")
    except (zipfile.BadZipFile, EOFError, ValueError) as exc:  # bad CRC, truncated or corrupt deflate data
        raise _invalid(f"the zip is damaged: {info.filename}") from exc
    return bytes(out)


def _manifest(raw: bytes) -> dict[str, Any]:
    try:
        manifest = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise _invalid(f"{MANIFEST} is not valid UTF-8 JSON") from None
    if not isinstance(manifest, dict) or manifest.get("formatVersion") != FORMAT_VERSION:
        raise _invalid(f"{MANIFEST} must have formatVersion {FORMAT_VERSION}")
    template_id, name = manifest.get("id"), manifest.get("name")
    files, assets = manifest.get("files"), manifest.get("assets")
    if not (isinstance(template_id, str) and TEMPLATE_ID.match(template_id)):
        raise _invalid(f"{MANIFEST} has no valid template id")
    if not (isinstance(name, str) and 1 <= len(name.strip()) <= 120):
        raise _invalid(f"{MANIFEST} has no valid name")
    if not (isinstance(files, list) and all(isinstance(f, str) for f in files)):
        raise _invalid(f"{MANIFEST} files must be a list of names")
    if not (
        isinstance(assets, list)
        and all(
            isinstance(a, dict) and isinstance(a.get("name"), str) and isinstance(a.get("sha256"), str)
            for a in assets
        )
    ):
        raise _invalid(f"{MANIFEST} assets must be a list of {{name, sha256}}")
    try:
        manifest["tags"] = normalize_tags(manifest.get("tags"))  # optional: zips from before v1.11 have none
    except TagError as exc:
        raise _invalid(f"{MANIFEST} tags: {exc.message}") from None
    return manifest


def read_zip(data: bytes) -> Bundle:
    if len(data) > MAX_ZIP_BYTES:
        raise _too_large(f"a template zip is at most {MAX_ZIP_BYTES // (1024 * 1024)} MB")
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise _invalid("the upload is not a zip file") from None
    with zf:
        infos = zf.infolist()
        if len(infos) > MAX_ENTRIES:
            raise _too_large(f"a template zip holds at most {MAX_ENTRIES} entries")
        by_name: dict[str, zipfile.ZipInfo] = {}
        for info in infos:
            _check_entry(info)
            if info.filename in by_name:
                raise _invalid(f"zip entry appears twice: {info.filename}")
            by_name[info.filename] = info
        if MANIFEST not in by_name:
            raise _invalid(f"the zip has no {MANIFEST}; export it from Jester")
        manifest = _manifest(_read(zf, by_name.pop(MANIFEST), MAX_MANIFEST_BYTES, "manifest"))

        text_names = list(manifest["files"])
        asset_sha = {a["name"]: a["sha256"] for a in manifest["assets"]}
        listed = text_names + list(asset_sha)
        if len(set(listed)) != len(listed) or len(asset_sha) != len(manifest["assets"]):
            raise _invalid(f"{MANIFEST} lists a name twice")
        if set(listed) != set(by_name):
            raise _invalid(f"the zip entries and {MANIFEST} do not match")
        for name in text_names:
            if not TEXT_FILE.match(name):
                raise _invalid(f"not a valid text file name: {name[:100]}")
        for name in asset_sha:
            if not ASSET_FILE.match(name):
                raise _invalid(f"not a valid asset name: {name[:100]}")
        if len(text_names) > MAX_FILES or len(asset_sha) > MAX_FILES:
            raise _too_large(f"a draft holds at most {MAX_FILES} files and {MAX_FILES} assets")
        missing = [name for name in REQUIRED_FILES if name not in text_names]
        if missing:
            raise StoreError("CONFLICT", f"the zip has no {missing[0]}")

        total = 0
        files: dict[str, str] = {}
        for name in sorted(text_names):
            raw = _read(zf, by_name[name], MAX_TEXT_BYTES, "text file")
            total += len(raw)
            if total > MAX_DRAFT_BYTES:
                raise _too_large("the draft would be larger than 20 MB")
            try:
                text = raw.decode("utf-8")
            except UnicodeDecodeError:
                raise _invalid(f"{name} is not UTF-8 text") from None
            if "\x00" in text:
                raise _invalid(f"{name} contains NUL characters")
            files[name] = text
        assets: dict[str, bytes] = {}
        for name in sorted(asset_sha):
            raw = _read(zf, by_name[name], MAX_ASSET_BYTES, "asset")
            total += len(raw)
            if total > MAX_DRAFT_BYTES:
                raise _too_large("the draft would be larger than 20 MB")
            if hashlib.sha256(raw).hexdigest() != asset_sha[name]:
                raise _invalid(f"{name} does not match its sha256 in {MANIFEST}")
            assets[name] = raw
    return Bundle(manifest["id"], manifest["name"].strip(), files, assets, manifest["tags"])
