"""Password hashing with stdlib scrypt, off the event loop (SPEC-auth.md assumption 2)."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import secrets
from concurrent.futures import ThreadPoolExecutor

N, R, P = 2**15, 8, 1
MAXMEM = 64 * 1024 * 1024  # these settings need 32 MiB; OpenSSL's default limit refuses them
DKLEN = 32
# each hash takes ~0.1 s CPU and 32 MiB: an own pool of 4 threads caps memory at 128 MiB, keeps the
# event loop free, and does not use up the default thread pool other blocking calls (boto3) rely on
_POOL = ThreadPoolExecutor(max_workers=4, thread_name_prefix="scrypt")


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _scrypt(password: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    return hashlib.scrypt(password.encode("utf-8"), salt=salt, n=n, r=r, p=p, maxmem=MAXMEM, dklen=DKLEN)


def _hash_sync(password: str) -> str:
    salt = secrets.token_bytes(16)
    return f"scrypt${N}${R}${P}${_b64(salt)}${_b64(_scrypt(password, salt, N, R, P))}"


def _verify_sync(password: str, stored: str) -> bool:
    try:
        kind, n, r, p, salt, digest = stored.split("$")
        if kind != "scrypt":
            return False
        actual = _scrypt(password, _unb64(salt), int(n), int(r), int(p))
        return hmac.compare_digest(actual, _unb64(digest))
    except (ValueError, TypeError):  # malformed stored hash: never a match, never a crash
        return False


async def hash_password(password: str) -> str:
    return await asyncio.get_running_loop().run_in_executor(_POOL, _hash_sync, password)


async def verify_password(password: str, stored: str) -> bool:
    return await asyncio.get_running_loop().run_in_executor(_POOL, _verify_sync, password, stored)


def needs_rehash(stored: str) -> bool:
    """True when a stored hash uses other settings than today's (rehash after a successful login)."""
    parts = stored.split("$")
    return len(parts) != 6 or parts[:4] != ["scrypt", str(N), str(R), str(P)]


# verify against this when the user does not exist, so both cases take the same time
DUMMY_HASH = _hash_sync(secrets.token_urlsafe(16))
