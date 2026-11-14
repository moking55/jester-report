import pytest


@pytest.fixture
async def store(db_url):
    from psycopg_pool import AsyncConnectionPool

    from jester_api.db import migrate
    from jester_api.template_store import MemoryBlobStore, TemplateStore

    async with AsyncConnectionPool(db_url, min_size=1, max_size=4, open=False) as pool:
        async with pool.connection() as conn:
            await migrate(conn)
        yield TemplateStore(pool, MemoryBlobStore())
