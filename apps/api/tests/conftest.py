import os

import pytest

# marker -> env var that must be set for those tests to run
LIVE_MARKERS = {
    "engine": "GOTENBERG_URL",
    "db": "JESTER_TEST_DATABASE_URL",
    "storage": "JESTER_TEST_S3_ENDPOINT",
}


def pytest_collection_modifyitems(config, items):
    for marker, env in LIVE_MARKERS.items():
        if os.environ.get(env):
            continue
        skip = pytest.mark.skip(reason=f"{env} not set")
        for item in items:
            if marker in item.keywords:
                item.add_marker(skip)
