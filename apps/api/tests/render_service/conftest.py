from datetime import UTC, datetime, timedelta

import pytest


class Clock:
    def __init__(self) -> None:
        self.now = datetime(2026, 11, 14, 9, 0, tzinfo=UTC)

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **kwargs: float) -> None:
        self.now += timedelta(**kwargs)


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
async def pool(db_url):
    from psycopg_pool import AsyncConnectionPool

    from jester_api.db import migrate

    async with AsyncConnectionPool(db_url, min_size=1, max_size=8, open=False) as p:
        async with p.connection() as conn:
            await migrate(conn)
        yield p
