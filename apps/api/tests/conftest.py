import asyncio
import os
import sys
import uuid

import psycopg
import pytest

# marker -> env var that must be set for those tests to run
LIVE_MARKERS = {
    "engine": "GOTENBERG_URL",
    "db": "JESTER_TEST_DATABASE_URL",
    "storage": "JESTER_TEST_S3_ENDPOINT",
    "live_stack": "JESTER_TEST_API_URL",
}


def pytest_collection_modifyitems(config, items):
    for marker, env in LIVE_MARKERS.items():
        if os.environ.get(env):
            continue
        skip = pytest.mark.skip(reason=f"{env} not set")
        for item in items:
            if marker in item.keywords:
                item.add_marker(skip)


# psycopg's async connections need a selector loop; Windows defaults to the proactor loop
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


@pytest.fixture
def db_url():
    """A fresh schema per test (dropped afterwards); yields a conninfo whose search_path points at it."""
    base = os.environ["JESTER_TEST_DATABASE_URL"]
    schema = f"t_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(base, autocommit=True) as conn:
        conn.execute(f"CREATE SCHEMA {schema}")
    sep = "&" if "?" in base else "?"
    yield f"{base}{sep}options=-csearch_path%3D{schema}"
    with psycopg.connect(base, autocommit=True) as conn:
        conn.execute(f"DROP SCHEMA {schema} CASCADE")
