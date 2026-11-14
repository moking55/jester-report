"""Live: bind the quotation fixture and render it with the real engine (needs GOTENBERG_URL)."""

import base64
import io
import os

import pytest
from pypdf import PdfReader

from jester_api.engine_client import EngineClient, RenderFile

from .test_bind import QUOTE_PARAMS, bound_fixture

pytestmark = pytest.mark.engine

# 1x1 transparent PNG stands in for the fixture's logo asset
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


def _fonts(reader: PdfReader) -> set[str]:
    names = set()
    for page in reader.pages:
        fonts = page.get("/Resources", {}).get("/Font", {})
        for ref in fonts.values():
            names.add(str(ref.get_object().get("/BaseFont")))
    return names


async def test_quotation_renders_with_thai_font():
    bound = bound_fixture("quotation", QUOTE_PARAMS).bound
    assets = [*bound.files, *(RenderFile(n, PNG) for n in bound.asset_names)]
    async with EngineClient(os.environ["GOTENBERG_URL"], timeout_s=90) as client:
        result = await client.convert_html(
            bound.index_html,
            page=bound.page,
            header_html=bound.header_html,
            footer_html=bound.footer_html,
            assets=assets,
        )
    reader = PdfReader(io.BytesIO(result.pdf))
    text = "".join(p.extract_text() for p in reader.pages)
    assert "3,210.00" in text and "3,100.70" in text  # pypdf is lossy for Thai marks; digits are exact
    assert any("THSarabunNew" in f for f in _fonts(reader)), _fonts(reader)
