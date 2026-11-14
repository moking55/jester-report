import hashlib
import os
import uuid

import pytest

from jester_api.template_store.blobs import MemoryBlobStore, S3BlobStore
from jester_api.template_store.errors import StoreError

DATA = b"\x89PNG\r\n\x1a\n fake but stable"
SHA = hashlib.sha256(DATA).hexdigest()


async def _contract(store) -> None:
    assert not await store.exists(SHA)
    assert await store.put_if_absent(SHA, DATA, "image/png") is True
    assert await store.put_if_absent(SHA, DATA, "image/png") is False  # same bytes: no second write
    assert await store.exists(SHA) and await store.get(SHA) == DATA
    with pytest.raises(StoreError) as wrong:
        await store.put_if_absent("0" * 64, DATA, "image/png")
    assert wrong.value.code == "INPUT_INVALID"
    with pytest.raises(StoreError) as missing:
        await store.get("f" * 64)
    assert missing.value.code == "NOT_FOUND"


async def test_memory_store():
    store = MemoryBlobStore()
    await _contract(store)
    assert store.writes == 1


@pytest.mark.storage
async def test_s3_store_against_real_storage():
    store = S3BlobStore(
        os.environ["JESTER_TEST_S3_ENDPOINT"],
        f"jester-test-{uuid.uuid4().hex[:12]}",
        os.environ.get("JESTER_TEST_S3_ACCESS_KEY", "jester-dev"),
        os.environ.get("JESTER_TEST_S3_SECRET_KEY", "jester-dev-secret"),
    )
    await store.ensure_bucket()
    await _contract(store)
