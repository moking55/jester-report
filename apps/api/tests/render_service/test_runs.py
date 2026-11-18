import hashlib
from decimal import Decimal

import psycopg
import pytest

from jester_api.render_service import runs as runs_module
from jester_api.render_service.document_files import MemoryDocumentFiles
from jester_api.render_service.runs import (
    Caller,
    DocumentStorageError,
    NewDocument,
    NewRun,
    Runs,
    StoredDocument,
    canonical_sha256,
)
from jester_api.report_definition.problems import error

USER = Caller("user", "u-1", "alice")


def test_canonical_hash_ignores_key_order_and_keeps_decimals_exact():
    a = {"b": [1, {"y": Decimal("1250.50"), "x": "ก"}], "a": None}
    b = {"a": None, "b": [1, {"x": "ก", "y": Decimal("1250.50")}]}
    assert canonical_sha256(a) == canonical_sha256(b)
    assert canonical_sha256({"v": Decimal("1250.50")}) != canonical_sha256({"v": Decimal("1250.5")})


@pytest.mark.db
async def test_record_get_and_no_customer_data_in_runs(pool, clock):
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


# ---- v1.5: documents ----------------------------------------------------------------------------------
PDF = b"%PDF-1.7 fake"


def doc(params=None, data=None, filename="quote-v1.pdf", pdf=PDF):
    return NewDocument(filename, params or {"no": "Q-1"}, data or {}, pdf)


@pytest.mark.db
async def test_record_keeps_the_document_and_marks_the_run(pool, clock):
    files = MemoryDocumentFiles()
    runs = Runs(pool, clock, files)
    run_id = await runs.record(
        NewRun("render", "quote", USER, "succeeded", version=1, pages=1, document=doc())
    )
    clock.advance(seconds=1)  # ids sort by time; within one millisecond the order is random
    plain = await runs.record(NewRun("preview", "quote", USER, "succeeded"))
    assert files.objects[run_id][0] == PDF and len(files.objects) == 1
    stored = await runs.document(run_id)
    assert stored == StoredDocument("quote-v1.pdf", len(PDF), hashlib.sha256(PDF).hexdigest())
    assert await runs.document(plain) is None
    assert (await runs.get(run_id)).has_document and not (await runs.get(plain)).has_document
    listed = {r.id: r.has_document for r in (await runs.list(None, None, 10, None))[0]}
    assert listed == {run_id: True, plain: False}
    assert (await runs.last(["quote"]))["quote"].id == plain


@pytest.mark.db
async def test_documents_search_filter_and_page(pool, clock):
    runs = Runs(pool, clock)
    ids = {}
    for name, template, params, data in (
        ("somchai", "quote", {"no": "Q-1"}, {"customer": {"name": "สมชาย ใจดี"}}),
        ("acme", "quote", {"no": "Q-2", "amount": Decimal("12345678901234567.89")}, {"customer": "ACME Co."}),
        ("pct", "invoice", {"no": "INV-100%"}, {"note": "a\u0000b"}),
    ):
        clock.advance(seconds=1)
        ids[name] = await runs.record(
            NewRun("render", template, USER, "succeeded", version=1, document=doc(params, data))
        )

    async def found(q=None, template=None):
        return [d.run_id for d in (await runs.list_documents(template, q, 10, None))[0]]

    assert await found() == [ids["pct"], ids["acme"], ids["somchai"]]
    assert await found("สมชาย") == [ids["somchai"]]  # Thai is stored as text, not \u escapes
    assert await found("  acme co  ") == [ids["acme"]]  # trimmed, case-insensitive
    assert await found("Q-") == [ids["acme"], ids["somchai"]]
    assert await found("100%") == [ids["pct"]]
    assert await found("%") == [ids["pct"]]  # the user's % is a character, not a wildcard
    assert await found("_") == []
    assert await found(template="invoice") == [ids["pct"]]
    first = await runs.list_documents(None, None, 2, None)
    assert [d.run_id for d in first[0]] == [ids["pct"], ids["acme"]]
    assert [d.run_id for d in (await runs.list_documents(None, None, 2, first[1]))[0]] == [ids["somchai"]]
    acme = (await runs.list_documents(None, "acme", 1, None))[0][0]
    assert acme.params == {"no": "Q-2", "amount": "12345678901234567.89"}  # every digit kept
    assert (acme.filename, acme.caller, acme.template_id, acme.version) == ("quote-v1.pdf", USER, "quote", 1)
    for bad in ("", "   ", "x" * 101):
        with pytest.raises(ValueError):
            await runs.list_documents(None, bad, 10, None)


@pytest.mark.db
async def test_storage_down_records_nothing(pool, clock):
    files = MemoryDocumentFiles()
    files.fail_put = True
    runs = Runs(pool, clock, files)
    with pytest.raises(DocumentStorageError):
        await runs.record(NewRun("render", "quote", USER, "succeeded", document=doc()))
    assert (await runs.list(None, None, 10, None))[0] == []


@pytest.mark.db
async def test_failed_insert_removes_the_file_it_wrote(pool, clock):
    files = MemoryDocumentFiles()
    runs = Runs(pool, clock, files)
    with pytest.raises(
        psycopg.errors.NotNullViolation
    ):  # NOT NULL filename: the transaction fails after the PUT
        await runs.record(NewRun("render", "quote", USER, "succeeded", document=doc(filename=None)))
    assert files.objects == {} and (await runs.list(None, None, 10, None))[0] == []


@pytest.mark.db
async def test_retention_deletes_documents_in_batches_after_commit(pool, clock, monkeypatch, caplog):
    monkeypatch.setattr(runs_module, "RETENTION_EVERY", 2)
    monkeypatch.setattr(runs_module, "RETENTION_BATCH", 2)
    files = MemoryDocumentFiles()
    runs = Runs(pool, clock, files)
    old = []
    for _ in range(3):
        clock.advance(seconds=1)
        old.append(await runs.record(NewRun("render", "a", USER, "succeeded", document=doc())))
    plain_old = await runs.record(NewRun("preview", "a", USER, "succeeded"))  # counter 4: round, no policy
    clock.advance(days=100)
    preview = await runs.retention(preview_days=90)
    assert (preview.would_delete, preview.would_delete_documents) == (4, 3)
    await runs.set_retention(90, "alice")

    await runs.record(NewRun("render", "a", USER, "succeeded"))
    await runs.record(NewRun("render", "a", USER, "succeeded"))  # counter 6: deletes the 2 oldest
    assert [await runs.get(r) is None for r in old] == [True, True, False]
    assert sorted(files.objects) == [old[2]]

    files.fail_delete = True
    await runs.record(NewRun("render", "a", USER, "succeeded"))
    await runs.record(NewRun("render", "a", USER, "succeeded"))  # counter 8: rows go, file stays, render ok
    assert await runs.get(old[2]) is None and await runs.get(plain_old) is None
    assert sorted(files.objects) == [old[2]] and "not deleted" in caplog.text
