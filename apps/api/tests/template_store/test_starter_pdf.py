"""Live (Gotenberg): the v1.7 starters, rewritten for the Document Designer, print the same PDF as v1.6.

SPEC-template-store.md "v1.7 G4": every piece of text lands on the same page within 0.5 pt. The v1.6 templates
(and the stylesheets they came with) are kept in fixtures/v16.
"""

import base64
import io
import os
from pathlib import Path

import pytest
from pypdf import PdfReader

from jester_api.binder import bind
from jester_api.data_prep import prepare
from jester_api.engine_client import EngineClient, RenderFile

from ..binder.test_bind import ASSETS, QUOTE_PARAMS, SALES_PARAMS
from ..binder.test_tax_invoice import PARAMS as TAX_PARAMS
from ..data_prep.conftest import fixture_files, load_fixture, sample

pytestmark = pytest.mark.engine

V16 = Path(__file__).parent / "fixtures" / "v16"
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)
CASES = {
    "blank": {},
    "quotation": QUOTE_PARAMS,
    "purchase-order": {},
    "sales-grouped": SALES_PARAMS,
    "tax-invoice": TAX_PARAMS,
}
TOLERANCE_PT = 0.5


def text_runs(pdf: bytes) -> list[tuple[int, str, float, float]]:
    """Every piece of text with its page and where it starts on the page (pt)."""
    out: list[tuple[int, str, float, float]] = []
    for number, page in enumerate(PdfReader(io.BytesIO(pdf)).pages):

        def visit(text, cm, tm, _font, _size, number=number):
            if text.strip():
                x = tm[4] * cm[0] + tm[5] * cm[2] + cm[4]
                y = tm[4] * cm[1] + tm[5] * cm[3] + cm[5]
                out.append((number, text, x, y))

        page.extract_text(visitor_text=visit)
    return out


async def render(client: EngineClient, name: str, version: str) -> bytes:
    files = fixture_files(name)
    if version == "v16":
        files["template.html"] = (V16 / f"{name}.html").read_text(encoding="utf-8")
        css = V16 / f"{name}.css"
        if css.exists():
            files["report.css"] = css.read_text(encoding="utf-8")
    definition = load_fixture(name)
    prepared = prepare(definition, CASES[name], sample(name), {}).prepared
    result = bind(definition, files, ASSETS, prepared)
    assert result.problems == [], result.problems
    bound = result.bound
    out = await client.convert_html(
        bound.index_html,
        page=bound.page,
        header_html=bound.header_html,
        footer_html=bound.footer_html,
        assets=[*bound.files, *(RenderFile(n, PNG) for n in bound.asset_names)],
    )
    return out.pdf


@pytest.mark.parametrize("name", list(CASES))
async def test_starter_prints_as_before(name):
    async with EngineClient(os.environ["GOTENBERG_URL"], timeout_s=90) as client:
        before = text_runs(await render(client, name, "v16"))
        after = text_runs(await render(client, name, "v17"))
    assert [(p, t) for p, t, _, _ in after] == [(p, t) for p, t, _, _ in before]
    moved = [
        (t, round(x0, 2), round(y0, 2), round(x1, 2), round(y1, 2))
        for (_, t, x0, y0), (_, _, x1, y1) in zip(before, after, strict=True)
        if abs(x1 - x0) > TOLERANCE_PT or abs(y1 - y0) > TOLERANCE_PT
    ]
    for m in moved:
        print(name, m)  # shown with -s when it fails
    assert moved == [], moved
