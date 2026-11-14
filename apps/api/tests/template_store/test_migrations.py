import asyncio

import psycopg
import pytest
from psycopg import AsyncConnection

from jester_api.template_store.migrate import migrate

pytestmark = pytest.mark.db


async def _migrate(url: str) -> list[str]:
    async with await AsyncConnection.connect(url) as conn:
        return await migrate(conn)


async def test_migrations_run_once(db_url):
    assert await _migrate(db_url) == ["0001_init.sql"]
    assert await _migrate(db_url) == []


async def test_concurrent_start_migrates_once(db_url):
    results = await asyncio.gather(*(_migrate(db_url) for _ in range(4)))
    assert sorted(len(r) for r in results) == [0, 0, 0, 1]


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
