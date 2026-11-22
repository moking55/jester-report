from datetime import UTC, datetime

import pytest

from jester_api.tags import TagError, Tags

pytestmark = pytest.mark.db


async def _template(pool, id, tags):
    async with pool.connection() as conn:
        await conn.execute("INSERT INTO templates (id, name, tags) VALUES (%s, %s, %s)", (id, id, tags))


async def _document(pool, run_id, tags):
    async with pool.connection() as conn:
        await conn.execute(
            "INSERT INTO runs (id, kind, template_id, caller_type, caller_id, status, created_at) "
            "VALUES (%s, 'render', 't', 'user', 'u', 'succeeded', %s)",
            (run_id, datetime.now(UTC)),
        )
        await conn.execute(
            "INSERT INTO documents (run_id, template_id, filename, params, data, pdf_size, pdf_sha256, tags) "
            "VALUES (%s, 't', 'f.pdf', '{}', '{}', 1, 'x', %s)",
            (run_id, tags),
        )


async def test_list_counts_templates_and_documents_busiest_first(pool):
    await _template(pool, "a", ["vip", "q4"])
    await _template(pool, "b", ["vip"])
    await _document(pool, "r1", ["vip", "ลูกค้า"])
    await _document(pool, "r2", [])
    got = await Tags(pool).list()
    assert [(u.tag, u.templates, u.documents) for u in got] == [
        ("vip", 2, 1),
        ("q4", 1, 0),
        ("ลูกค้า", 0, 1),
    ]
    assert {u.color for u in got} == {"gray"}


async def test_set_color_and_gray_removes_it(pool):
    tags = Tags(pool)
    await _template(pool, "a", ["vip"])
    assert await tags.set_color(" vip ", "red") == ("vip", "red")
    assert [(u.tag, u.color) for u in await tags.list()] == [("vip", "red")]
    await tags.set_color("vip", "blue")
    assert (await tags.list())[0].color == "blue"
    await tags.set_color("vip", "gray")
    assert (await tags.list())[0].color == "gray"
    async with pool.connection() as conn:
        cur = await conn.execute("SELECT count(*) FROM tag_colors")
        assert (await cur.fetchone())[0] == 0


async def test_unused_tag_can_be_coloured_and_keeps_it(pool):
    tags = Tags(pool)
    await tags.set_color("later", "teal")
    assert await tags.list() == []  # not in use: not listed
    await _template(pool, "a", ["later"])
    assert (await tags.list())[0].color == "teal"  # comes back with its colour


@pytest.mark.parametrize("tag", ["a,b", "", "x" * 31])
async def test_set_color_rejects_bad_tag(pool, tag):
    with pytest.raises(TagError):
        await Tags(pool).set_color(tag, "red")


async def test_set_color_rejects_unknown_color(pool):
    with pytest.raises(TagError, match="color"):
        await Tags(pool).set_color("vip", "#ff0000")
