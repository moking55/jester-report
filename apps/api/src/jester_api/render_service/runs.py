"""Run history and the retention policy (SPEC-render-service.md assumption 6)."""

from __future__ import annotations

import dataclasses
import hashlib
import json
import secrets
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from psycopg.types.json import Jsonb
from psycopg_pool import AsyncConnectionPool

from ..report_definition.problems import Problem

RETENTION_EVERY = 100  # apply the policy on every 100th run
MAX_RETENTION_DAYS = 36500


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


@dataclass(frozen=True)
class Retention:
    days: int | None  # None = keep for ever
    set_by: str | None
    set_at: datetime | None
    would_delete: int | None = None  # filled when previewing a policy


_COLUMNS = (
    "id, status, error_code, pages, created_at, kind, template_id, version, draft_revision, "
    "caller_type, caller_id, caller_name, request_id, duration_ms, provenance, problems"
)


def _run(row: Any) -> Run:
    return Run(*row[:9], Caller(row[9], row[10], row[11]), row[12], row[13], row[14], row[15])


class Runs:
    def __init__(
        self, db: AsyncConnectionPool, clock: Callable[[], datetime] = lambda: datetime.now(UTC)
    ) -> None:
        self._db = db
        self._now = clock

    async def record(self, run: NewRun) -> str:
        now = self._now()
        run_id = new_run_id(now)
        problems = [{k: v for k, v in dataclasses.asdict(p).items() if v is not None} for p in run.problems]
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
            cur = await conn.execute("SELECT nextval('run_counter')")
            if (await cur.fetchone())[0] % RETENTION_EVERY == 0:
                await self._apply_retention(conn, now)
        return run_id

    async def _apply_retention(self, conn: Any, now: datetime) -> None:
        cur = await conn.execute("SELECT days FROM run_retention")
        days = (await cur.fetchone())[0]
        if days is not None:  # NULL = keep for ever: nothing is deleted unless someone chose a policy
            await conn.execute("DELETE FROM runs WHERE created_at < %s", (now - timedelta(days=days),))

    async def get(self, run_id: str) -> Run | None:
        async with self._db.connection() as conn:
            cur = await conn.execute(f"SELECT {_COLUMNS} FROM runs WHERE id = %s", (run_id,))
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
                f"SELECT {_COLUMNS} FROM runs WHERE {' AND '.join(where)} ORDER BY id DESC LIMIT %s",
                (*args, limit + 1),
            )
            rows = await cur.fetchall()
        runs = [_run(r) for r in rows[:limit]]
        return runs, (runs[-1].id if len(rows) > limit else None)

    async def last(self, template_ids: list[str]) -> dict[str, Run]:
        async with self._db.connection() as conn:
            cur = await conn.execute(
                f"SELECT DISTINCT ON (template_id) {_COLUMNS} FROM runs WHERE template_id = ANY(%s) "
                "ORDER BY template_id, id DESC",
                (template_ids,),
            )
            rows = await cur.fetchall()
        return {r[6]: _run(r) for r in rows}

    async def retention(self, preview_days: int | None = None) -> Retention:
        async with self._db.connection() as conn:
            cur = await conn.execute("SELECT days, set_by, set_at FROM run_retention")
            days, set_by, set_at = await cur.fetchone()
            would_delete = None
            if preview_days is not None:
                _check_days(preview_days)
                cur = await conn.execute(
                    "SELECT count(*) FROM runs WHERE created_at < %s",
                    (self._now() - timedelta(days=preview_days),),
                )
                would_delete = (await cur.fetchone())[0]
        return Retention(days, set_by, set_at, would_delete)

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
