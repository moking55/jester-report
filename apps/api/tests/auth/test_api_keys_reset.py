import asyncio

import pytest

from jester_api.auth import AuthError
from jester_api.auth.tokens import sha256_hex

from .conftest import PASSWORD

pytestmark = pytest.mark.db
IP = "203.0.113.5"


async def code_of(awaitable) -> str:
    with pytest.raises(AuthError) as e:
        await awaitable
    return e.value.code


async def test_api_key_secret_shown_once_and_never_stored(auth, alice, pool):
    key, secret = await auth.create_api_key("  erp-prod ", "alice")
    assert secret.startswith("jrk_") and key.prefix == secret[:8] and key.name == "erp-prod"
    listed = await auth.list_api_keys()
    assert [k.id for k in listed] == [key.id] and secret not in repr(listed)
    async with pool.connection() as conn:
        cur = await conn.execute("SELECT * FROM api_keys")
        assert secret not in repr(await cur.fetchall())
        cur = await conn.execute("SELECT secret_sha256 FROM api_keys")
        assert (await cur.fetchone())[0] == sha256_hex(secret)
    principal = await auth.authenticate(secret)
    assert (principal.kind, principal.name, principal.api_key_id) == ("api_key", "api-key:erp-prod", key.id)
    assert await code_of(auth.create_api_key("", "alice")) == "INPUT_INVALID"


async def test_revoked_key_stops_working(auth, alice):
    key, secret = await auth.create_api_key("ci", "alice")
    await auth.revoke_api_key(key.id)
    assert await code_of(auth.authenticate(secret)) == "UNAUTHORIZED"
    assert await auth.list_api_keys() == []
    assert await code_of(auth.revoke_api_key(key.id)) == "NOT_FOUND"


async def test_last_used_is_written_at_most_once_a_minute(auth, alice, clock, pool):
    key, secret = await auth.create_api_key("ci", "alice")

    async def last_used():
        async with pool.connection() as conn:
            cur = await conn.execute("SELECT last_used_at FROM api_keys WHERE id = %s", (key.id,))
            return (await cur.fetchone())[0]

    await auth.authenticate(secret)
    first = await last_used()
    assert first == clock.now
    clock.advance(seconds=20)
    await auth.authenticate(secret)
    clock.advance(seconds=20)
    await auth.authenticate(secret)
    assert await last_used() == first  # three uses inside a minute: one write
    clock.advance(seconds=30)
    await auth.authenticate(secret)
    assert await last_used() == clock.now


async def test_reset_password(auth, alice):
    other = await auth.login("alice", PASSWORD, IP)
    new = await auth.reset_password("Alice")
    assert len(new) == 24
    for token in (alice.token, other.token):
        assert await code_of(auth.authenticate(token)) == "UNAUTHORIZED"
    assert await code_of(auth.login("alice", PASSWORD, IP)) == "UNAUTHORIZED"
    assert (await auth.login("alice", new, IP)).user.username == "alice"
    assert await code_of(auth.reset_password("nobody")) == "NOT_FOUND"


def test_reset_password_command(db_url, monkeypatch, capsys):
    from psycopg_pool import AsyncConnectionPool

    from jester_api.auth import Auth
    from jester_api.auth.__main__ import main
    from jester_api.db import migrate

    async def make_user():
        async with AsyncConnectionPool(db_url, min_size=1, max_size=1, open=False) as pool:
            async with pool.connection() as conn:
                await migrate(conn)
            await Auth(pool).create_user("bob", PASSWORD)

    async def can_login(password):
        async with AsyncConnectionPool(db_url, min_size=1, max_size=1, open=False) as pool:
            return (await Auth(pool).login("bob", password, IP)).user.username

    asyncio.run(make_user())
    monkeypatch.setenv("DATABASE_URL", db_url)
    assert main(["reset-password", "bob"]) == 0
    new = capsys.readouterr().out.split("New password for bob: ", 1)[1].split()[0]
    assert asyncio.run(can_login(new)) == "bob"
    assert main(["reset-password", "nobody"]) == 1
    monkeypatch.delenv("DATABASE_URL")
    assert main(["reset-password", "bob"]) == 2
