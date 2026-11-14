"""Live: real PostgreSQL, S3 storage and Gotenberg on the VM (needs all three env vars)."""

import asyncio
import io
import os
import uuid

import pytest
from pypdf import PdfReader

from jester_api.engine_client import EngineClient
from jester_api.render_service import RenderError, RenderService, RenderSettings
from jester_api.template_store import S3BlobStore, TemplateStore

from .conftest import ALICE, PARAMS, SAMPLE

pytestmark = [pytest.mark.engine, pytest.mark.db, pytest.mark.storage]
ENDLESS = "{% for i in range(100000) %}{% for j in range(100000) %}{% endfor %}{% endfor %}"


def text_of(pdf: bytes) -> list[str]:
    return [page.extract_text() for page in PdfReader(io.BytesIO(pdf)).pages]


@pytest.fixture
async def live(pool, clock):
    blobs = S3BlobStore(
        os.environ["JESTER_TEST_S3_ENDPOINT"],
        f"jester-live-{uuid.uuid4().hex[:10]}",
        os.environ.get("JESTER_TEST_S3_ACCESS_KEY", "jester-dev"),
        os.environ.get("JESTER_TEST_S3_SECRET_KEY", "jester-dev-secret"),
    )
    await blobs.ensure_bucket()
    store = TemplateStore(pool, blobs)
    await store.create("quote", "ใบเสนอราคา", "quotation", "alice")
    await store.publish("quote", 1, None, "alice")
    async with EngineClient(os.environ["GOTENBERG_URL"], timeout_s=90) as engine:
        yield store, RenderService(store, engine, pool, RenderSettings(bind_timeout_s=30), clock), engine


async def test_render_quotation_end_to_end(live):
    _, service, _ = live
    outcome = await service.render("quote", "published", PARAMS, SAMPLE, ALICE)
    pages = text_of(outcome.pdf)
    assert any("2,501.00" in page for page in pages)  # 2 x 1250.50, computed by data-prep (digits are exact)
    run = await service.get_run(outcome.run_id)
    assert run.status == "succeeded" and run.pages == len(pages)
    assert run.provenance["engineVersion"] == "9.4.1" and run.provenance["outputSha256"]
    assert await service._fonts.known(["TH Sarabun New"]) == frozenset({"TH Sarabun New"})


async def test_preview_has_draft_on_every_page(live):
    store, service, _ = live
    many = {
        **SAMPLE,
        "items": [{**SAMPLE["items"][0], "id": f"QL{i:03}"} for i in range(80)],
    }  # several pages
    outcome = await service.preview("quote", PARAMS, many, None, ALICE)
    pages = text_of(outcome.pdf)
    assert len(pages) > 1 and all("DRAFT" in page for page in pages)


async def test_endless_template_times_out_while_other_renders_succeed(live, pool, clock):
    store, service, engine = live
    await store.put_file("quote", "template.html", ENDLESS, 1, "alice")
    quick = RenderService(store, engine, pool, RenderSettings(bind_timeout_s=5), clock)
    stuck, fine = await asyncio.gather(
        quick.preview("quote", PARAMS, SAMPLE, None, ALICE),
        service.render("quote", "published", PARAMS, SAMPLE, ALICE),
        return_exceptions=True,
    )
    assert isinstance(stuck, RenderError) and stuck.code == "RENDER_TIMEOUT"
    assert fine.pdf.startswith(b"%PDF")
