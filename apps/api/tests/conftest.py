import os

import pytest


def pytest_collection_modifyitems(config, items):
    if os.environ.get("GOTENBERG_URL"):
        return
    skip = pytest.mark.skip(reason="GOTENBERG_URL not set")
    for item in items:
        if "engine" in item.keywords:
            item.add_marker(skip)
