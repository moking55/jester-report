import httpx
import pytest

from jester_api.render_service import RenderError

from .conftest import ALICE, PARAMS, SAMPLE

pytestmark = pytest.mark.db


async def failure(awaitable) -> RenderError:
    with pytest.raises(RenderError) as e:
        await awaitable
    return e.value


async def test_preview_uses_the_draft_with_a_watermark(setup, engine_route):
    store, service, _ = setup
    rev = await store.put_file("quote", "extra.css", "p { }", 1, "alice")  # draft differs from v1
    outcome = await service.preview("quote", PARAMS, None, None, ALICE)  # data from sample.json
    assert outcome.version is None and outcome.filename == f"quote-draft-r{rev}.pdf"
    sent = engine_route.calls.last.request.content
    assert b"DRAFT" in sent and b"position: fixed" in sent
    run = await service.get_run(outcome.run_id)
    assert (run.kind, run.version, run.draft_revision) == ("preview", None, rev)


async def test_preview_input_problems(setup):
    store, service, _ = setup
    err = await failure(service.preview("quote", PARAMS, None, "missing.json", ALICE))
    assert (err.code, err.http_status) == ("INPUT_INVALID", 422)
    await store.put_file("quote", "report.json", "{ broken", 1, "alice")
    err = await failure(service.preview("quote", PARAMS, None, None, ALICE))
    assert (err.code, err.http_status) == ("DRAFT_INVALID", 422)
    assert {p.code for p in err.problems} == {"JSON_INVALID"}


async def test_validate_valid_draft(setup):
    _, service, _ = setup
    result = await service.validate("quote")
    assert result.valid and result.revision == 1 and result.problems == []


async def test_validate_finds_template_typos_with_lines(setup):
    store, service, _ = setup
    template = (await store.get_draft("quote")).files
    html = next(f.content for f in template if f.name == "template.html") + "\n{{ data.customer.nmae }}"
    rev = await store.put_file("quote", "template.html", html, 1, "alice")
    result = await service.validate("quote")
    assert not result.valid and result.revision == rev
    typo = next(p for p in result.problems if p.code == "TEMPLATE_UNDEFINED")
    assert typo.file == "template.html" and typo.line == html.count("\n") + 1


async def test_validate_without_engine_warns_about_fonts(setup, engine_route):
    _, service, _ = setup
    engine_route.mock(side_effect=httpx.ConnectError("down"))
    result = await service.validate("quote")
    assert result.valid and {p.code for p in result.problems} == {"FONT_UNVERIFIED"}


async def test_runs_api_and_retention(setup):
    _, service, _ = setup
    done = await service.render("quote", "published", PARAMS, SAMPLE, ALICE)
    items, _next = await service.list_runs("quote", None, 10, None)
    assert [r.id for r in items] == [done.run_id]
    assert (await service.last_runs(["quote"]))["quote"].id == done.run_id
    assert (await failure(service.get_run("nope"))).http_status == 404
    assert (await service.retention(preview_days=30)).would_delete == 0
    assert (await service.set_retention(30, "alice")).days == 30
    assert (await failure(service.set_retention(0, "alice"))).code == "INPUT_INVALID"


async def test_health(setup, engine_route):
    _, service, _ = setup
    up = await service.health()
    assert (up.status, up.database, up.object_storage, up.engine, up.engine_version) == (
        "up",
        "up",
        "up",
        "up",
        "9.4.1",
    )
    service._engine.health = _engine_down  # type: ignore[method-assign]
    down = await service.health()
    assert (down.status, down.engine, down.engine_version) == ("degraded", "down", None)


async def _engine_down():
    from jester_api.engine_client import EngineError, ErrorCode

    raise EngineError(ErrorCode.SERVICE_UNAVAILABLE, message="engine unreachable", retryable=True)
