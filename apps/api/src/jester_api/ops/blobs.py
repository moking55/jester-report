"""Asset bytes in and out of object storage as a tar stream, for infra/backup.sh and restore.sh.

    python -m jester_api.ops.blobs export > blobs.tar     # every sha256 listed in the `blobs` table
    python -m jester_api.ops.blobs import < blobs.tar     # creates the bucket if needed

Entries are named by sha256 and carry their content type in a pax header. Export fails when a listed
object is missing, so a backup is never silently incomplete; import checks every sha256 before writing.
"""

from __future__ import annotations

import argparse
import asyncio
import io
import os
import re
import sys
import tarfile
from typing import Any, BinaryIO

from psycopg import AsyncConnection

from ..template_store.blobs import BlobStore, S3BlobStore
from ..template_store.errors import StoreError

SHA256 = re.compile(r"^[0-9a-f]{64}$")
CONTENT_TYPE = "jester.content_type"


class BlobsError(Exception):
    pass


async def export(conn: AsyncConnection, blobs: BlobStore, out: BinaryIO) -> int:
    """Write every blob listed in the `blobs` table; a missing object fails the backup."""
    cur = await conn.execute("SELECT sha256, content_type FROM blobs ORDER BY sha256")
    rows = await cur.fetchall()
    missing: list[str] = []
    with tarfile.open(fileobj=out, mode="w|", format=tarfile.PAX_FORMAT) as tar:
        for sha256, content_type in rows:
            try:
                data = await blobs.get(sha256)
            except StoreError:
                missing.append(sha256)
                continue
            info = tarfile.TarInfo(sha256)
            info.size, info.mode, info.pax_headers = len(data), 0o600, {CONTENT_TYPE: content_type}
            tar.addfile(info, io.BytesIO(data))
    if missing:
        raise BlobsError(f"{len(missing)} asset(s) are missing from storage: {', '.join(missing[:5])}")
    return len(rows)


async def import_(blobs: BlobStore, inp: BinaryIO) -> int:
    """Put every entry back; returns how many entries were read (existing ones are left as they are)."""
    count = 0
    try:
        with tarfile.open(fileobj=inp, mode="r|") as tar:
            for member in tar:
                if not member.isfile() or not SHA256.match(member.name):
                    raise BlobsError(f"not an asset entry: {member.name[:80]!r}")
                content_type = member.pax_headers.get(CONTENT_TYPE, "application/octet-stream")
                extracted = tar.extractfile(member)
                data = extracted.read() if extracted else b""
                try:
                    await blobs.put_if_absent(member.name, data, content_type)
                except StoreError as exc:  # the bytes do not hash to the entry's name
                    raise BlobsError(f"{member.name}: {exc.message}") from None
                count += 1
    except tarfile.TarError as exc:
        raise BlobsError(f"not a valid blobs.tar: {exc}") from None
    return count


def _store(env: dict[str, str]) -> S3BlobStore:
    return S3BlobStore(
        env["JESTER_S3_ENDPOINT"],
        env["JESTER_S3_BUCKET"],
        env["JESTER_S3_ACCESS_KEY"],
        env["JESTER_S3_SECRET_KEY"],
    )


async def _run(command: str, env: dict[str, str]) -> int:
    blobs: Any = _store(env)
    if command == "import":
        await blobs.ensure_bucket()
        return await import_(blobs, sys.stdin.buffer)
    async with await AsyncConnection.connect(env["DATABASE_URL"]) as conn:
        return await export(conn, blobs, sys.stdout.buffer)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m jester_api.ops.blobs")
    parser.add_argument("command", choices=["export", "import"])
    args = parser.parse_args(argv)
    needed = ["JESTER_S3_ENDPOINT", "JESTER_S3_BUCKET", "JESTER_S3_ACCESS_KEY", "JESTER_S3_SECRET_KEY"]
    if args.command == "export":
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
    print(f"{args.command}: {count} asset(s)", file=sys.stderr)  # stdout carries the tar
    return 0


if __name__ == "__main__":
    sys.exit(main())
