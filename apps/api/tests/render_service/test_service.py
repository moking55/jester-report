import asyncio

import httpx
import pytest

from jester_api.auth import Principal
from jester_api.engine_client import EngineClient
from jester_api.render_service import RenderError, RenderService, RenderSettings

from .conftest import ALICE, BASE, KEY, PARAMS, SAMPLE, pdf_with_font

pytestmark = pytest.mark.db
ENDLESS = "{% for i in range(100000) %}{% for j in range(100000) %}{% endfor %}{% endfor %}"


async def failure(awaitable) -> RenderError:
    with pytest.raises(RenderError) as e:
        await awaitable
    return e.value


async def test_render_published_records_provenance(setup):
    store, service, _ = setup
    outcome = await service.render("quote", "published", PARAMS, SAMPLE, KEY, "req-9", None)
    assert outcome.pdf.startswith(b"%PDF") and outcome.version == 1 and outcome.filename == "quote-v1.pdf"
    run = await service._runs.get(outcome.run_id)
    assert (run.status, run.kind, run.version, run.pages, run.request_id) == (
        "succeeded",
        "render",
        1,
        1,
        "req-9",
    )
    assert (run.caller.type, run.caller.name) == ("api-key", "api-key:erp")
    p = run.provenance
    assert p["templateSha256"] == (await store.definition_input("quote", 1)).sha256
    assert p["engineVersion"] == "9.4.1" and p["engineTrace"] == "t1" and p["outputSha256"]
    assert p["options"]["failOnResourceLoadingFailed"] == "true"


@pytest.mark.parametrize(
    ("template_id", "version"), [("nope", "published"), ("quote", 9)], ids=["no-template", "no-version"]
)
async def test_not_found(setup, template_id, version):
    _, service, _ = setup
    err = await failure(service.render(template_id, version, PARAMS, SAMPLE, ALICE))
    assert (err.code, err.http_status) == ("NOT_FOUND", 404) and err.run_id


async def test_unpublished_template_is_not_found(setup):
    store, service, _ = setup
    await store.create("fresh", "F", "blank", "alice")
    assert (await failure(service.render("fresh", "published", {}, {}, ALICE))).http_status == 404


async def test_bad_input_is_422_with_problems_and_a_failed_run(setup):
    _, service, _ = setup
    err = await failure(service.render("quote", "published", {}, {**SAMPLE, "items": "x"}, ALICE))
    assert (err.code, err.http_status) == ("INPUT_INVALID", 422)
    assert {p.code for p in err.problems} >= {"PARAM_REQUIRED", "DATA_INVALID"}
    run = await service._runs.get(err.run_id)
    assert (run.status, run.error_code) == ("failed", "INPUT_INVALID")


async def test_font_gone_from_engine_is_502(setup, engine_route):
    _, service, _ = setup
    engine_route.mock(return_value=httpx.Response(200, content=pdf_with_font("NotoSansThai-Regular")))
    err = await failure(service.render("quote", "published", PARAMS, SAMPLE, ALICE))
    assert (err.code, err.http_status) == ("FONT_MISSING", 502)


async def test_endless_template_times_out(setup, pool, clock):
    store, _, _ = setup
    await store.put_file("quote", "template.html", ENDLESS, 1, "alice")
    await store.publish("quote", 2, None, "alice")
    async with EngineClient(BASE) as engine:
        quick = RenderService(store, engine, pool, RenderSettings(bind_timeout_s=3), clock)
        err = await failure(quick.render("quote", 2, PARAMS, SAMPLE, ALICE))
    assert (err.code, err.http_status, err.retryable) == ("RENDER_TIMEOUT", 504, True)


@pytest.mark.parametrize(
    ("response", "code", "status", "retryable"),
    [
        (httpx.Response(503, text="timeout"), "RENDER_TIMEOUT", 504, True),
        (httpx.ConnectError("down"), "SERVICE_UNAVAILABLE", 503, True),
        (httpx.Response(409, text="resource failed"), "RENDER_RESOURCE_FAILED", 502, False),
        (httpx.Response(404, text="no route"), "ENGINE_MISCONFIGURED", 502, False),
        (httpx.Response(500, text="boom"), "RENDER_FAILED", 502, False),
    ],
)
async def test_engine_errors(setup, engine_route, response, code, status, retryable):
    _, service, _ = setup
    await service._fonts.known(["TH Sarabun New"])  # probe while the engine still answers
    if isinstance(response, Exception):
        engine_route.mock(side_effect=response)
    else:
        engine_route.mock(return_value=response)
    err = await failure(service.render("quote", "published", PARAMS, SAMPLE, ALICE))
    assert (err.code, err.http_status, err.retryable) == (code, status, retryable)


async def test_definition_and_assets_are_cached(setup, monkeypatch):
    import sys

    _, service, blobs = setup
    module = sys.modules["jester_api.render_service.service"]
    calls = {"load": 0, "blob": 0}
    real_load, real_get = module.load_definition, blobs.get

    def counting_load(inp):
        calls["load"] += 1
        return real_load(inp)

    async def counting_get(sha):
        calls["blob"] += 1
        return await real_get(sha)

    monkeypatch.setattr(module, "load_definition", counting_load)
    monkeypatch.setattr(blobs, "get", counting_get)
    for _ in range(2):
        await service.render("quote", "published", PARAMS, SAMPLE, ALICE)
    assert calls == {"load": 1, "blob": 1}


async def test_full_queue_is_503(setup, pool, clock):
    store, _, _ = setup
    async with EngineClient(BASE) as engine:
        busy = RenderService(store, engine, pool, RenderSettings(max_concurrent=1, queue_wait_s=0.2), clock)
        await busy._slots.acquire()  # someone else is rendering
        err = await failure(busy.render("quote", "published", PARAMS, SAMPLE, ALICE))
        busy._slots.release()
    assert (err.code, err.http_status, err.retryable) == ("SERVICE_UNAVAILABLE", 503, True)
    await asyncio.sleep(0)


async def test_archived_template_is_410_with_a_failed_run_until_unarchived(setup):
    store, service, _ = setup
    await store.set_archived("quote", True, "alice")
    err = await failure(service.render("quote", "published", PARAMS, SAMPLE, KEY))
    assert (err.code, err.http_status) == ("TEMPLATE_ARCHIVED", 410)
    run = await service._runs.get(err.run_id)
    assert (run.status, run.error_code) == ("failed", "TEMPLATE_ARCHIVED")
    for call in (
        service.preview("quote", PARAMS, None, None, ALICE),
        service.validate("quote"),
    ):
        assert (await failure(call)).http_status == 410
    await store.set_archived("quote", False, "alice")
    outcome = await service.render("quote", "published", PARAMS, SAMPLE, KEY)
    assert outcome.version == 1


async def test_key_limited_to_templates_gets_the_same_403_for_everything_else(setup, pool):
    store, service, _ = setup
    await store.create("other", "O", "blank", "alice")
    await store.create("gone", "G", "blank", "alice")
    await store.set_archived("gone", True, "alice")
    limited = Principal("api_key", "api-key:erp", api_key_id=KEY.api_key_id, templates=frozenset({"quote"}))
    assert (await service.render("quote", "published", PARAMS, SAMPLE, limited)).version == 1
    errors = [
        await failure(service.render(t, "published", PARAMS, SAMPLE, limited))
        for t in ("other", "gone", "zzz")
    ]
    assert {(e.code, e.http_status, e.message) for e in errors} == {
        ("TEMPLATE_NOT_ALLOWED", 403, "this API key cannot render this template")
    }
    run = await service._runs.get(errors[0].run_id)
    assert (run.status, run.error_code) == ("failed", "TEMPLATE_NOT_ALLOWED")


async def test_refused_keys_do_not_take_queue_slots(setup, pool, clock):
    store, _, _ = setup
    async with EngineClient(BASE) as engine:
        service = RenderService(
            store, engine, pool, RenderSettings(max_concurrent=1, queue_wait_s=0.5), clock
        )
        limited = Principal("api_key", "api-key:erp", templates=frozenset({"nope"}))
        refused = [service.render("quote", "published", PARAMS, SAMPLE, limited) for _ in range(20)]
        results = await asyncio.gather(
            *refused, service.render("quote", "published", PARAMS, SAMPLE, KEY), return_exceptions=True
        )
    assert results[-1].version == 1
    assert {r.code for r in results[:-1]} == {"TEMPLATE_NOT_ALLOWED"}


# ---- v1.5: documents ----------------------------------------------------------------------------------
async def test_successful_renders_keep_their_document(setup):
    _, service, _ = setup
    params = {**PARAMS, "quoteId": "Q-77"}
    by_user = await service.render("quote", "published", params, SAMPLE, ALICE, None, "ใบเสนอราคา Q-77.pdf")
    by_key = await service.render("quote", 1, PARAMS, SAMPLE, KEY)
    assert await service.document_pdf(by_user.run_id) == ("ใบเสนอราคา Q-77.pdf", by_user.pdf)
    assert await service.document_pdf(by_key.run_id) == ("quote-v1.pdf", by_key.pdf)
    docs, _ = await service.list_documents("quote", "Q-77")
    assert [d.run_id for d in docs] == [by_user.run_id] and docs[0].params == params
    assert (await service.get_run(by_user.run_id)).has_document


async def test_previews_and_failures_keep_no_document(setup, pool):
    store, service, _ = setup
    preview = await service.preview("quote", PARAMS, SAMPLE, None, ALICE)
    bad = await failure(service.render("quote", "published", PARAMS, {"items": "nope"}, ALICE))
    limited = Principal("api_key", "api-key:pos", api_key_id=KEY.api_key_id, templates=frozenset({"other"}))
    refused = await failure(service.render("quote", "published", PARAMS, SAMPLE, limited))
    await store.set_archived("quote", True, "alice")
    archived = await failure(service.render("quote", "published", PARAMS, SAMPLE, ALICE))
    assert (bad.http_status, refused.http_status, archived.http_status) == (422, 403, 410)
    for run_id in (preview.run_id, bad.run_id, refused.run_id, archived.run_id):
        assert not (await service.get_run(run_id)).has_document
        assert (await failure(service.document_pdf(run_id))).http_status == 404
    assert service._runs.documents.objects == {}


async def test_storage_down_is_503_and_a_failed_run(setup):
    _, service, _ = setup
    service._runs.documents.fail_put = True
    exc = await failure(service.render("quote", "published", PARAMS, SAMPLE, ALICE))
    assert (exc.code, exc.http_status, exc.retryable) == ("SERVICE_UNAVAILABLE", 503, True)
    run = await service.get_run(exc.run_id)
    assert (run.status, run.error_code, run.has_document) == ("failed", "SERVICE_UNAVAILABLE", False)


async def test_lost_or_changed_pdf_is_404_not_wrong_bytes(setup, caplog):
    _, service, _ = setup
    outcome = await service.render("quote", "published", PARAMS, SAMPLE, ALICE)
    files = service._runs.documents
    files.objects[outcome.run_id] = (b"%PDF-other", None)
    assert (await failure(service.document_pdf(outcome.run_id))).http_status == 404
    del files.objects[outcome.run_id]
    assert (await failure(service.document_pdf(outcome.run_id))).http_status == 404
    assert "does not match its sha256" in caplog.text
    assert (await failure(service.list_documents(None, " "))).http_status == 422


async def test_big_decimals_and_nul_characters_are_kept(setup):
    _, service, _ = setup
    # the schema wants decimal strings; Decimals in params are covered in test_runs
    data = {**SAMPLE, "customer": {"name": "ลูกค้า\u0000X"}, "discount": "12345678901234567.89"}
    outcome = await service.render("quote", "published", PARAMS, data, ALICE)
    docs, _ = await service.list_documents(None, "ลูกค้า")
    assert [d.run_id for d in docs] == [outcome.run_id]
    async with service._db.connection() as conn:
        row = await (await conn.execute("SELECT data::text FROM documents")).fetchone()
    assert "12345678901234567.89" in row[0] and r"\u0000" in row[0]  # json keeps the escape; jsonb refuses it
