"""v1.1 B1 + B2: API key expiry, allowed templates and per-key rate limit (SPEC-auth.md "v1.1")."""

import asyncio
from datetime import timedelta

import pytest

from jester_api.auth import AuthError, Principal, Quota

pytestmark = pytest.mark.db


async def code_of(awaitable) -> str:
    with pytest.raises(AuthError) as e:
        await awaitable
    return e.value.code


async def test_expiry_is_checked_to_the_second(auth, clock):
    key, secret = await auth.create_api_key("erp", "alice", expires_at=clock.now + timedelta(days=1))
    assert key.expires_at == clock.now + timedelta(days=1)
    clock.advance(days=1, seconds=-1)
    assert (await auth.authenticate(secret)).kind == "api_key"
    clock.advance(seconds=1)
    with pytest.raises(AuthError) as expired:
        await auth.authenticate(secret)
    revoked_key, revoked = await auth.create_api_key("old", "alice")
    await auth.revoke_api_key(revoked_key.id)
    with pytest.raises(AuthError) as gone:
        await auth.authenticate(revoked)
    assert (expired.value.code, expired.value.message) == (gone.value.code, gone.value.message)


async def test_key_settings_are_checked_when_created(auth, clock):
    past, far = clock.now - timedelta(seconds=1), clock.now + timedelta(days=5 * 365 + 1)
    assert await code_of(auth.create_api_key("a", "alice", expires_at=past)) == "INPUT_INVALID"
    assert await code_of(auth.create_api_key("a", "alice", expires_at=clock.now)) == "INPUT_INVALID"
    assert await code_of(auth.create_api_key("a", "alice", expires_at=far)) == "INPUT_INVALID"
    assert await code_of(auth.create_api_key("a", "alice", templates=[])) == "INPUT_INVALID"
    many = [f"t{i:03d}" for i in range(101)]
    assert await code_of(auth.create_api_key("a", "alice", templates=many)) == "INPUT_INVALID"
    assert await code_of(auth.create_api_key("a", "alice", templates=["Bad_ID"])) == "INPUT_INVALID"
    for limit in (0, 10001):
        assert (
            await code_of(auth.create_api_key("a", "alice", rate_limit_per_minute=limit)) == "INPUT_INVALID"
        )


async def test_templates_and_limit_reach_the_principal_and_the_list(auth):
    key, secret = await auth.create_api_key(
        "erp", "alice", templates=["quote", "invoice", "quote"], rate_limit_per_minute=30
    )
    assert key.templates == ("quote", "invoice")
    principal = await auth.authenticate(secret)
    assert (principal.templates, principal.rate_limit_per_minute) == (frozenset({"quote", "invoice"}), 30)
    listed = (await auth.list_api_keys())[0]
    assert (listed.templates, listed.rate_limit_per_minute, listed.expires_at) == (
        ("quote", "invoice"),
        30,
        None,
    )


async def test_keys_without_settings_work_as_before(auth):
    _, secret = await auth.create_api_key("plain", "alice")
    principal = await auth.authenticate(secret)
    assert (principal.templates, principal.rate_limit_per_minute) == (None, None)
    assert await auth.consume_render_quota(principal) == Quota(True, 0)


async def test_rate_limit_counts_per_minute(auth, clock):
    clock.now = clock.now.replace(second=15)
    _, secret = await auth.create_api_key("erp", "alice", rate_limit_per_minute=3)
    principal = await auth.authenticate(secret)
    assert [await auth.consume_render_quota(principal) for _ in range(3)] == [Quota(True, 0)] * 3
    assert await auth.consume_render_quota(principal) == Quota(False, 45)
    clock.advance(seconds=45)  # the next minute
    assert await auth.consume_render_quota(principal) == Quota(True, 0)


async def test_rate_limit_holds_under_concurrency(auth):
    _, secret = await auth.create_api_key("erp", "alice", rate_limit_per_minute=5)
    principal = await auth.authenticate(secret)
    results = await asyncio.gather(*(auth.consume_render_quota(principal) for _ in range(10)))
    assert sum(q.allowed for q in results) == 5


async def test_sessions_never_touch_the_usage_table(auth, pool):
    user = Principal("user", "alice")
    assert await auth.consume_render_quota(user) == Quota(True, 0)
    async with pool.connection() as conn:
        assert (await (await conn.execute("SELECT count(*) FROM api_key_usage")).fetchone())[0] == 0


async def test_old_windows_are_cleaned_up(auth, clock, pool):
    _, secret = await auth.create_api_key("erp", "alice", rate_limit_per_minute=10)
    principal = await auth.authenticate(secret)
    await auth.consume_render_quota(principal)
    clock.advance(hours=2)
    await auth.consume_render_quota(principal)
    async with pool.connection() as conn:
        assert (await (await conn.execute("SELECT count(*) FROM api_key_usage")).fetchone())[0] == 1
