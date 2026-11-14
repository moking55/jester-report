"""Auth: setup, users, sessions, API keys (SPEC-auth.md). All SQL lives here.

Times come from `clock` and are passed into SQL, so expiry and rate limits can be tested without waiting.
"""

from __future__ import annotations

import hmac
import re
import secrets
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from psycopg import AsyncConnection, errors
from psycopg_pool import AsyncConnectionPool

from .passwords import DUMMY_HASH, hash_password, needs_rehash, verify_password
from .tokens import API_KEY_PREFIX, SESSION_PREFIX, display_prefix, new_token, sha256_hex

IDLE = timedelta(hours=12)
RENEW_BELOW = timedelta(hours=6)  # a session used with less left than this is renewed to IDLE
MAX_AGE = timedelta(days=7)  # renewals never go past this, counted from login
FAIL_WINDOW = timedelta(minutes=15)
MAX_FAILURES = 5
SETUP_FRESH = timedelta(minutes=5)  # another process printed a token this recently: do not replace it
KEY_TOUCH = timedelta(minutes=1)  # API key last_used_at is written at most this often
USERNAME = re.compile(r"^[a-zA-Z0-9._-]{3,40}$")  # public-api.yaml Username
_SETUP_LOCK = 0x4A41_5554  # "JAUT"

AuthErrorCode = Literal[
    "UNAUTHORIZED",
    "RATE_LIMITED",
    "SETUP_COMPLETED",
    "SETUP_TOKEN_INVALID",
    "CONFLICT",
    "NOT_FOUND",
    "INPUT_INVALID",
]


class AuthError(Exception):
    def __init__(self, code: AuthErrorCode, message: str) -> None:
        super().__init__(message)
        self.code, self.message = code, message


@dataclass(frozen=True)
class User:
    id: uuid.UUID
    username: str
    created_at: datetime
    last_login_at: datetime | None


@dataclass(frozen=True)
class Session:
    token: str  # only available when the session is created
    expires_at: datetime
    user: User


@dataclass(frozen=True)
class ApiKey:
    id: uuid.UUID
    name: str
    prefix: str
    created_at: datetime
    created_by: str
    last_used_at: datetime | None


@dataclass(frozen=True)
class Principal:
    kind: Literal["user", "api_key"]
    name: str  # for updatedBy/publishedBy
    user: User | None = None
    api_key_id: uuid.UUID | None = None


def _check_username(username: str) -> None:
    if not USERNAME.match(username):
        raise AuthError("INPUT_INVALID", "username must be 3-40 letters, digits, '.', '_' or '-'")


def _check_password(password: str) -> None:
    if not 12 <= len(password) <= 200:
        raise AuthError("INPUT_INVALID", "password must be 12-200 characters")


def _unauthorized() -> AuthError:
    return AuthError("UNAUTHORIZED", "missing, invalid, expired or revoked credentials")


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Auth:
    def __init__(self, db: AsyncConnectionPool, clock: Callable[[], datetime] = _utcnow) -> None:
        self._db = db
        self._now = clock

    # ---- helpers ---------------------------------------------------------------------------------------
    @staticmethod
    async def _one(conn: AsyncConnection, sql: str, args: tuple[Any, ...] = ()) -> Any:
        cur = await conn.execute(sql, args)  # type: ignore[arg-type]
        return await cur.fetchone()

    @staticmethod
    async def _all(conn: AsyncConnection, sql: str, args: tuple[Any, ...] = ()) -> list[Any]:
        cur = await conn.execute(sql, args)  # type: ignore[arg-type]
        return await cur.fetchall()

    async def _new_session(self, conn: AsyncConnection, user: User) -> Session:
        token, now = new_token(SESSION_PREFIX), self._now()
        expires = now + IDLE
        await conn.execute(
            "INSERT INTO sessions (token_sha256, user_id, created_at, expires_at) VALUES (%s, %s, %s, %s)",
            (sha256_hex(token), user.id, now, expires),
        )
        return Session(token, expires, user)

    async def _failures(self, conn: AsyncConnection, username: str, client_ip: str) -> int:
        row = await self._one(
            conn,
            "SELECT count(*) FROM login_failures "
            "WHERE username_lower = %s AND client_ip = %s AND failed_at > %s",
            (username.lower(), client_ip, self._now() - FAIL_WINDOW),
        )
        return row[0]

    async def _record_failure(self, username: str, client_ip: str) -> None:
        # its own transaction, committed before the caller raises (a raise would roll back a shared one)
        now = self._now()
        async with self._db.connection() as conn, conn.transaction():
            await conn.execute("DELETE FROM login_failures WHERE failed_at <= %s", (now - FAIL_WINDOW,))
            await conn.execute(
                "INSERT INTO login_failures (username_lower, client_ip, failed_at) VALUES (%s, %s, %s)",
                (username.lower(), client_ip, now),
            )

    async def _check_rate(self, username: str, client_ip: str) -> None:
        async with self._db.connection() as conn:
            if await self._failures(conn, username, client_ip) >= MAX_FAILURES:
                raise AuthError("RATE_LIMITED", "too many failed attempts; try again later")

    @staticmethod
    def _user(row: Any) -> User:
        return User(row[0], row[1], row[2], row[3])

    # ---- setup -----------------------------------------------------------------------------------------
    async def prepare_setup(self) -> str | None:
        """At start: a new setup token for the caller to print, or None (users exist / just printed)."""
        async with self._db.connection() as conn, conn.transaction():
            await conn.execute("SELECT pg_advisory_xact_lock(%s)", (_SETUP_LOCK,))
            if await self._one(conn, "SELECT 1 FROM users LIMIT 1"):
                await conn.execute("DELETE FROM setup_tokens")
                return None
            row = await self._one(conn, "SELECT created_at FROM setup_tokens")
            if row and self._now() - row[0] < SETUP_FRESH:
                return None
            token = secrets.token_urlsafe(24)
            await conn.execute("DELETE FROM setup_tokens")
            await conn.execute(
                "INSERT INTO setup_tokens (token_sha256, created_at) VALUES (%s, %s)",
                (sha256_hex(token), self._now()),
            )
            return token

    async def setup_required(self) -> bool:
        async with self._db.connection() as conn:
            return await self._one(conn, "SELECT 1 FROM users LIMIT 1") is None

    async def _setup_token_ok(self, conn: AsyncConnection, setup_token: str) -> None:
        if await self._one(conn, "SELECT 1 FROM users LIMIT 1"):
            raise AuthError("SETUP_COMPLETED", "setup is already completed")
        row = await self._one(conn, "SELECT token_sha256 FROM setup_tokens")
        if row is None or not hmac.compare_digest(row[0], sha256_hex(setup_token)):
            raise AuthError("SETUP_TOKEN_INVALID", "wrong or used setup token")

    async def complete_setup(self, setup_token: str, username: str, password: str) -> Session:
        _check_username(username)
        _check_password(password)
        async with self._db.connection() as conn:
            await self._setup_token_ok(conn, setup_token)  # cheap check before the costly hash
        password_hash = await hash_password(password)
        async with self._db.connection() as conn, conn.transaction():
            await conn.execute("SELECT pg_advisory_xact_lock(%s)", (_SETUP_LOCK,))
            await self._setup_token_ok(conn, setup_token)  # again, under the lock
            user = User(uuid.uuid4(), username, self._now(), self._now())
            await conn.execute(
                "INSERT INTO users (id, username, password_hash, created_at, last_login_at) "
                "VALUES (%s, %s, %s, %s, %s)",
                (user.id, user.username, password_hash, user.created_at, user.last_login_at),
            )
            await conn.execute("DELETE FROM setup_tokens")
            return await self._new_session(conn, user)

    # ---- sessions --------------------------------------------------------------------------------------
    async def login(self, username: str, password: str, client_ip: str) -> Session:
        await self._check_rate(username, client_ip)
        async with self._db.connection() as conn:
            row = await self._one(
                conn,
                "SELECT id, username, created_at, last_login_at, password_hash FROM users "
                "WHERE lower(username) = lower(%s)",
                (username,),
            )
        ok = await verify_password(password, row[4] if row else DUMMY_HASH)  # same work either way
        if not (row and ok):
            await self._record_failure(username, client_ip)
            raise AuthError("UNAUTHORIZED", "wrong username or password")
        new_hash = await hash_password(password) if needs_rehash(row[4]) else None
        now = self._now()
        async with self._db.connection() as conn, conn.transaction():
            await conn.execute("DELETE FROM sessions WHERE user_id = %s AND expires_at <= %s", (row[0], now))
            await conn.execute(
                "UPDATE users SET last_login_at = %s, password_hash = coalesce(%s, password_hash) "
                "WHERE id = %s",
                (now, new_hash, row[0]),
            )
            return await self._new_session(conn, User(row[0], row[1], row[2], now))

    async def logout(self, token: str) -> None:
        async with self._db.connection() as conn:
            await conn.execute("DELETE FROM sessions WHERE token_sha256 = %s", (sha256_hex(token),))

    async def authenticate(self, bearer: str) -> Principal:
        """Who is calling: jrs_ session (renewed when less than 6 h is left) or jrk_ API key."""
        if bearer.startswith(SESSION_PREFIX):
            return await self._session_principal(bearer)
        if bearer.startswith(API_KEY_PREFIX):
            return await self._api_key_principal(bearer)
        raise _unauthorized()

    async def _session_principal(self, token: str) -> Principal:
        now, digest = self._now(), sha256_hex(token)
        async with self._db.connection() as conn:
            row = await self._one(
                conn,
                "SELECT u.id, u.username, u.created_at, u.last_login_at, s.created_at, s.expires_at "
                "FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_sha256 = %s",
                (digest,),
            )
            if row is None:
                raise _unauthorized()
            created, expires = row[4], row[5]
            if expires <= now:
                await conn.execute("DELETE FROM sessions WHERE token_sha256 = %s", (digest,))
                raise _unauthorized()
            if expires - now < RENEW_BELOW:
                renewed = min(now + IDLE, created + MAX_AGE)
                if renewed > expires:
                    await conn.execute(
                        "UPDATE sessions SET expires_at = %s WHERE token_sha256 = %s", (renewed, digest)
                    )
        user = self._user(row)
        return Principal("user", user.username, user=user)

    async def _api_key_principal(self, secret: str) -> Principal:
        now = self._now()
        async with self._db.connection() as conn:
            row = await self._one(
                conn,
                "SELECT id, name, last_used_at FROM api_keys WHERE secret_sha256 = %s AND revoked_at IS NULL",
                (sha256_hex(secret),),
            )
            if row is None:
                raise _unauthorized()
            if row[2] is None or now - row[2] >= KEY_TOUCH:
                await conn.execute("UPDATE api_keys SET last_used_at = %s WHERE id = %s", (now, row[0]))
        return Principal("api_key", f"api-key:{row[1]}", api_key_id=row[0])

    async def change_password(self, token: str, current: str, new: str, client_ip: str) -> None:
        """Keeps the session used for the change; revokes the user's other sessions."""
        principal = await self.authenticate(token)
        if principal.user is None:
            raise _unauthorized()
        username = principal.user.username
        _check_password(new)
        await self._check_rate(username, client_ip)
        async with self._db.connection() as conn:
            row = await self._one(conn, "SELECT password_hash FROM users WHERE id = %s", (principal.user.id,))
        if row is None or not await verify_password(current, row[0]):
            await self._record_failure(username, client_ip)
            raise AuthError("UNAUTHORIZED", "current password is wrong")
        new_hash = await hash_password(new)
        async with self._db.connection() as conn, conn.transaction():
            await conn.execute(
                "UPDATE users SET password_hash = %s WHERE id = %s", (new_hash, principal.user.id)
            )
            await conn.execute(
                "DELETE FROM sessions WHERE user_id = %s AND token_sha256 <> %s",
                (principal.user.id, sha256_hex(token)),
            )

    async def reset_password(self, username: str) -> str:
        """Recovery command: new random password (shown once); every session of the user is revoked."""
        new = secrets.token_urlsafe(18)  # 24 characters
        new_hash = await hash_password(new)
        async with self._db.connection() as conn, conn.transaction():
            row = await self._one(
                conn,
                "UPDATE users SET password_hash = %s WHERE lower(username) = lower(%s) RETURNING id",
                (new_hash, username),
            )
            if row is None:
                raise AuthError("NOT_FOUND", "no user with this username")
            await conn.execute("DELETE FROM sessions WHERE user_id = %s", (row[0],))
        return new

    # ---- users -----------------------------------------------------------------------------------------
    async def list_users(self) -> list[User]:
        async with self._db.connection() as conn:
            rows = await self._all(
                conn, "SELECT id, username, created_at, last_login_at FROM users ORDER BY lower(username)"
            )
        return [self._user(r) for r in rows]

    async def create_user(self, username: str, password: str) -> User:
        _check_username(username)
        _check_password(password)
        password_hash = await hash_password(password)
        user = User(uuid.uuid4(), username, self._now(), None)
        try:
            async with self._db.connection() as conn, conn.transaction():
                await conn.execute(
                    "INSERT INTO users (id, username, password_hash, created_at) VALUES (%s, %s, %s, %s)",
                    (user.id, user.username, password_hash, user.created_at),
                )
        except errors.UniqueViolation:
            raise AuthError("CONFLICT", "username is taken") from None
        return user

    async def delete_user(self, user_id: uuid.UUID) -> None:
        async with self._db.connection() as conn, conn.transaction():
            # lock every row before counting, so two deletes at once cannot leave zero users
            ids = [r[0] for r in await self._all(conn, "SELECT id FROM users FOR UPDATE")]
            if user_id not in ids:
                raise AuthError("NOT_FOUND", "user not found")
            if len(ids) == 1:
                raise AuthError("CONFLICT", "the last user cannot be deleted")
            await conn.execute("DELETE FROM users WHERE id = %s", (user_id,))  # sessions cascade

    # ---- API keys --------------------------------------------------------------------------------------
    async def list_api_keys(self) -> list[ApiKey]:
        async with self._db.connection() as conn:
            rows = await self._all(
                conn,
                "SELECT id, name, prefix, created_at, created_by, last_used_at FROM api_keys "
                "WHERE revoked_at IS NULL ORDER BY created_at",
            )
        return [ApiKey(*r) for r in rows]

    async def create_api_key(self, name: str, created_by: str) -> tuple[ApiKey, str]:
        name = name.strip()
        if not 1 <= len(name) <= 80:
            raise AuthError("INPUT_INVALID", "name must be 1-80 characters")
        secret = new_token(API_KEY_PREFIX)
        key = ApiKey(uuid.uuid4(), name, display_prefix(secret), self._now(), created_by, None)
        async with self._db.connection() as conn, conn.transaction():
            await conn.execute(
                "INSERT INTO api_keys (id, name, prefix, secret_sha256, created_at, created_by) "
                "VALUES (%s, %s, %s, %s, %s, %s)",
                (key.id, key.name, key.prefix, sha256_hex(secret), key.created_at, key.created_by),
            )
        return key, secret

    async def revoke_api_key(self, key_id: uuid.UUID) -> None:
        async with self._db.connection() as conn:
            row = await self._one(
                conn,
                "UPDATE api_keys SET revoked_at = %s WHERE id = %s AND revoked_at IS NULL RETURNING id",
                (self._now(), key_id),
            )
        if row is None:
            raise AuthError("NOT_FOUND", "API key not found")
