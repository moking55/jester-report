from datetime import timedelta

import pytest

from jester_api.auth import AuthError

from .conftest import PASSWORD

pytestmark = pytest.mark.db
IP, OTHER_IP = "203.0.113.5", "198.51.100.7"


async def code_of(awaitable) -> str:
    with pytest.raises(AuthError) as e:
        await awaitable
    return e.value.code


async def expires_in_db(pool, token) -> object:
    from jester_api.auth.tokens import sha256_hex

    async with pool.connection() as conn:
        cur = await conn.execute(
            "SELECT expires_at FROM sessions WHERE token_sha256 = %s", (sha256_hex(token),)
        )
        return (await cur.fetchone())[0]


async def test_login_logout(auth, alice):
    session = await auth.login("ALICE", PASSWORD, IP)  # names ignore case
    principal = await auth.authenticate(session.token)
    assert (principal.kind, principal.name) == ("user", "alice")
    assert principal.user.last_login_at is not None
    await auth.logout(session.token)
    assert await code_of(auth.authenticate(session.token)) == "UNAUTHORIZED"


async def test_unknown_user_and_wrong_password_look_the_same(auth, alice):
    with pytest.raises(AuthError) as no_user:
        await auth.login("nobody", PASSWORD, IP)
    with pytest.raises(AuthError) as wrong:
        await auth.login("alice", "wrong password 123", IP)
    assert (no_user.value.code, no_user.value.message) == (wrong.value.code, wrong.value.message)
    assert PASSWORD not in wrong.value.message


async def test_rate_limit_is_per_username_and_ip(auth, alice, clock):
    for _ in range(5):
        assert await code_of(auth.login("alice", "wrong password 123", IP)) == "UNAUTHORIZED"
    assert await code_of(auth.login("alice", PASSWORD, IP)) == "RATE_LIMITED"  # even the right password
    assert (await auth.login("alice", PASSWORD, OTHER_IP)).user.username == "alice"  # owner elsewhere is fine
    clock.advance(minutes=15, seconds=1)
    assert (await auth.login("alice", PASSWORD, IP)).user.username == "alice"


async def test_session_expires_renews_and_has_a_ceiling(auth, alice, clock, pool):
    token, login_at = alice.token, clock.now
    assert await expires_in_db(pool, token) == login_at + timedelta(hours=12)

    clock.advance(hours=4)  # 8 h left: no renewal, no write
    await auth.authenticate(token)
    assert await expires_in_db(pool, token) == login_at + timedelta(hours=12)

    clock.advance(hours=3)  # 5 h left: renewed to a full 12 h from now
    await auth.authenticate(token)
    assert await expires_in_db(pool, token) == clock.now + timedelta(hours=12)

    while True:  # keep using it every 7 h: it stays valid until 7 days after login, never longer
        clock.advance(hours=7)
        if clock.now >= login_at + timedelta(days=7):
            break
        await auth.authenticate(token)
    assert await expires_in_db(pool, token) == login_at + timedelta(days=7)
    assert await code_of(auth.authenticate(token)) == "UNAUTHORIZED"


async def test_idle_session_expires(auth, alice, clock):
    clock.advance(hours=12, seconds=1)
    assert await code_of(auth.authenticate(alice.token)) == "UNAUTHORIZED"


async def test_bad_bearer_values(auth, alice):
    for bearer in ("", "Bearer x", "jrs_not-a-real-token", "jrk_not-a-real-key", alice.token[:-1]):
        assert await code_of(auth.authenticate(bearer)) == "UNAUTHORIZED"


async def test_change_password_keeps_this_session_only(auth, alice):
    other = await auth.login("alice", PASSWORD, IP)
    new = "a brand new passphrase"
    assert await code_of(auth.change_password(alice.token, "wrong current pw", new, IP)) == "UNAUTHORIZED"
    assert await code_of(auth.change_password(alice.token, PASSWORD, "short", IP)) == "INPUT_INVALID"
    await auth.change_password(alice.token, PASSWORD, new, IP)
    assert (await auth.authenticate(alice.token)).name == "alice"  # the session used for the change
    assert await code_of(auth.authenticate(other.token)) == "UNAUTHORIZED"
    assert await code_of(auth.login("alice", PASSWORD, IP)) == "UNAUTHORIZED"
    assert (await auth.login("alice", new, IP)).user.username == "alice"
