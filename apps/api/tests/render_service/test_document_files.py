import hashlib
import os
import uuid
from datetime import UTC, datetime, timedelta

import pytest

from jester_api.render_service.document_files import MemoryDocumentFiles, S3DocumentFiles, document_key
from jester_api.template_store import S3BlobStore, StoreError

RUN_A = "0193a1b2c3d4" + "a" * 10
RUN_B = "0193a1b2c3d4" + "b" * 10


def test_key_accepts_run_ids_only():
    assert document_key(RUN_A) == f"documents/{RUN_A}"
    for bad in ("", "../assets/x", RUN_A.upper(), RUN_A + "0"):
        with pytest.raises(StoreError):
            document_key(bad)


async def test_memory_put_get_delete_and_list():
    files = MemoryDocumentFiles()
    old = datetime(2026, 11, 1, tzinfo=UTC)
    await files.put(RUN_A, b"%PDF-a", modified=old)
    await files.put(RUN_B, b"%PDF-b", modified=old + timedelta(days=2))
    assert await files.get(RUN_A) == b"%PDF-a"
    assert await files.list_older_than(old + timedelta(days=1)) == [RUN_A]
    await files.delete([RUN_A, "0" * 22])  # a key that is not there is fine
    with pytest.raises(StoreError) as caught:
        await files.get(RUN_A)
    assert caught.value.code == "NOT_FOUND"


@pytest.mark.storage
async def test_s3_put_get_delete_and_list():
    blobs = S3BlobStore(
        os.environ["JESTER_TEST_S3_ENDPOINT"],
        f"jester-docs-{uuid.uuid4().hex[:10]}",
        os.environ.get("JESTER_TEST_S3_ACCESS_KEY", "jester-dev"),
        os.environ.get("JESTER_TEST_S3_SECRET_KEY", "jester-dev-secret"),
    )
    await blobs.ensure_bucket()
    files = S3DocumentFiles(blobs.client, blobs.bucket)
    await files.put(RUN_A, b"%PDF-a")
    await files.put(RUN_B, b"%PDF-b")
    await blobs.put_if_absent(
        hashlib.sha256(b"x").hexdigest(), b"x", "text/plain"
    )  # not listed: other prefix
    assert await files.get(RUN_A) == b"%PDF-a"
    later = datetime.now(UTC) + timedelta(minutes=5)
    assert await files.list_older_than(later) == [RUN_A, RUN_B]
    assert await files.list_older_than(datetime.now(UTC) - timedelta(hours=1)) == []
    await files.delete([RUN_A, "0" * 22])  # DeleteObjects with a missing key does not fail
    with pytest.raises(StoreError):
        await files.get(RUN_A)
    assert await files.list_older_than(later) == [RUN_B]
