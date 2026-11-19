"""Live (Gotenberg): paper sizes, a receipt roll, free layout and an image in the header (SPEC v1.8 L2-L4)."""

import base64
import io
import os

import pytest
from pypdf import PdfReader

from jester_api.binder import bind
from jester_api.data_prep import prepare
from jester_api.engine_client import EngineClient, RenderFile
from jester_api.report_definition import AssetInfo, DefinitionInput, load_definition

from ..data_prep.conftest import FONTS, fixture_files
from .test_bind_engine import PNG

pytestmark = pytest.mark.engine
MM = 72 / 25.4
ASSETS = {"logo.png": AssetInfo("image/png", "ab" * 32)}


async def pdf_of(page: dict, template: str, extra_files: dict | None = None):
    import json

    files = fixture_files("blank")
    report = json.loads(files["report.json"])
    report["page"] = page
    files["report.json"] = json.dumps(report, ensure_ascii=False)
    files["template.html"] = template
    files.update(extra_files or {})
    loaded = load_definition(DefinitionInput(files, ASSETS, FONTS))
    assert loaded.problems == [], loaded.problems
    prepared = prepare(loaded.definition, {}, {"title": "สวัสดี"}, {}).prepared
    result = bind(loaded.definition, files, ASSETS, prepared)
    assert result.problems == [] or all(p.severity == "warning" for p in result.problems), result.problems
    bound = result.bound
    header = bound.header_html
    if header is not None and b'src="logo.png"' in header:
        uri = b"data:image/png;base64," + base64.b64encode(PNG)
        header = header.replace(b'src="logo.png"', b'src="' + uri + b'"')
    async with EngineClient(os.environ["GOTENBERG_URL"], timeout_s=90) as client:
        out = await client.convert_html(
            bound.index_html,
            page=bound.page,
            header_html=header,
            footer_html=bound.footer_html,
            assets=[*bound.files, *(RenderFile(n, PNG) for n in bound.asset_names)],
        )
    return PdfReader(io.BytesIO(out.pdf)), result.problems


def sizes_mm(reader: PdfReader) -> list[tuple[float, float]]:
    return [(round(float(p.mediabox.width) / MM), round(float(p.mediabox.height) / MM)) for p in reader.pages]


def text_start(reader: PdfReader, needle: str) -> tuple[float, float]:
    """x and y (mm from the top-left) where the first run starting with `needle` is drawn."""
    page = reader.pages[0]
    height = float(page.mediabox.height)
    found: list[tuple[float, float]] = []

    def visit(text, cm, tm, _font, _size):
        if text.strip().startswith(needle) and not found and (tm[4], tm[5]) != (0, 0):
            found.append(((tm[4] * cm[0] + cm[4]) / MM, (height - (tm[5] * cm[3] + cm[5])) / MM))

    page.extract_text(visitor_text=visit)
    return found[0]


async def test_a5_landscape_and_a_custom_size():
    body = "<p>{{ data.title }}</p>"
    reader, _ = await pdf_of({"size": "A5", "orientation": "landscape"}, body)
    assert sizes_mm(reader) == [(210, 148)]
    reader, _ = await pdf_of(
        {
            "size": "custom",
            "widthMm": 100,
            "heightMm": 50,
            "marginsMm": {"top": 5, "bottom": 5, "left": 5, "right": 5},
        },
        body,
    )
    assert sizes_mm(reader) == [(100, 50)]


async def test_roll_is_one_page_as_tall_as_its_content():
    short = "<p>{{ data.title }}</p>"
    long = "".join(f"<p>รายการ {i}</p>" for i in range(60))
    a, _ = await pdf_of({"size": "roll", "rollWidthMm": 80}, short)
    b, _ = await pdf_of({"size": "roll", "rollWidthMm": 80}, long)
    (wa, ha), (wb, hb) = sizes_mm(a)[0], sizes_mm(b)[0]
    assert len(a.pages) == len(b.pages) == 1 and wa == wb == 80 and hb > ha + 100


async def test_free_layout_places_a_box_where_it_says():
    template = (
        '<div data-jd="page" style="position: relative; width: 148mm; height: 210mm">'
        '<div data-jd="box" style="position: absolute; left: 30mm; top: 40mm; width: 60mm; height: 10mm">'
        "<p style='margin:0'>{{ data.title }}</p></div>"
        '<img data-jd="guide" src="logo.png" style="position: absolute; left: 0; top: 0">'
        "</div>"
    )
    reader, problems = await pdf_of({"size": "A5", "layout": "free"}, template)
    assert sizes_mm(reader) == [(148, 210)] and len(reader.pages) == 1
    x, y = text_start(reader, "สวัสดี")
    assert abs(x - 30) < 0.5 and 40 <= y <= 50, (x, y)  # the baseline sits in the 10 mm box
    assert not any(p.severity == "error" for p in problems)


async def test_header_logo_prints_on_every_page_and_free_layout_ignores_header_files():
    header = '<img src="logo.png" height="20">'
    body = "".join(f"<p style='page-break-after: always'>หน้า {i}</p>" for i in range(2))
    reader, _ = await pdf_of({}, body, {"header.html": header})
    assert len(reader.pages) == 2
    assert all(len(page.images) == 1 for page in reader.pages)  # the logo, on each page
    _, problems = await pdf_of({"size": "A5", "layout": "free"}, "<p>x</p>", {"header.html": header})
    ignored = [p.file for p in problems if p.code == "HEADER_FOOTER_IGNORED"]
    assert sorted(ignored) == ["footer.html", "header.html"]  # the blank starter has both files
