"""Content-addressed asset bytes: key `assets/<sha256>` (SPEC-template-store.md)."""

from __future__ import annotations

import asyncio
import hashlib
from typing import Any, Protocol

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from .errors import StoreError


class BlobStore(Protocol):
    async def put_if_absent(self, sha256: str, data: bytes, content_type: str) -> bool: ...
    async def get(self, sha256: str) -> bytes: ...
    async def exists(self, sha256: str) -> bool: ...


def _check(sha256: str, data: bytes) -> None:
    if hashlib.sha256(data).hexdigest() != sha256:
        raise StoreError("INPUT_INVALID", "asset bytes do not match their sha256")


def key(sha256: str) -> str:
    return f"assets/{sha256}"


class MemoryBlobStore:
    """For unit tests; counts real writes so tests can check put_if_absent."""

    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.writes = 0

    async def put_if_absent(self, sha256: str, data: bytes, content_type: str) -> bool:
        _check(sha256, data)
        if sha256 in self.objects:
            return False
        self.objects[sha256] = data
        self.writes += 1
        return True

    async def get(self, sha256: str) -> bytes:
        try:
            return self.objects[sha256]
        except KeyError:
            raise StoreError("NOT_FOUND", "asset bytes are missing from storage") from None

    async def exists(self, sha256: str) -> bool:
        return sha256 in self.objects


class S3BlobStore:
    """S3-compatible storage (RustFS by default); boto3 is blocking, so calls run in a thread."""

    def __init__(
        self, endpoint: str, bucket: str, access_key: str, secret_key: str, region: str = "us-east-1"
    ):
        self.bucket = bucket
        self._s3: Any = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region,
            config=Config(s3={"addressing_style": "path"}, retries={"max_attempts": 3, "mode": "standard"}),
        )

    async def ensure_bucket(self) -> None:
        try:
            await asyncio.to_thread(self._s3.head_bucket, Bucket=self.bucket)
        except ClientError:
            await asyncio.to_thread(self._s3.create_bucket, Bucket=self.bucket)

    async def exists(self, sha256: str) -> bool:
        try:
            await asyncio.to_thread(self._s3.head_object, Bucket=self.bucket, Key=key(sha256))
            return True
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
                return False
            raise

    async def put_if_absent(self, sha256: str, data: bytes, content_type: str) -> bool:
        _check(sha256, data)
        if await self.exists(sha256):
            return False
        # two uploads of the same bytes may both PUT; same key, same content, so the race is harmless
        await asyncio.to_thread(
            self._s3.put_object, Bucket=self.bucket, Key=key(sha256), Body=data, ContentType=content_type
        )
        return True

    async def get(self, sha256: str) -> bytes:
        try:
            resp = await asyncio.to_thread(self._s3.get_object, Bucket=self.bucket, Key=key(sha256))
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in ("404", "NoSuchKey"):
                raise StoreError("NOT_FOUND", "asset bytes are missing from storage") from None
            raise
        return await asyncio.to_thread(resp["Body"].read)
