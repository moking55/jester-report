"""Every starter labels its form fields in Thai (SPEC-template-store.md "v1.4")."""

import json
from collections.abc import Iterator

import pytest

from jester_api.template_store.starter import _DIRS, starter_files

STARTERS = sorted(_DIRS)


def untitled(schema: dict, path: str = "") -> Iterator[str]:
    """Paths of properties (in objects and in array items, at any depth) without a non-empty title."""
    for name, prop in (schema.get("properties") or {}).items():
        here = f"{path}/{name}"
        if not (isinstance(prop.get("title"), str) and prop["title"].strip()):
            yield here
        yield from untitled(prop, here)
    if isinstance(schema.get("items"), dict):
        yield from untitled(schema["items"], f"{path}/[]")


@pytest.mark.parametrize("starter", STARTERS)
def test_every_field_has_a_thai_title(starter):
    texts, _ = starter_files(starter)
    report = json.loads(texts["report.json"])
    schema = json.loads(texts[report["data"]["schema"]])
    assert list(untitled(schema)) == []
    params = report.get("parameters") or {}
    assert [name for name, spec in params.items() if not (spec.get("title") or "").strip()] == []


def test_the_walk_finds_a_missing_title():
    schema = {"properties": {"a": {"title": "ก", "items": {"properties": {"b": {"type": "string"}}}}}}
    assert list(untitled(schema)) == ["/a/[]/b"]
