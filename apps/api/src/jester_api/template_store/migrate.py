"""Apply migrations/NNNN_*.sql in order, once, safely from several processes at start."""

from __future__ import annotations

from pathlib import Path

from psycopg import AsyncConnection

MIGRATIONS = Path(__file__).parent / "migrations"
_LOCK_ID = 0x4A45_5354  # "JEST": every process waits on the same advisory lock


async def migrate(conn: AsyncConnection) -> list[str]:
    """Run pending migrations in one transaction; returns the names applied now."""
    applied: list[str] = []
    async with conn.transaction():
        await conn.execute("SELECT pg_advisory_xact_lock(%s)", (_LOCK_ID,))
        await conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations "
            "(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
        )
        cur = await conn.execute("SELECT name FROM schema_migrations")
        done = {row[0] for row in await cur.fetchall()}
        for path in sorted(MIGRATIONS.glob("*.sql")):
            if path.name in done:
                continue
            await conn.execute(path.read_text(encoding="utf-8"))  # type: ignore[arg-type]  (trusted file)
            await conn.execute("INSERT INTO schema_migrations (name) VALUES (%s)", (path.name,))
            applied.append(path.name)
    return applied
