import asyncio

import pytest

from jester_api.auth import Auth, AuthError

from .conftest import PASSWORD

pytestmark = pytest.mark.db


async def code_of(awaitable) -> str:
    with pytest.raises(AuthError) as e:
        await awaitable
    return e.value.code


async def test_first_run_setup(auth):
    assert await auth.setup_required()
    token = await auth.prepare_setup()
    assert token and len(token) >= 32
    assert (
        await code_of(auth.complete_setup("wrong-token-1234567890", "alice", PASSWORD))
        == "SETUP_TOKEN_INVALID"
    )
    session = await auth.complete_setup(token, "alice", PASSWORD)
    assert session.token.startswith("jrs_") and session.user.username == "alice"
    assert not await auth.setup_required()
    assert await code_of(auth.complete_setup(token, "bob", PASSWORD)) == "SETUP_COMPLETED"
    assert await auth.prepare_setup() is None  # users exist: no new token


async def test_setup_input_checks(auth):
    token = await auth.prepare_setup()
    assert await code_of(auth.complete_setup(token, "a", PASSWORD)) == "INPUT_INVALID"
    assert await code_of(auth.complete_setup(token, "alice", "short")) == "INPUT_INVALID"


async def test_two_processes_starting_get_one_token(pool, clock):
    first, second = Auth(pool, clock), Auth(pool, clock)
    tokens = await asyncio.gather(first.prepare_setup(), second.prepare_setup())
    assert sorted(t is None for t in tokens) == [False, True]
    printed = next(t for t in tokens if t)
    clock.advance(minutes=6)  # a restart later replaces the token
    newer = await first.prepare_setup()
    assert newer and newer != printed
    assert await code_of(first.complete_setup(printed, "alice", PASSWORD)) == "SETUP_TOKEN_INVALID"
    assert (await first.complete_setup(newer, "alice", PASSWORD)).user.username == "alice"


async def test_users(auth, alice):
    bob = await auth.create_user("bob", PASSWORD)
    assert await code_of(auth.create_user("BOB", PASSWORD)) == "CONFLICT"  # names ignore case
    assert await code_of(auth.create_user("x y", PASSWORD)) == "INPUT_INVALID"
    assert [u.username for u in await auth.list_users()] == ["alice", "bob"]
    await auth.delete_user(bob.id)
    assert await code_of(auth.delete_user(bob.id)) == "NOT_FOUND"
    assert await code_of(auth.delete_user(alice.user.id)) == "CONFLICT"  # last user


async def test_deleting_two_of_two_at_once_keeps_one(auth, alice):
    bob = await auth.create_user("bob", PASSWORD)
    results = await asyncio.gather(
        auth.delete_user(alice.user.id), auth.delete_user(bob.id), return_exceptions=True
    )
    assert sorted(type(r).__name__ for r in results) == ["AuthError", "NoneType"]
    assert len(await auth.list_users()) == 1


async def test_deleted_users_sessions_stop_working(auth, alice):
    bob = await auth.create_user("bob", PASSWORD)
    session = await auth.login("bob", PASSWORD, "10.0.0.1")
    assert (await auth.authenticate(session.token)).name == "bob"
    await auth.delete_user(bob.id)
    assert await code_of(auth.authenticate(session.token)) == "UNAUTHORIZED"
