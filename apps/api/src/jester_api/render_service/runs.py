"""Run history and the retention policy (SPEC-render-service.md assumption 6)."""

from __future__ import annotations

import contextlib
import dataclasses
import functools
import hashlib
import json
import logging
import secrets
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from psycopg.types.json import Json, Jsonb
from psycopg_pool import AsyncConnectionPool

from ..report_definition.problems import Problem
from .document_files import DocumentFiles, MemoryDocumentFiles

RETENTION_EVERY = 100  # apply the policy on every 100th run
RETENTION_BATCH = 500  # runs deleted per round, so one render never deletes gigabytes of documents
MAX_RETENTION_DAYS = 36500
MAX_QUERY = 100

log = logging.getLogger("jester.api")
# what callers sent, kept as text: Decimals keep every digit, Thai stays searchable (no \uXXXX escapes)
_json_text = functools.partial(json.dumps, ensure_ascii=False, default=str)


def canonical_sha256(value: Any) -> str:
    """Same hash for the same JSON value, whatever the key order; Decimals hash as their exact text."""
    text = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def new_run_id(now: datetime) -> str:
    # milliseconds first, so ids sort by time and serve as the paging cursor
    return f"{int(now.timestamp() * 1000):012x}{secrets.token_hex(5)}"


@dataclass(frozen=True)
class Caller:
    type: Literal["user", "api-key"]
    id: str
    name: str | None = None


@dataclass(frozen=True)
class NewDocument:
    filename: str
    params: Any
    data: Any
    pdf: bytes


class DocumentStorageError(Exception):
    """The PDF could not be written to object storage, so the run was not recorded."""


@dataclass(frozen=True)
class NewRun:
    kind: Literal["render", "preview"]
    template_id: str
    caller: Caller
    status: Literal["succeeded", "failed"]
    version: int | None = None
    draft_revision: int | None = None
    request_id: str | None = None
    error_code: str | None = None
    pages: int | None = None
    duration_ms: int | None = None
    provenance: dict[str, Any] = field(default_factory=dict)
    problems: list[Problem] = field(default_factory=list)
    document: NewDocument | None = None


@dataclass(frozen=True)
class Run:
    id: str
    status: str
    error_code: str | None
    pages: int | None
    created_at: datetime
    kind: str
    template_id: str
    version: int | None
    draft_revision: int | None
    caller: Caller
    request_id: str | None
    duration_ms: int | None
    provenance: dict[str, Any]
    problems: list[dict[str, Any]]
    has_document: bool = False


@dataclass(frozen=True)
class DocumentSummary:
    run_id: str
    created_at: datetime
    template_id: str
    version: int | None
    caller: Caller
    filename: str
    pages: int | None
    params: Any


@dataclass(frozen=True)
class StoredDocument:
    filename: str
    pdf_size: int
    pdf_sha256: str


@dataclass(frozen=True)
class Retention:
    days: int | None  # None = keep for ever
    set_by: str | None
    set_at: datetime | None
    would_delete: int | None = None  # filled when previewing a policy
    would_delete_documents: int | None = None


_COLUMNS = (
    "id, status, error_code, pages, created_at, kind, template_id, version, draft_revision, "
    "caller_type, caller_id, caller_name, request_id, duration_ms, provenance, problems"
)


_SELECT = f"{_COLUMNS}, EXISTS (SELECT 1 FROM documents d WHERE d.run_id = runs.id)"


def _run(row: Any) -> Run:
    return Run(*row[:9], Caller(row[9], row[10], row[11]), row[12], row[13], row[14], row[15], row[16])


def _like(q: str) -> str:
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


class Runs:
    def __init__(
        self,
        db: AsyncConnectionPool,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
        documents: DocumentFiles | None = None,
    ) -> None:
        self._db = db
        self._now = clock
        self.documents: DocumentFiles = documents or MemoryDocumentFiles()  # memory: unit tests only

    async def record(self, run: NewRun) -> str:
        """Writes the PDF first, then the run and its document row in one transaction.

        A row in `documents` therefore always has its object; an object without a row (the transaction
        failed and so did the clean-up) is left for `ops.blobs sweep-documents`.
        """
        now = self._now()
        run_id = new_run_id(now)
        problems = [{k: v for k, v in dataclasses.asdict(p).items() if v is not None} for p in run.problems]
        doc = run.document
        if doc is not None:
            try:
                await self.documents.put(run_id, doc.pdf)
            except Exception as exc:
                raise DocumentStorageError(str(exc)) from exc
        try:
            async with self._db.connection() as conn, conn.transaction():
                await conn.execute(
                    f"INSERT INTO runs ({_COLUMNS}) VALUES ({', '.join(['%s'] * 16)})",
                    (
                        run_id, run.status, run.error_code, run.pages, now, run.kind, run.template_id,
                        run.version, run.draft_revision, run.caller.type, run.caller.id, run.caller.name,
                        run.request_id,
                        run.duration_ms, Jsonb(run.provenance), Jsonb(problems),
                    ),
                )  # fmt: skip
                if doc is not None:
                    await conn.execute(
                        "INSERT INTO documents (run_id, template_id, filename, params, data, pdf_size, "
                        "pdf_sha256) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                        (
                            run_id, run.template_id, doc.filename,
                            Json(doc.params, dumps=_json_text), Json(doc.data, dumps=_json_text),
                            len(doc.pdf), hashlib.sha256(doc.pdf).hexdigest(),
                        ),
                    )  # fmt: skip
                cur = await conn.execute("SELECT nextval('run_counter')")
                doomed = []
                if (await cur.fetchone())[0] % RETENTION_EVERY == 0:
                    doomed = await self._apply_retention(conn, now)
        except BaseException:
            if doc is not None:
                with contextlib.suppress(Exception):
                    await self.documents.delete([run_id])
            raise
        if doomed:  # after commit: never a row whose object is already gone
            try:
                await self.documents.delete(doomed)
            except Exception as exc:  # the sweep picks them up; the render itself succeeded
                log.warning("retention: %d document file(s) not deleted: %s", len(doomed), exc)
        return run_id

    async def _apply_retention(self, conn: Any, now: datetime) -> list[str]:
        """Deletes up to RETENTION_BATCH old runs; returns the run ids whose document files must go."""
        cur = await conn.execute("SELECT days FROM run_retention")
        days = (await cur.fetchone())[0]
        if days is None:  # NULL = keep for ever: nothing is deleted unless someone chose a policy
            return []
        cur = await conn.execute(
            "SELECT id FROM runs WHERE created_at < %s ORDER BY id LIMIT %s",
            (now - timedelta(days=days), RETENTION_BATCH),
        )
        ids = [row[0] for row in await cur.fetchall()]
        if not ids:
            return []
        cur = await conn.execute("DELETE FROM documents WHERE run_id = ANY(%s) RETURNING run_id", (ids,))
        doomed = [row[0] for row in await cur.fetchall()]
        await conn.execute("DELETE FROM runs WHERE id = ANY(%s)", (ids,))
        return doomed

    async def get(self, run_id: str) -> Run | None:
        async with self._db.connection() as conn:
            cur = await conn.execute(f"SELECT {_SELECT} FROM runs WHERE id = %s", (run_id,))
            row = await cur.fetchone()
        return _run(row) if row else None

    async def list(
        self, template_id: str | None, status: str | None, limit: int, before: str | None
    ) -> tuple[list[Run], str | None]:
        """Newest first; returns (runs, cursor for the next page or None)."""
        where, args = ["TRUE"], []
        for column, value in (
            ("template_id = %s", template_id),
            ("status = %s", status),
            ("id < %s", before),
        ):
            if value is not None:
                where.append(column)
                args.append(value)
        async with self._db.connection() as conn:
            cur = await conn.execute(
                f"SELECT {_SELECT} FROM runs WHERE {' AND '.join(where)} ORDER BY id DESC LIMIT %s",
                (*args, limit + 1),
            )
            rows = await cur.fetchall()
        runs = [_run(r) for r in rows[:limit]]
        return runs, (runs[-1].id if len(rows) > limit else None)

    async def last(self, template_ids: list[str]) -> dict[str, Run]:
        async with self._db.connection() as conn:
            cur = await conn.execute(
                f"SELECT DISTINCT ON (template_id) {_SELECT} FROM runs WHERE template_id = ANY(%s) "
                "ORDER BY template_id, id DESC",
                (template_ids,),
            )
            rows = await cur.fetchall()
        return {r[6]: _run(r) for r in rows}

    async def list_documents(
        self, template_id: str | None, q: str | None, limit: int, before: str | None
    ) -> tuple[list[DocumentSummary], str | None]:
        """Newest first; `q` matches any text in params or data, case-insensitively."""
        where, args = ["TRUE"], []
        if q is not None:
            q = q.strip()
            if not 1 <= len(q) <= MAX_QUERY:
                raise ValueError(f"q must be 1-{MAX_QUERY} characters")
            # shortcut: sequential ILIKE per template; add a pg_trgm index once a template has 100k+ documents
            where.append("(d.params::text || ' ' || d.data::text) ILIKE %s")
            args.append(_like(q))
        for column, value in (("d.template_id = %s", template_id), ("d.run_id < %s", before)):
            if value is not None:
                where.append(column)
                args.append(value)
        async with self._db.connection() as conn:
            cur = await conn.execute(
                "SELECT r.id, r.created_at, r.template_id, r.version, r.caller_type, r.caller_id, "
                "r.caller_name, d.filename, r.pages, d.params FROM documents d JOIN runs r ON r.id = d.run_id"
                " "
                f"WHERE {' AND '.join(where)} ORDER BY d.run_id DESC LIMIT %s",
                (*args, limit + 1),
            )
            rows = await cur.fetchall()
        docs = [
            DocumentSummary(r[0], r[1], r[2], r[3], Caller(r[4], r[5], r[6]), r[7], r[8], r[9])
            for r in rows[:limit]
        ]
        return docs, (docs[-1].run_id if len(rows) > limit else None)

    async def document(self, run_id: str) -> StoredDocument | None:
        async with self._db.connection() as conn:
            cur = await conn.execute(
                "SELECT filename, pdf_size, pdf_sha256 FROM documents WHERE run_id = %s", (run_id,)
            )
            row = await cur.fetchone()
        return StoredDocument(*row) if row else None

    async def retention(self, preview_days: int | None = None) -> Retention:
        async with self._db.connection() as conn:
            cur = await conn.execute("SELECT days, set_by, set_at FROM run_retention")
            days, set_by, set_at = await cur.fetchone()
            would_delete = would_delete_documents = None
            if preview_days is not None:
                _check_days(preview_days)
                cur = await conn.execute(
                    "SELECT count(*) FROM runs WHERE created_at < %s",
                    (self._now() - timedelta(days=preview_days),),
                )
                would_delete = (await cur.fetchone())[0]
                cur = await conn.execute(
                    "SELECT count(*) FROM documents d JOIN runs r ON r.id = d.run_id WHERE r.created_at < %s",
                    (self._now() - timedelta(days=preview_days),),
                )
                would_delete_documents = (await cur.fetchone())[0]
        return Retention(days, set_by, set_at, would_delete, would_delete_documents)

    async def set_retention(self, days: int | None, set_by: str) -> Retention:
        if days is not None:
            _check_days(days)
        async with self._db.connection() as conn, conn.transaction():
            await conn.execute(
                "UPDATE run_retention SET days = %s, set_by = %s, set_at = %s", (days, set_by, self._now())
            )
        return await self.retention()


def _check_days(days: int) -> None:
    if not isinstance(days, int) or isinstance(days, bool) or not 1 <= days <= MAX_RETENTION_DAYS:
        raise ValueError(f"retention days must be 1-{MAX_RETENTION_DAYS}")
