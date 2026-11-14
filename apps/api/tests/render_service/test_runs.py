from decimal import Decimal

import pytest

from jester_api.render_service import runs as runs_module
from jester_api.render_service.runs import Caller, NewRun, Runs, canonical_sha256
from jester_api.report_definition.problems import error

USER = Caller("user", "u-1", "alice")


def test_canonical_hash_ignores_key_order_and_keeps_decimals_exact():
    a = {"b": [1, {"y": Decimal("1250.50"), "x": "ก"}], "a": None}
    b = {"a": None, "b": [1, {"x": "ก", "y": Decimal("1250.50")}]}
    assert canonical_sha256(a) == canonical_sha256(b)
    assert canonical_sha256({"v": Decimal("1250.50")}) != canonical_sha256({"v": Decimal("1250.5")})


@pytest.mark.db
async def test_record_get_and_no_customer_data_stored(pool, clock):
    runs = Runs(pool, clock)
    secret = "SECRET-CUSTOMER-NAME"
    run_id = await runs.record(
        NewRun(
            "render", "quote", USER, "failed", version=3, request_id="req-1", error_code="INPUT_INVALID",
            provenance={"dataSha256": canonical_sha256({"name": secret})},
            problems=[error("DATA_INVALID", "value does not satisfy type", pointer="/data/name")],
        )
    )  # fmt: skip
    run = await runs.get(run_id)
    assert (run.status, run.version, run.caller, run.request_id) == ("failed", 3, USER, "req-1")
    assert run.problems == [
        {
            "severity": "error",
            "code": "DATA_INVALID",
            "message": "value does not satisfy type",
            "pointer": "/data/name",
        }
    ]
    async with pool.connection() as conn:
        dump = await (await conn.execute("SELECT * FROM runs")).fetchall()
    assert secret not in repr(dump)
    assert await runs.get("nope") is None


@pytest.mark.db
async def test_list_pages_filters_and_last(pool, clock):
    runs = Runs(pool, clock)
    ids = []
    for i in range(5):
        clock.advance(seconds=1)
        template = "a" if i % 2 == 0 else "b"
        ids.append(await runs.record(NewRun("render", template, USER, "succeeded" if i < 4 else "failed")))
    page1, cursor = await runs.list(None, None, 2, None)
    page2, cursor2 = await runs.list(None, None, 2, cursor)
    page3, cursor3 = await runs.list(None, None, 2, cursor2)
    assert [r.id for r in page1 + page2 + page3] == list(reversed(ids)) and cursor3 is None
    assert [r.id for r in (await runs.list("a", None, 10, None))[0]] == [ids[4], ids[2], ids[0]]
    assert [r.id for r in (await runs.list(None, "failed", 10, None))[0]] == [ids[4]]
    last = await runs.last(["a", "b", "zz"])
    assert (last["a"].id, last["b"].id, "zz" in last) == (ids[4], ids[3], False)


@pytest.mark.db
async def test_retention_keeps_everything_until_someone_sets_it(pool, clock, monkeypatch):
    monkeypatch.setattr(runs_module, "RETENTION_EVERY", 3)
    runs = Runs(pool, clock)
    old = await runs.record(NewRun("render", "a", USER, "succeeded"))
    clock.advance(days=5 * 365)
    for _ in range(3):  # passes a retention round with the default policy
        await runs.record(NewRun("render", "a", USER, "succeeded"))
    assert await runs.get(old) is not None  # default: keep for ever

    preview = await runs.retention(preview_days=90)
    assert (preview.days, preview.would_delete) == (None, 1)
    assert await runs.get(old) is not None  # previewing deletes nothing

    policy = await runs.set_retention(90, "alice")
    assert (policy.days, policy.set_by, policy.set_at) == (90, "alice", clock.now)
    for _ in range(3):
        await runs.record(NewRun("render", "a", USER, "succeeded"))
    assert await runs.get(old) is None

    kept = await runs.record(NewRun("render", "a", USER, "succeeded"))
    await runs.set_retention(None, "bob")
    clock.advance(days=400)
    for _ in range(3):
        await runs.record(NewRun("render", "a", USER, "succeeded"))
    assert await runs.get(kept) is not None  # back to keep for ever

    for bad in (0, -1, 40000, True):
        with pytest.raises(ValueError):
            await runs.set_retention(bad, "x")
