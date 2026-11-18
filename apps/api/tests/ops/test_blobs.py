"""Backup of asset bytes: blobs.tar out of storage and back (SPEC-infra.md)."""

import hashlib
import io
import tarfile

import pytest

from jester_api.ops.blobs import BlobsError, export, import_, main, sweep_documents
from jester_api.render_service.document_files import MemoryDocumentFiles
from jester_api.template_store import MemoryBlobStore

PNG = b"\x89PNG\r\n\x1a\n" + b"x" * 20
SVG = b"<svg xmlns='http://www.w3.org/2000/svg'/>"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def tar_of(entries: list[tuple[str, bytes]], kind: bytes = tarfile.REGTYPE) -> io.BytesIO:
    out = io.BytesIO()
    with tarfile.open(fileobj=out, mode="w", format=tarfile.PAX_FORMAT) as tar:
        for name, data in entries:
            info = tarfile.TarInfo(name)
            info.size, info.type = len(data), kind
            tar.addfile(info, io.BytesIO(data))
    out.seek(0)
    return out


async def code_of(awaitable) -> str:
    with pytest.raises(BlobsError) as e:
        await awaitable
    return str(e.value)


async def test_import_puts_bytes_back_and_keeps_existing_ones():
    blobs = MemoryBlobStore()
    await blobs.put_if_absent(sha(SVG), SVG, "image/svg+xml")
    assert await import_(blobs, tar_of([(sha(PNG), PNG), (sha(SVG), SVG)])) == 2
    assert await blobs.get(sha(PNG)) == PNG and blobs.writes == 2


@pytest.mark.parametrize("name", ["../evil", "abc", "A" * 64, "0" * 63])
async def test_entries_must_be_named_by_sha256(name):
    assert "not an asset entry" in await code_of(import_(MemoryBlobStore(), tar_of([(name, PNG)])))


async def test_bytes_must_hash_to_their_name():
    message = await code_of(import_(MemoryBlobStore(), tar_of([(sha(SVG), PNG)])))
    assert "do not match" in message


async def test_symlinks_and_garbage_are_refused():
    assert "not an asset entry" in await code_of(
        import_(MemoryBlobStore(), tar_of([(sha(PNG), b"")], tarfile.SYMTYPE))
    )
    assert "not a valid blobs.tar" in await code_of(import_(MemoryBlobStore(), io.BytesIO(b"junk" * 200)))


def test_cli_says_what_is_missing(capsys, monkeypatch):
    for name in (
        "JESTER_S3_ENDPOINT",
        "JESTER_S3_BUCKET",
        "JESTER_S3_ACCESS_KEY",
        "JESTER_S3_SECRET_KEY",
        "DATABASE_URL",
    ):
        monkeypatch.delenv(name, raising=False)
    assert main(["export"]) == 2
    assert "DATABASE_URL" in capsys.readouterr().err


@pytest.mark.db
async def test_export_round_trip_and_missing_objects(db_url):
    from psycopg import AsyncConnection

    from jester_api.db import migrate

    async with await AsyncConnection.connect(db_url, autocommit=True) as conn:
        await migrate(conn)
        for data, content_type in ((PNG, "image/png"), (SVG, "image/svg+xml")):
            await conn.execute(
                "INSERT INTO blobs (sha256, content_type, size) VALUES (%s, %s, %s)",
                (sha(data), content_type, len(data)),
            )
        source = MemoryBlobStore()
        await source.put_if_absent(sha(PNG), PNG, "image/png")
        await source.put_if_absent(sha(SVG), SVG, "image/svg+xml")
        out = io.BytesIO()
        assert await export(conn, source, out) == 2
        out.seek(0)
        restored = MemoryBlobStore()
        assert await import_(restored, out) == 2
        assert restored.objects == source.objects

        del source.objects[sha(SVG)]
        assert sha(SVG) in await code_of(export(conn, source, io.BytesIO()))


# ---- v1.5: document PDFs ------------------------------------------------------------------------------
RUN_A = "0193a1b2c3d4" + "a" * 10
RUN_B = "0193a1b2c3d4" + "b" * 10


async def test_import_puts_documents_back():
    files = MemoryDocumentFiles()
    count = await import_(
        MemoryBlobStore(), tar_of([(sha(PNG), PNG), (f"documents/{RUN_A}", b"%PDF-a")]), files
    )
    assert count == 2 and files.objects[RUN_A][0] == b"%PDF-a"
    for bad in ("documents/../x", "documents/" + RUN_A.upper(), "documents/"):
        assert "not an asset entry" in await code_of(import_(MemoryBlobStore(), tar_of([(bad, b"x")]), files))
    assert "no document store" in await code_of(
        import_(MemoryBlobStore(), tar_of([(f"documents/{RUN_A}", b"x")]))
    )


async def _documents_db(db_url):
    from psycopg import AsyncConnection

    from jester_api.db import migrate

    conn = await AsyncConnection.connect(db_url, autocommit=True)
    await migrate(conn)
    for run_id in (RUN_A, RUN_B):
        await conn.execute(
            "INSERT INTO runs (id, kind, template_id, caller_type, caller_id, status, created_at) "
            "VALUES (%s, 'render', 'q', 'user', 'u', 'succeeded', now())",
            (run_id,),
        )
        await conn.execute(
            "INSERT INTO documents (run_id, template_id, filename, params, data, pdf_size, pdf_sha256) "
            "VALUES (%s, 'q', 'q.pdf', '{}', '{}', 1, 'x')",
            (run_id,),
        )
    return conn


@pytest.mark.db
async def test_export_includes_documents_and_skips_ones_retention_removed(db_url):
    conn = await _documents_db(db_url)
    try:
        files = MemoryDocumentFiles()
        await files.put(RUN_A, b"%PDF-a")
        await files.put(RUN_B, b"%PDF-b")
        out = io.BytesIO()
        assert await export(conn, MemoryBlobStore(), out, files) == 2
        out.seek(0)
        assert sorted(tarfile.open(fileobj=out).getnames()) == [f"documents/{RUN_A}", f"documents/{RUN_B}"]

        del files.objects[RUN_B]  # the row is still there: the backup would lack a PDF
        assert f"documents/{RUN_B}" in await code_of(export(conn, MemoryBlobStore(), io.BytesIO(), files))

        class RetentionMidway(MemoryDocumentFiles):  # the row goes while the export runs
            async def get(self, run_id):
                await conn.execute("DELETE FROM runs WHERE id = %s", (run_id,))
                return await super().get(run_id)

        racing = RetentionMidway()
        await racing.put(RUN_A, b"%PDF-a")
        assert await export(conn, MemoryBlobStore(), io.BytesIO(), racing) == 1
    finally:
        await conn.close()


@pytest.mark.db
async def test_sweep_deletes_old_files_without_a_row_only(db_url):
    from datetime import UTC, datetime, timedelta

    conn = await _documents_db(db_url)
    try:
        now = datetime(2026, 11, 19, 12, 0, tzinfo=UTC)
        orphan_old, orphan_new = "0193a1b2c3d4" + "c" * 10, "0193a1b2c3d4" + "d" * 10
        files = MemoryDocumentFiles()
        await files.put(RUN_A, b"a", modified=now - timedelta(days=1))  # has a row
        await files.put(orphan_old, b"c", modified=now - timedelta(hours=2))
        await files.put(orphan_new, b"d", modified=now - timedelta(minutes=10))  # may be mid-render
        assert await sweep_documents(conn, files, now) == 1
        assert sorted(files.objects) == sorted([RUN_A, orphan_new])
        assert await sweep_documents(conn, files, now) == 0
    finally:
        await conn.close()
