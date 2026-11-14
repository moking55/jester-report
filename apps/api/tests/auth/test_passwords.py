import asyncio
import threading
import time

import pytest

from jester_api.auth import passwords
from jester_api.auth.passwords import DUMMY_HASH, N, hash_password, needs_rehash, verify_password


async def test_hash_and_verify_with_real_settings():
    stored = await hash_password("correct horse battery")
    assert stored.startswith(f"scrypt${N}$8$1$")
    assert await verify_password("correct horse battery", stored)
    assert not await verify_password("wrong password!!", stored)
    assert stored != await hash_password("correct horse battery")  # new salt each time
    assert not needs_rehash(stored)


@pytest.mark.parametrize(
    "stored", ["", "plain", "scrypt$1$2$3", "bcrypt$a$b$c$d$e", "scrypt$x$8$1$AA$AA", DUMMY_HASH]
)
async def test_bad_or_unknown_hashes_never_match(stored):
    assert not await verify_password("anything at all", stored)


def test_needs_rehash_for_old_settings():
    assert needs_rehash("scrypt$16384$8$1$salt$hash") and needs_rehash("legacy")


async def test_hashing_runs_off_the_event_loop_four_at_a_time(monkeypatch):
    active, peak, lock = 0, 0, threading.Lock()

    def slow_scrypt(password, salt, n, r, p):
        nonlocal active, peak
        with lock:
            active += 1
            peak = max(peak, active)
        time.sleep(0.1)
        with lock:
            active -= 1
        return b"x" * 32

    monkeypatch.setattr(passwords, "_scrypt", slow_scrypt)
    worst = 0.0

    async def ticker():
        nonlocal worst
        for _ in range(30):
            start = time.perf_counter()
            await asyncio.sleep(0.01)
            worst = max(worst, time.perf_counter() - start - 0.01)

    await asyncio.gather(ticker(), *(hash_password(f"pw-{i}") for i in range(8)))
    assert peak == 4
    assert worst < 0.05  # other coroutines kept running while 8 hashes were in flight
