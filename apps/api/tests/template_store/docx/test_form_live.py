"""Live (Gotenberg): the realistic Word form prints on one page with its text, footer on the right (v1.15)."""

import io
import os

import pytest
from pypdf import PdfReader

from jester_api.binder import bind
from jester_api.data_prep import prepare
from jester_api.engine_client import EngineClient, RenderFile
from jester_api.report_definition import DefinitionInput, load_definition
from jester_api.template_store.assets import detect
from jester_api.template_store.docx import read_docx

from .form import FIXTURES

pytestmark = pytest.mark.engine


async def test_the_form_prints_one_page_with_its_text_and_the_footer_on_the_right():
    bundle, _ = read_docx((FIXTURES / "form.docx").read_bytes(), "requisition-form", "แบบคำขอเบิกพัสดุ")
    infos = {name: detect(name, raw) for name, raw in bundle.assets.items()}
    loaded = load_definition(DefinitionInput(bundle.files, infos, frozenset({"TH Sarabun New"})))
    b = bind(loaded.definition, bundle.files, infos, prepare(loaded.definition, {}, {}, {}).prepared).bound
    async with EngineClient(os.environ["GOTENBERG_URL"], timeout_s=90) as client:
        out = await client.convert_html(
            b.index_html,
            page=b.page,
            header_html=b.header_html,
            footer_html=b.footer_html,
            assets=[*b.files, *(RenderFile(n, bundle.assets[n]) for n in b.asset_names)],
        )
    reader = PdfReader(io.BytesIO(out.pdf))
    assert len(reader.pages) == 1
    page = reader.pages[0]
    text = page.extract_text()
    for needle in ("เบิกพัสดุ", "หมายเหตุ", "รวม", "ผู้อนุมัติ"):
        assert needle in text.replace(" ", "")

    xs: list[float] = []

    def visit(t, cm, tm, font, size):
        if "หน้า" in t:
            xs.append(tm[4])

    page.extract_text(visitor_text=visit)
    assert xs and xs[0] > float(page.mediabox.width) / 2  # right-aligned in Word, right half on paper
