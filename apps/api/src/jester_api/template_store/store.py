"""TemplateStore: templates, draft, versions (SPEC-template-store.md). All SQL lives here."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

from psycopg import AsyncConnection, errors
from psycopg_pool import AsyncConnectionPool

from ..report_definition.loader import content_sha256
from ..report_definition.problems import AssetInfo
from .assets import detect
from .blobs import BlobStore
from .errors import StoreError
from .starter import Starter, starter_files

MAX_TEXT_BYTES = 1024 * 1024
MAX_ASSET_BYTES = 5 * 1024 * 1024
MAX_DRAFT_BYTES = 20 * 1024 * 1024  # the engine's request limit
MAX_FILES = 50
REQUIRED_FILES = ("report.json", "template.html")

# patterns from public-api.yaml (TemplateId, TextFileName, AssetName)
TEMPLATE_ID = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}$")
TEXT_FILE = re.compile(r"^(?!index\.html$)[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.(html|json|css)$")
ASSET_FILE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.(png|jpe?g|svg|ttf|otf)$")


@dataclass(frozen=True)
class TextFile:
    name: str
    content: str
    sha256: str


@dataclass(frozen=True)
class Asset:
    name: str
    content_type: str
    size: int
    sha256: str
    font_family: str | None


@dataclass(frozen=True)
class TemplateSummary:
    id: str
    name: str
    published_version: int | None
    latest_version: int | None
    draft_revision: int
    draft_changed_since_publish: bool
    orientation: str | None  # from the draft's report.json when it parses
    updated_at: datetime


@dataclass(frozen=True)
class Draft:
    template_id: str
    revision: int
    based_on_version: int | None
    files: list[TextFile]
    assets: list[Asset]
    updated_at: datetime
    updated_by: str


@dataclass(frozen=True)
class Version:
    template_id: str
    version: int
    published_at: datetime
    published_by: str
    note: str | None
    sha256: str
    is_published: bool


@dataclass(frozen=True)
class VersionFiles:
    version: Version
    files: list[TextFile]
    assets: list[Asset]


@dataclass(frozen=True)
class StoredDefinition:
    """Feeds DefinitionInput(files, assets, fonts); sha256 equals definition_sha256 of that input."""

    template_id: str
    version: int | None  # None for the draft
    revision: int | None  # None for a version
    files: dict[str, str]
    assets: dict[str, AssetInfo]
    sha256: str


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _check(pattern: re.Pattern[str], value: str, what: str) -> None:
    if not pattern.match(value):
        raise StoreError("INPUT_INVALID", f"invalid {what} name")


def _check_name(name: str) -> str:
    name = name.strip()
    if not 1 <= len(name) <= 120:
        raise StoreError("INPUT_INVALID", "template name must be 1-120 characters")
    return name


def _orientation(report_json: str | None) -> str | None:
    try:
        page = json.loads(report_json or "").get("page") or {}
        return page.get("orientation", "portrait")
    except (ValueError, AttributeError):
        return None


class TemplateStore:
    def __init__(self, db: AsyncConnectionPool, blobs: BlobStore) -> None:
        self._db = db
        self._blobs = blobs

    # ---- helpers ---------------------------------------------------------------------------------------
    @staticmethod
    async def _one(conn: AsyncConnection, sql: str, args: tuple[Any, ...] = ()) -> Any:
        cur = await conn.execute(sql, args)  # type: ignore[arg-type]
        return await cur.fetchone()

    @staticmethod
    async def _all(conn: AsyncConnection, sql: str, args: tuple[Any, ...] = ()) -> list[Any]:
        cur = await conn.execute(sql, args)  # type: ignore[arg-type]
        return await cur.fetchall()

    async def _bump(self, conn: AsyncConnection, template_id: str, expected: int, by: str) -> int:
        """Next draft revision, only if the draft is still at `expected` (the row lock serialises writers)."""
        row = await self._one(
            conn,
            "UPDATE drafts SET revision = revision + 1, updated_at = now(), updated_by = %s "
            "WHERE template_id = %s AND revision = %s RETURNING revision",
            (by, template_id, expected),
        )
        if row is None:
            exists = await self._one(conn, "SELECT 1 FROM drafts WHERE template_id = %s", (template_id,))
            if exists is None:
                raise StoreError("NOT_FOUND", "template not found")
            raise StoreError("REVISION_CONFLICT", "the draft changed since this revision; reload and retry")
        await conn.execute("UPDATE templates SET updated_at = now() WHERE id = %s", (template_id,))
        return row[0]

    async def _check_draft_size(self, conn: AsyncConnection, template_id: str) -> None:
        files, file_bytes = await self._one(
            conn,
            "SELECT count(*), coalesce(sum(octet_length(content)), 0) FROM draft_files "
            "WHERE template_id = %s",
            (template_id,),
        )
        assets, asset_bytes = await self._one(
            conn,
            "SELECT count(*), coalesce(sum(b.size), 0) FROM draft_assets a "
            "JOIN blobs b ON b.sha256 = a.blob_sha256 "
            "WHERE a.template_id = %s",
            (template_id,),
        )
        if files > MAX_FILES or assets > MAX_FILES:
            raise StoreError(
                "PAYLOAD_TOO_LARGE", f"a draft holds at most {MAX_FILES} files and {MAX_FILES} assets"
            )
        if file_bytes + asset_bytes > MAX_DRAFT_BYTES:
            raise StoreError("PAYLOAD_TOO_LARGE", "the draft would be larger than 20 MB")

    async def _store_blob(self, conn: AsyncConnection, name: str, data: bytes) -> AssetInfo:
        if len(data) > MAX_ASSET_BYTES:
            raise StoreError("PAYLOAD_TOO_LARGE", "an asset is at most 5 MB")
        info = detect(name, data)
        # bytes first: if the transaction then fails, an unused blob stays behind (no cleanup in v1)
        await self._blobs.put_if_absent(info.sha256, data, info.content_type)
        await conn.execute(
            "INSERT INTO blobs (sha256, content_type, size, font_family) VALUES (%s, %s, %s, %s) "
            "ON CONFLICT (sha256) DO NOTHING",
            (info.sha256, info.content_type, len(data), info.font_family),
        )
        return info

    async def _hashes(self, conn: AsyncConnection, template_id: str) -> str:
        """content_sha256 of the draft from stored per-file hashes (no contents read)."""
        files = await self._all(
            conn, "SELECT name, sha256 FROM draft_files WHERE template_id = %s", (template_id,)
        )
        assets = await self._all(
            conn, "SELECT name, blob_sha256 FROM draft_assets WHERE template_id = %s", (template_id,)
        )
        return content_sha256(dict(files), dict(assets))

    # ---- templates -------------------------------------------------------------------------------------
    async def create(self, template_id: str, name: str, starter: Starter, by: str) -> TemplateSummary:
        _check(TEMPLATE_ID, template_id, "template")
        name = _check_name(name)
        texts, binaries = starter_files(starter)
        async with self._db.connection() as conn, conn.transaction():
            try:
                await conn.execute("INSERT INTO templates (id, name) VALUES (%s, %s)", (template_id, name))
            except errors.UniqueViolation:
                raise StoreError("CONFLICT", "a template with this id already exists") from None
            await conn.execute(
                "INSERT INTO drafts (template_id, revision, updated_by) VALUES (%s, 1, %s)", (template_id, by)
            )
            for file_name, content in texts.items():
                await conn.execute(
                    "INSERT INTO draft_files (template_id, name, content, sha256) VALUES (%s, %s, %s, %s)",
                    (template_id, file_name, content, _sha256(content)),
                )
            for file_name, data in binaries.items():
                info = await self._store_blob(conn, file_name, data)
                await conn.execute(
                    "INSERT INTO draft_assets (template_id, name, blob_sha256) VALUES (%s, %s, %s)",
                    (template_id, file_name, info.sha256),
                )
        return await self.get(template_id)

    async def list(self) -> list[TemplateSummary]:
        return await self._summaries(None)

    async def get(self, template_id: str) -> TemplateSummary:
        found = await self._summaries(template_id)
        if not found:
            raise StoreError("NOT_FOUND", "template not found")
        return found[0]

    async def _summaries(self, template_id: str | None) -> list[TemplateSummary]:
        where, args = ("WHERE t.id = %s", (template_id,)) if template_id else ("", ())
        async with self._db.connection() as conn:
            rows = await self._all(
                conn,
                "SELECT t.id, t.name, t.published_version, t.updated_at, d.revision, pv.sha256, "
                "(SELECT max(version) FROM versions v WHERE v.template_id = t.id), "
                "(SELECT content FROM draft_files f WHERE f.template_id = t.id AND f.name = 'report.json') "
                "FROM templates t JOIN drafts d ON d.template_id = t.id "
                "LEFT JOIN versions pv ON pv.template_id = t.id AND pv.version = t.published_version "
                f"{where} ORDER BY t.id",
                args,
            )
            out = []
            for tid, name, published, updated_at, revision, published_sha, latest, report_json in rows:
                changed = published_sha is None or await self._hashes(conn, tid) != published_sha
                out.append(
                    TemplateSummary(
                        tid, name, published, latest, revision, changed, _orientation(report_json), updated_at
                    )
                )
        return out

    async def rename(self, template_id: str, name: str) -> TemplateSummary:
        name = _check_name(name)
        async with self._db.connection() as conn:
            row = await self._one(
                conn,
                "UPDATE templates SET name = %s, updated_at = now() WHERE id = %s RETURNING id",
                (name, template_id),
            )
        if row is None:
            raise StoreError("NOT_FOUND", "template not found")
        return await self.get(template_id)

    # ---- draft -----------------------------------------------------------------------------------------
    async def get_draft(self, template_id: str) -> Draft:
        async with self._db.connection() as conn:
            row = await self._one(
                conn,
                "SELECT revision, based_on_version, updated_at, updated_by FROM drafts "
                "WHERE template_id = %s",
                (template_id,),
            )
            if row is None:
                raise StoreError("NOT_FOUND", "template not found")
            files = await self._all(
                conn,
                "SELECT name, content, sha256 FROM draft_files WHERE template_id = %s ORDER BY name",
                (template_id,),
            )
            assets = await self._assets(conn, "draft_assets", "template_id = %s", (template_id,))
        revision, based_on, updated_at, updated_by = row
        return Draft(
            template_id, revision, based_on, [TextFile(*f) for f in files], assets, updated_at, updated_by
        )

    async def _assets(
        self, conn: AsyncConnection, table: str, where: str, args: tuple[Any, ...]
    ) -> list[Asset]:
        rows = await self._all(
            conn,
            f"SELECT a.name, b.content_type, b.size, b.sha256, b.font_family FROM {table} a "
            f"JOIN blobs b ON b.sha256 = a.blob_sha256 WHERE {where} ORDER BY a.name",
            args,
        )
        return [Asset(*r) for r in rows]

    async def put_file(
        self, template_id: str, name: str, content: str, expected_revision: int, by: str
    ) -> int:
        _check(TEXT_FILE, name, "file")
        if "\x00" in content:  # PostgreSQL text cannot hold NUL; psycopg would raise a bare DataError
            raise StoreError("INPUT_INVALID", "text files cannot contain NUL characters")
        if len(content.encode("utf-8")) > MAX_TEXT_BYTES:
            raise StoreError("PAYLOAD_TOO_LARGE", "a text file is at most 1 MB")
        async with self._db.connection() as conn, conn.transaction():
            revision = await self._bump(conn, template_id, expected_revision, by)
            await conn.execute(
                "INSERT INTO draft_files (template_id, name, content, sha256) VALUES (%s, %s, %s, %s) "
                "ON CONFLICT (template_id, name) "
                "DO UPDATE SET content = EXCLUDED.content, sha256 = EXCLUDED.sha256",
                (template_id, name, content, _sha256(content)),
            )
            await self._check_draft_size(conn, template_id)  # raising rolls the whole write back
            return revision

    async def delete_file(self, template_id: str, name: str, expected_revision: int, by: str) -> int:
        if name in REQUIRED_FILES:
            raise StoreError("CONFLICT", f"{name} cannot be deleted")
        async with self._db.connection() as conn, conn.transaction():
            revision = await self._bump(conn, template_id, expected_revision, by)
            row = await self._one(
                conn,
                "DELETE FROM draft_files WHERE template_id = %s AND name = %s RETURNING name",
                (template_id, name),
            )
            if row is None:
                raise StoreError("NOT_FOUND", "file not found in the draft")
            return revision

    async def add_asset(
        self, template_id: str, name: str, data: bytes, expected_revision: int, by: str
    ) -> tuple[Asset, int]:
        _check(ASSET_FILE, name, "asset")
        async with self._db.connection() as conn, conn.transaction():
            revision = await self._bump(conn, template_id, expected_revision, by)
            taken = await self._one(
                conn, "SELECT 1 FROM draft_assets WHERE template_id = %s AND name = %s", (template_id, name)
            )
            if taken:
                raise StoreError("CONFLICT", "an asset with this name already exists in the draft")
            info = await self._store_blob(conn, name, data)
            await conn.execute(
                "INSERT INTO draft_assets (template_id, name, blob_sha256) VALUES (%s, %s, %s)",
                (template_id, name, info.sha256),
            )
            await self._check_draft_size(conn, template_id)
        return Asset(name, info.content_type, len(data), info.sha256, info.font_family), revision

    async def delete_asset(self, template_id: str, name: str, expected_revision: int, by: str) -> int:
        async with self._db.connection() as conn, conn.transaction():
            revision = await self._bump(conn, template_id, expected_revision, by)
            row = await self._one(
                conn,
                "DELETE FROM draft_assets WHERE template_id = %s AND name = %s RETURNING name",
                (template_id, name),
            )
            if row is None:
                raise StoreError("NOT_FOUND", "asset not found in the draft")
            return revision  # the bytes stay in storage (published versions may use them)

    async def reset_draft(self, template_id: str, version: int, expected_revision: int, by: str) -> int:
        async with self._db.connection() as conn, conn.transaction():
            revision = await self._bump(conn, template_id, expected_revision, by)
            exists = await self._one(
                conn, "SELECT 1 FROM versions WHERE template_id = %s AND version = %s", (template_id, version)
            )
            if exists is None:
                raise StoreError("NOT_FOUND", "version not found")
            await conn.execute("DELETE FROM draft_files WHERE template_id = %s", (template_id,))
            await conn.execute("DELETE FROM draft_assets WHERE template_id = %s", (template_id,))
            await conn.execute(
                "INSERT INTO draft_files (template_id, name, content, sha256) "
                "SELECT template_id, name, content, sha256 FROM version_files "
                "WHERE template_id = %s AND version = %s",
                (template_id, version),
            )
            await conn.execute(
                "INSERT INTO draft_assets (template_id, name, blob_sha256) "
                "SELECT template_id, name, blob_sha256 FROM version_assets "
                "WHERE template_id = %s AND version = %s",
                (template_id, version),
            )
            await conn.execute(
                "UPDATE drafts SET based_on_version = %s WHERE template_id = %s", (version, template_id)
            )
            return revision

    # ---- versions --------------------------------------------------------------------------------------
    async def publish(self, template_id: str, expected_revision: int, note: str | None, by: str) -> Version:
        if note is not None and len(note) > 500:
            raise StoreError("INPUT_INVALID", "note is at most 500 characters")
        async with self._db.connection() as conn, conn.transaction():
            row = await self._one(
                conn, "SELECT revision FROM drafts WHERE template_id = %s FOR UPDATE", (template_id,)
            )
            if row is None:
                raise StoreError("NOT_FOUND", "template not found")
            if row[0] != expected_revision:
                raise StoreError(
                    "REVISION_CONFLICT", "the draft changed since this revision; validate it again"
                )
            sha = await self._hashes(conn, template_id)
            latest = await self._one(
                conn,
                "SELECT version, sha256 FROM versions WHERE template_id = %s ORDER BY version DESC LIMIT 1",
                (template_id,),
            )
            if latest and latest[1] == sha:
                # also what a second, concurrent publish of the same revision sees once the first commits
                raise StoreError(
                    "REVISION_CONFLICT",
                    f"this draft is already version {latest[0]}; move the published alias instead",
                )
            version = (latest[0] if latest else 0) + 1
            await conn.execute(
                "INSERT INTO versions (template_id, version, sha256, note, published_by) "
                "VALUES (%s, %s, %s, %s, %s)",
                (template_id, version, sha, note, by),
            )
            await conn.execute(
                "INSERT INTO version_files (template_id, version, name, content, sha256) "
                "SELECT template_id, %s, name, content, sha256 FROM draft_files WHERE template_id = %s",
                (version, template_id),
            )
            await conn.execute(
                "INSERT INTO version_assets (template_id, version, name, blob_sha256) "
                "SELECT template_id, %s, name, blob_sha256 FROM draft_assets WHERE template_id = %s",
                (version, template_id),
            )
            await conn.execute(
                "UPDATE templates SET published_version = %s, updated_at = now() WHERE id = %s",
                (version, template_id),
            )
            await conn.execute(
                "UPDATE drafts SET based_on_version = %s WHERE template_id = %s", (version, template_id)
            )
        return (await self.get_version(template_id, version)).version

    async def list_versions(self, template_id: str) -> list[Version]:
        async with self._db.connection() as conn:
            if await self._one(conn, "SELECT 1 FROM templates WHERE id = %s", (template_id,)) is None:
                raise StoreError("NOT_FOUND", "template not found")
            return await self._versions(conn, "v.template_id = %s ORDER BY v.version DESC", (template_id,))

    async def _versions(self, conn: AsyncConnection, where: str, args: tuple[Any, ...]) -> list[Version]:
        rows = await self._all(
            conn,
            "SELECT v.template_id, v.version, v.published_at, v.published_by, v.note, v.sha256, "
            "t.published_version = v.version FROM versions v JOIN templates t ON t.id = v.template_id "
            f"WHERE {where}",
            args,
        )
        return [Version(*r[:6], bool(r[6])) for r in rows]

    async def get_version(self, template_id: str, version: int) -> VersionFiles:
        async with self._db.connection() as conn:
            found = await self._versions(
                conn, "v.template_id = %s AND v.version = %s", (template_id, version)
            )
            if not found:
                raise StoreError("NOT_FOUND", "version not found")
            files = await self._all(
                conn,
                "SELECT name, content, sha256 FROM version_files "
                "WHERE template_id = %s AND version = %s ORDER BY name",
                (template_id, version),
            )
            assets = await self._assets(
                conn, "version_assets", "a.template_id = %s AND a.version = %s", (template_id, version)
            )
        return VersionFiles(found[0], [TextFile(*f) for f in files], assets)

    async def set_published(self, template_id: str, version: int) -> TemplateSummary:
        async with self._db.connection() as conn, conn.transaction():
            exists = await self._one(
                conn, "SELECT 1 FROM versions WHERE template_id = %s AND version = %s", (template_id, version)
            )
            if exists is None:
                raise StoreError("NOT_FOUND", "version not found")
            await conn.execute(
                "UPDATE templates SET published_version = %s, updated_at = now() WHERE id = %s",
                (version, template_id),
            )
        return await self.get(template_id)

    # ---- for render-service ----------------------------------------------------------------------------
    async def definition_input(
        self, template_id: str, ref: Literal["draft", "published"] | int
    ) -> StoredDefinition:
        if ref == "draft":
            draft = await self.get_draft(template_id)
            files, assets, version, revision = draft.files, draft.assets, None, draft.revision
        else:
            if ref == "published":
                summary = await self.get(template_id)
                if summary.published_version is None:
                    raise StoreError("NOT_FOUND", "template has no published version")
                ref = summary.published_version
            stored = await self.get_version(template_id, ref)
            files, assets, version, revision = stored.files, stored.assets, ref, None
        return StoredDefinition(
            template_id,
            version,
            revision,
            {f.name: f.content for f in files},
            {a.name: AssetInfo(a.content_type, a.sha256, a.font_family) for a in assets},
            content_sha256({f.name: f.sha256 for f in files}, {a.name: a.sha256 for a in assets}),
        )

    async def asset_bytes(self, sha256: str) -> bytes:
        return await self._blobs.get(sha256)

    async def storage_up(self) -> bool:
        """For /v1/health: can object storage be asked anything right now?"""
        try:
            await self._blobs.exists("0" * 64)
            return True
        except Exception:  # any failure means "down" for health; the cause is in the storage logs
            return False
