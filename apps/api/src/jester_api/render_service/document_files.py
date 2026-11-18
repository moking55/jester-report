"""PDF bytes of stored documents: key `documents/<run_id>` (SPEC-render-service.md v1.5).

Unlike asset blobs these are deleted (retention, orphan sweep), so they live under their own prefix and class.
"""

from __future__ import annotations

import asyncio
import re
from collections.abc import Iterable
from datetime import datetime
from typing import Any, Protocol

from botocore.exceptions import ClientError

from ..template_store.errors import StoreError

PREFIX = "documents/"
RUN_ID = re.compile(r"^[0-9a-f]{22}$")
_DELETE_BATCH = 1000  # S3 DeleteObjects limit


class DocumentFiles(Protocol):
    async def put(self, run_id: str, pdf: bytes) -> None: ...
    async def get(self, run_id: str) -> bytes: ...
    async def delete(self, run_ids: Iterable[str]) -> None: ...
    async def list_older_than(self, cutoff: datetime) -> list[str]: ...


def document_key(run_id: str) -> str:
    if not RUN_ID.match(run_id):
        raise StoreError("INPUT_INVALID", "not a run id")
    return PREFIX + run_id


def _missing(exc: ClientError) -> bool:
    return exc.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound")


class MemoryDocumentFiles:
    """For unit tests; `fail_put` / `fail_delete` simulate storage being down."""

    def __init__(self) -> None:
        self.objects: dict[str, tuple[bytes, datetime | None]] = {}
        self.fail_put = False
        self.fail_delete = False

    async def put(self, run_id: str, pdf: bytes, *, modified: datetime | None = None) -> None:
        document_key(run_id)
        if self.fail_put:
            raise OSError("storage is down")
        self.objects[run_id] = (pdf, modified)

    async def get(self, run_id: str) -> bytes:
        document_key(run_id)
        try:
            return self.objects[run_id][0]
        except KeyError:
            raise StoreError("NOT_FOUND", "document bytes are missing from storage") from None

    async def delete(self, run_ids: Iterable[str]) -> None:
        if self.fail_delete:
            raise OSError("storage is down")
        for run_id in run_ids:
            self.objects.pop(run_id, None)

    async def list_older_than(self, cutoff: datetime) -> list[str]:
        return sorted(
            r for r, (_, modified) in self.objects.items() if modified is not None and modified < cutoff
        )


class S3DocumentFiles:
    """Same bucket and client as the asset store; boto3 is blocking, so calls run in a thread."""

    def __init__(self, s3: Any, bucket: str) -> None:
        self._s3, self.bucket = s3, bucket

    async def put(self, run_id: str, pdf: bytes) -> None:
        await asyncio.to_thread(
            self._s3.put_object,
            Bucket=self.bucket,
            Key=document_key(run_id),
            Body=pdf,
            ContentType="application/pdf",
        )

    async def get(self, run_id: str) -> bytes:
        try:
            resp = await asyncio.to_thread(self._s3.get_object, Bucket=self.bucket, Key=document_key(run_id))
        except ClientError as exc:
            if _missing(exc):
                raise StoreError("NOT_FOUND", "document bytes are missing from storage") from None
            raise
        return await asyncio.to_thread(resp["Body"].read)

    async def delete(self, run_ids: Iterable[str]) -> None:
        keys = [document_key(r) for r in run_ids]
        for start in range(0, len(keys), _DELETE_BATCH):
            batch = keys[start : start + _DELETE_BATCH]
            resp = await asyncio.to_thread(
                self._s3.delete_objects,
                Bucket=self.bucket,
                Delete={"Objects": [{"Key": k} for k in batch], "Quiet": True},
            )
            errors = [e for e in resp.get("Errors", []) if e.get("Code") != "NoSuchKey"]
            if errors:
                raise OSError(f"{len(errors)} document(s) could not be deleted: {errors[0].get('Message')}")

    async def list_older_than(self, cutoff: datetime) -> list[str]:
        def scan() -> list[str]:
            out: list[str] = []
            pages = self._s3.get_paginator("list_objects_v2").paginate(Bucket=self.bucket, Prefix=PREFIX)
            for page in pages:
                for obj in page.get("Contents", []):
                    run_id = obj["Key"][len(PREFIX) :]
                    if RUN_ID.match(run_id) and obj["LastModified"] < cutoff:
                        out.append(run_id)
            return sorted(out)

        return await asyncio.to_thread(scan)
