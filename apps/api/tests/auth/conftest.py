from datetime import UTC, datetime, timedelta

import pytest


class Clock:
    """Adjustable time for expiry and rate-limit tests."""

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

    async with AsyncConnectionPool(db_url, min_size=1, max_size=6, open=False) as p:
        async with p.connection() as conn:
            await migrate(conn)
        yield p


@pytest.fixture
def auth(pool, clock):
    from jester_api.auth import Auth

    return Auth(pool, clock)


PASSWORD = "correct horse battery"


@pytest.fixture
async def alice(auth):
    """A first user created through setup; returns (session, auth)."""
    token = await auth.prepare_setup()
    return await auth.complete_setup(token, "alice", PASSWORD)
