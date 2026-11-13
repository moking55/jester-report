from decimal import Decimal

import pytest

from jester_api.engine_client import EngineError, ErrorCode, PageSetup, RenderFile
from jester_api.engine_client.models import collect_files

MAX = 1024


def test_orders_reserved_files_first():
    files = collect_files(b"<p>", b"<h>", b"<f>", [RenderFile("logo.png", b"x")], MAX)
    assert [f.name for f in files] == ["index.html", "header.html", "footer.html", "logo.png"]


def test_header_footer_optional():
    assert [f.name for f in collect_files(b"<p>", None, None, [], MAX)] == ["index.html"]


@pytest.mark.parametrize("name", ["", ".", "..", "a/b.png", "a\\b.png", "../x.png", "x..png"])
def test_rejects_bad_names(name):
    with pytest.raises(EngineError) as e:
        collect_files(b"<p>", None, None, [RenderFile(name, b"x")], MAX)
    assert e.value.code is ErrorCode.RENDER_INPUT_INVALID


@pytest.mark.parametrize("name", ["index.html", "header.html", "footer.html"])
def test_rejects_reserved_asset_names(name):
    with pytest.raises(EngineError) as e:
        collect_files(b"<p>", None, None, [RenderFile(name, b"x")], MAX)
    assert e.value.code is ErrorCode.RENDER_INPUT_INVALID


def test_rejects_duplicate_names():
    assets = [RenderFile("logo.png", b"a"), RenderFile("logo.png", b"b")]
    with pytest.raises(EngineError, match="duplicate"):
        collect_files(b"<p>", None, None, assets, MAX)


def test_rejects_oversize_request():
    with pytest.raises(EngineError, match="too large") as e:
        collect_files(b"x" * (MAX + 1), None, None, [], MAX)
    assert e.value.code is ErrorCode.RENDER_INPUT_INVALID


def test_error_message_never_contains_content():
    secret = b"SECRET-CONTENT" * 200
    with pytest.raises(EngineError) as e:
        collect_files(secret, None, None, [], MAX)
    assert "SECRET" not in e.value.message


def test_page_setup_defaults_are_explicit_a4():
    f = PageSetup().form_fields()
    assert f == {
        "paperWidth": "8.27",
        "paperHeight": "11.7",
        "landscape": "false",
        "marginTop": "20mm",
        "marginBottom": "20mm",
        "marginLeft": "15mm",
        "marginRight": "15mm",
    }


def test_page_setup_landscape_and_negative_margin():
    assert PageSetup(landscape=True).form_fields()["landscape"] == "true"
    with pytest.raises(ValueError):
        PageSetup(margin_top_mm=Decimal("-1"))
