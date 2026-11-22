import pytest


@pytest.fixture
async def pool(db_url):
    from psycopg_pool import AsyncConnectionPool

    from jester_api.db import migrate

    async with AsyncConnectionPool(db_url, min_size=1, max_size=4, open=False) as pool:
        async with pool.connection() as conn:
            await migrate(conn)
        yield pool
