"""Object storage in and out as a tar stream, for infra/backup.sh and restore.sh (SPEC-infra.md).

    python -m jester_api.ops.blobs export > blobs.tar     # every asset in `blobs`, every PDF in `documents`
    python -m jester_api.ops.blobs import < blobs.tar     # creates the bucket if needed
    python -m jester_api.ops.blobs sweep-documents        # deletes document PDFs that have no row

Asset entries are named by sha256 and carry their content type in a pax header; document entries are
named `documents/<run_id>`. Export fails when a listed object is missing, so a backup is never silently
incomplete (a document deleted by retention while the export runs is skipped); import checks every name
and every asset's sha256 before writing.
"""

from __future__ import annotations

import argparse
import asyncio
import io
import os
import re
import sys
import tarfile
from datetime import UTC, datetime, timedelta
from typing import Any, BinaryIO

from psycopg import AsyncConnection

from ..render_service.document_files import PREFIX, RUN_ID, DocumentFiles, S3DocumentFiles
from ..template_store.blobs import BlobStore, S3BlobStore
from ..template_store.errors import StoreError

SHA256 = re.compile(r"^[0-9a-f]{64}$")
CONTENT_TYPE = "jester.content_type"
SWEEP_AFTER = timedelta(hours=1)  # younger files may belong to a render that is still being recorded


class BlobsError(Exception):
    pass


def _add(tar: tarfile.TarFile, name: str, data: bytes, content_type: str) -> None:
    info = tarfile.TarInfo(name)
    info.size, info.mode, info.pax_headers = len(data), 0o600, {CONTENT_TYPE: content_type}
    tar.addfile(info, io.BytesIO(data))


async def export(
    conn: AsyncConnection, blobs: BlobStore, out: BinaryIO, documents: DocumentFiles | None = None
) -> int:
    """Write every blob in `blobs`, then every document PDF in `documents`; returns the entry count."""
    cur = await conn.execute("SELECT sha256, content_type FROM blobs ORDER BY sha256")
    rows = await cur.fetchall()
    run_ids: list[str] = []
    if documents is not None:
        cur = await conn.execute("SELECT run_id FROM documents ORDER BY run_id")
        run_ids = [row[0] for row in await cur.fetchall()]
    missing: list[str] = []
    count = 0
    with tarfile.open(fileobj=out, mode="w|", format=tarfile.PAX_FORMAT) as tar:
        for sha256, content_type in rows:
            try:
                data = await blobs.get(sha256)
            except StoreError:
                missing.append(sha256)
                continue
            _add(tar, sha256, data, content_type)
            count += 1
        for run_id in run_ids:
            try:
                data = await documents.get(run_id)  # type: ignore[union-attr]
            except StoreError:
                cur = await conn.execute("SELECT 1 FROM documents WHERE run_id = %s", (run_id,))
                if await cur.fetchone() is not None:  # still listed: the backup would be incomplete
                    missing.append(PREFIX + run_id)
                continue  # deleted by retention while we were exporting
            _add(tar, PREFIX + run_id, data, "application/pdf")
            count += 1
    if missing:
        raise BlobsError(f"{len(missing)} object(s) are missing from storage: {', '.join(missing[:5])}")
    return count


async def import_(blobs: BlobStore, inp: BinaryIO, documents: DocumentFiles | None = None) -> int:
    """Put every entry back; returns how many entries were read (existing assets are left as they are)."""
    count = 0
    try:
        with tarfile.open(fileobj=inp, mode="r|") as tar:
            for member in tar:
                run_id = member.name[len(PREFIX) :] if member.name.startswith(PREFIX) else ""
                is_document = RUN_ID.match(run_id) is not None
                if not member.isfile() or not (SHA256.match(member.name) or is_document):
                    raise BlobsError(f"not an asset entry: {member.name[:80]!r}")
                content_type = member.pax_headers.get(CONTENT_TYPE, "application/octet-stream")
                extracted = tar.extractfile(member)
                data = extracted.read() if extracted else b""
                if is_document:
                    if documents is None:
                        raise BlobsError("this tar has documents but no document store was given")
                    await documents.put(run_id, data)
                    count += 1
                    continue
                try:
                    await blobs.put_if_absent(member.name, data, content_type)
                except StoreError as exc:  # the bytes do not hash to the entry's name
                    raise BlobsError(f"{member.name}: {exc.message}") from None
                count += 1
    except tarfile.TarError as exc:
        raise BlobsError(f"not a valid blobs.tar: {exc}") from None
    return count


async def sweep_documents(
    conn: AsyncConnection, documents: DocumentFiles, now: datetime | None = None
) -> int:
    """Delete document PDFs older than SWEEP_AFTER that have no row (a failed render, a failed delete)."""
    # shortcut: lists the whole documents/ prefix each run; fine for hundreds of thousands of files
    candidates = await documents.list_older_than((now or datetime.now(UTC)) - SWEEP_AFTER)
    if not candidates:
        return 0
    cur = await conn.execute("SELECT run_id FROM documents WHERE run_id = ANY(%s)", (candidates,))
    kept = {row[0] for row in await cur.fetchall()}
    orphans = [r for r in candidates if r not in kept]
    await documents.delete(orphans)
    return len(orphans)


def _store(env: dict[str, str]) -> S3BlobStore:
    return S3BlobStore(
        env["JESTER_S3_ENDPOINT"],
        env["JESTER_S3_BUCKET"],
        env["JESTER_S3_ACCESS_KEY"],
        env["JESTER_S3_SECRET_KEY"],
    )


async def _run(command: str, env: dict[str, str]) -> int:
    blobs: Any = _store(env)
    documents = S3DocumentFiles(blobs.client, blobs.bucket)
    if command == "import":
        await blobs.ensure_bucket()
        return await import_(blobs, sys.stdin.buffer, documents)
    async with await AsyncConnection.connect(env["DATABASE_URL"], autocommit=True) as conn:
        if command == "sweep-documents":
            return await sweep_documents(conn, documents)
        return await export(conn, blobs, sys.stdout.buffer, documents)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m jester_api.ops.blobs")
    parser.add_argument("command", choices=["export", "import", "sweep-documents"])
    args = parser.parse_args(argv)
    needed = ["JESTER_S3_ENDPOINT", "JESTER_S3_BUCKET", "JESTER_S3_ACCESS_KEY", "JESTER_S3_SECRET_KEY"]
    if args.command != "import":
        needed.append("DATABASE_URL")
    missing = [name for name in needed if not os.environ.get(name)]
    if missing:
        print(f"not set: {', '.join(missing)}", file=sys.stderr)
        return 2
    if sys.platform == "win32":  # psycopg's async connections need a selector loop
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    try:
        count = asyncio.run(_run(args.command, dict(os.environ)))
    except BlobsError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    what = "orphan document file(s) deleted" if args.command == "sweep-documents" else "object(s)"
    print(f"{args.command}: {count} {what}", file=sys.stderr)  # stdout carries the tar
    return 0


if __name__ == "__main__":
    sys.exit(main())
