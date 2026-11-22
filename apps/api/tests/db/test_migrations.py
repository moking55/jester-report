import asyncio
import importlib

import psycopg
import pytest
from psycopg import AsyncConnection

from jester_api.db.migrate import MIGRATIONS, migrate

pytestmark = pytest.mark.db


async def _migrate(url: str) -> list[str]:
    async with await AsyncConnection.connect(url) as conn:
        return await migrate(conn)


async def test_migrations_run_once(db_url):
    assert await _migrate(db_url) == sorted(p.name for p in MIGRATIONS.glob("*.sql"))
    assert await _migrate(db_url) == []


async def test_concurrent_start_migrates_once(db_url):
    results = await asyncio.gather(*(_migrate(db_url) for _ in range(4)))
    assert sorted(len(r) for r in results) == [0, 0, 0, len(list(MIGRATIONS.glob("*.sql")))]


async def test_published_versions_reject_change(db_url):
    await _migrate(db_url)
    async with await AsyncConnection.connect(db_url, autocommit=True) as conn:
        await conn.execute("INSERT INTO templates (id, name) VALUES ('q', 'Q')")
        await conn.execute(
            "INSERT INTO versions (template_id, version, sha256, published_by) VALUES ('q', 1, 'x', 'u')"
        )
        await conn.execute(
            "INSERT INTO version_files (template_id, version, name, content, sha256) "
            "VALUES ('q', 1, 'a', 'b', 'c')"
        )
        for sql in (
            "UPDATE version_files SET content = 'changed'",
            "DELETE FROM version_files",
            "UPDATE versions SET note = 'x'",
            "DELETE FROM versions",
            "TRUNCATE version_files",
        ):
            with pytest.raises(psycopg.errors.RestrictViolation):
                await conn.execute(sql)


async def test_tags_migration_keeps_existing_rows_with_empty_tags(db_url, tmp_path, monkeypatch):
    migrate_module = importlib.import_module("jester_api.db.migrate")  # the package re-exports the function

    old = tmp_path / "old"
    old.mkdir()
    for path in sorted(MIGRATIONS.glob("*.sql")):
        if path.name < "0009":
            (old / path.name).write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
    monkeypatch.setattr(migrate_module, "MIGRATIONS", old)
    await _migrate(db_url)  # a database at 0001-0008
    async with await AsyncConnection.connect(db_url, autocommit=True) as conn:
        await conn.execute("INSERT INTO templates (id, name) VALUES ('old', 'Old')")
        await conn.execute(
            "INSERT INTO runs (id, kind, template_id, caller_type, caller_id, status, created_at) "
            "VALUES ('r', 'render', 'old', 'user', 'u', 'succeeded', now())"
        )
        await conn.execute(
            "INSERT INTO documents (run_id, template_id, filename, params, data, pdf_size, pdf_sha256) "
            "VALUES ('r', 'old', 'f.pdf', '{}', '{}', 1, 'x')"
        )
    monkeypatch.setattr(migrate_module, "MIGRATIONS", MIGRATIONS)
    assert await _migrate(db_url) == ["0009_tags.sql"]
    async with await AsyncConnection.connect(db_url) as conn:
        for table in ("templates", "documents"):
            cur = await conn.execute(f"SELECT tags FROM {table}")  # noqa: S608 (fixed names)
            assert await cur.fetchall() == [([],)]
        await conn.execute("INSERT INTO tag_colors (tag, color) VALUES ('a', 'red')")
