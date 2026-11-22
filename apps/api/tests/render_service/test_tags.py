"""v1.11 tags on issued documents (SPEC-render-service.md "v1.11")."""

import pytest

from jester_api.render_service import RenderError

from .conftest import ALICE, KEY, PARAMS, SAMPLE

pytestmark = pytest.mark.db


async def failure(awaitable) -> RenderError:
    with pytest.raises(RenderError) as e:
        await awaitable
    return e.value


async def tags_of(service, run_id):
    docs, _ = await service.list_documents(None, None)
    return next(d.tags for d in docs if d.run_id == run_id)


async def test_a_document_gets_a_copy_of_the_templates_tags(setup):
    store, service, _ = setup
    await store.set_tags("quote", ["vip", "ไตรมาส 4"])
    issued = await service.render("quote", "published", PARAMS, SAMPLE, ALICE)
    assert await tags_of(service, issued.run_id) == ["vip", "ไตรมาส 4"]
    await store.set_tags("quote", ["changed"])  # later edits do not reach documents already issued
    assert await tags_of(service, issued.run_id) == ["vip", "ไตรมาส 4"]
    later = await service.render("quote", "published", PARAMS, SAMPLE, KEY)
    assert await tags_of(service, later.run_id) == ["changed"]


async def test_tags_in_the_request_replace_the_copy(setup):
    store, service, _ = setup
    await store.set_tags("quote", ["vip"])
    own = await service.render("quote", "published", PARAMS, SAMPLE, ALICE, tags=[" ลูกค้า-ก ", "q4", "q4"])
    none = await service.render("quote", "published", PARAMS, SAMPLE, ALICE, tags=[])
    assert await tags_of(service, own.run_id) == ["ลูกค้า-ก", "q4"]
    assert await tags_of(service, none.run_id) == []  # asking for no tags means no tags


async def test_bad_tags_are_422_before_anything_happens(setup):
    _, service, _ = setup
    for bad in (["a,b"], ["x" * 31], [f"t{i}" for i in range(11)], [3]):
        exc = await failure(service.render("quote", "published", PARAMS, SAMPLE, ALICE, tags=bad))
        assert (exc.code, exc.http_status, exc.run_id) == ("INPUT_INVALID", 422, None)
    assert (await service.list_runs(None, None))[0] == []  # no run row at all
    assert service._runs.documents.objects == {}  # and no file


async def test_list_filters_need_every_tag_and_q_searches_tags(setup):
    _, service, _ = setup
    a = await service.render("quote", "published", PARAMS, SAMPLE, ALICE, tags=["vip", "q4"])
    b = await service.render("quote", "published", PARAMS, SAMPLE, ALICE, tags=["vip"])
    c = await service.render("quote", "published", PARAMS, SAMPLE, ALICE, tags=[])

    async def ids(**kw):
        return {
            d.run_id
            for d in (await service.list_documents(None, kw.pop("q", None), tags=kw.pop("tags", None)))[0]
        }

    assert await ids(tags=["vip"]) == {a.run_id, b.run_id}
    assert await ids(tags=["vip", "q4"]) == {a.run_id}
    assert await ids(tags=["VIP"]) == set()  # exact match
    assert await ids(tags=[]) == {a.run_id, b.run_id, c.run_id}
    assert await ids(q="q4") == {a.run_id}  # q searches tags too
    assert await ids(q="q4", tags=["vip"]) == {a.run_id}


async def test_set_document_tags_replaces_the_set_and_keeps_the_pdf(setup):
    _, service, _ = setup
    issued = await service.render("quote", "published", PARAMS, SAMPLE, ALICE, tags=["old"])
    assert await service.set_document_tags(issued.run_id, [" new ", "ไทย"]) == ["new", "ไทย"]
    assert await tags_of(service, issued.run_id) == ["new", "ไทย"]
    assert await service.set_document_tags(issued.run_id, []) == []
    assert (await service.document_pdf(issued.run_id))[1] == issued.pdf
    assert (await failure(service.set_document_tags(issued.run_id, ["a,b"]))).http_status == 422
    assert (await failure(service.set_document_tags("nope", ["a"]))).http_status == 404
    preview = await service.preview("quote", PARAMS, SAMPLE, None, ALICE)
    assert (await failure(service.set_document_tags(preview.run_id, ["a"]))).http_status == 404
