import httpx
import respx

from jester_api.engine_client import EngineClient
from jester_api.render_service.fonts import EngineFonts

from .conftest import pdf_with_font

BASE = "http://engine.test"
INSTALLED = {"TH Sarabun New": "THSarabunNew", "Noto Sans Thai": "NotoSansThai-Regular"}


def engine_answer(request: httpx.Request) -> httpx.Response:
    body = request.content.decode("utf-8", "replace")
    # like Chromium: a family that is not installed falls back to Noto Sans Thai
    embedded = next((f for family, f in INSTALLED.items() if f'"{family}"' in body), "NotoSansThai-Regular")
    return httpx.Response(200, content=pdf_with_font(embedded))


@respx.mock
async def test_probe_tells_installed_from_fallback():
    route = respx.post(f"{BASE}/forms/chromium/convert/html").mock(side_effect=engine_answer)
    async with EngineClient(BASE) as engine:
        fonts = EngineFonts(engine)
        assert await fonts.known(["TH Sarabun New", "Comic Sans MS"]) == frozenset({"TH Sarabun New"})
        calls = route.call_count
        assert await fonts.known(["th sarabun new"]) == frozenset({"th sarabun new"})  # cached, any case
        assert route.call_count == calls


@respx.mock
async def test_engine_down_is_unknown_and_retried():
    route = respx.post(f"{BASE}/forms/chromium/convert/html").mock(side_effect=httpx.ConnectError("down"))
    async with EngineClient(BASE) as engine:
        fonts = EngineFonts(engine)
        assert await fonts.known(["TH Sarabun New"]) is None
        route.mock(side_effect=engine_answer)
        assert await fonts.known(["TH Sarabun New"]) == frozenset({"TH Sarabun New"})


def test_font_candidates_come_from_report_json_and_header_footer():
    from jester_api.report_definition.lint import engine_font_candidates
    from jester_api.report_definition.model import parse_report_json

    from ..data_prep.conftest import fixture_files

    files = fixture_files("quotation")
    files["footer.html"] += '<style>.x { font-family: "Noto Sans Thai", sans-serif; }</style>'
    report, _ = parse_report_json(files["report.json"])
    assert engine_font_candidates(files, report) == {"TH Sarabun New", "Noto Sans Thai"}
    assert engine_font_candidates({}, None) == set()
