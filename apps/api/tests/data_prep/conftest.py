import json
from pathlib import Path

import pytest

from jester_api.report_definition import AssetInfo, DefinitionInput, load_definition

FIXTURES = Path(__file__).parents[2] / "src" / "jester_api" / "template_store" / "starters"
TEXT = (".html", ".json", ".css")
FONTS = frozenset({"TH Sarabun New", "Noto Sans Thai"})


def fixture_files(name: str) -> dict[str, str]:
    return {p.name: p.read_text(encoding="utf-8") for p in (FIXTURES / name).iterdir() if p.suffix in TEXT}


def load_fixture(name: str, report_changes: dict | None = None):
    files = fixture_files(name)
    if report_changes:
        report = json.loads(files["report.json"])
        report.update(report_changes)
        files["report.json"] = json.dumps(report, ensure_ascii=False)
    result = load_definition(DefinitionInput(files, {"logo.png": AssetInfo("image/png", "ab" * 32)}, FONTS))
    assert result.problems == [], result.problems
    return result.definition


def sample(name: str, file: str = "sample.json"):
    from decimal import Decimal

    return json.loads(fixture_files(name)[file], parse_float=Decimal)


@pytest.fixture
def quotation():
    return load_fixture("quotation")


@pytest.fixture
def sales():
    return load_fixture("sales-grouped")


@pytest.fixture
def purchase_order():
    return load_fixture("purchase-order")
