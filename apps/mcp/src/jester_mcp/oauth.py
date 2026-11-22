"""OAuth for claude.ai (SPEC-mcp.md assumptions 3 and 4).

The MCP service is its own authorization server. claude.ai registers (DCR, redirect URIs from an
allow-list), sends the person to /authorize -> our login page -> code -> /token -> `jmc_` access token.
The Jester session behind the token stays in SQLite here; claude.ai never sees it. Only sha256 of the
access token is stored. Pending logins and codes live in memory (one worker; a restart means log in again).
"""

from __future__ import annotations

import hashlib
import secrets
import sqlite3
import time
from dataclasses import dataclass

from mcp.server.auth.provider import (
    AccessToken,
    AuthorizationCode,
    AuthorizationParams,
    RefreshToken,
    RegistrationError,
    TokenError,
    construct_redirect_uri,
)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken

from .settings import Settings

TOKEN_PREFIX = "jmc_"
TOKEN_LIFETIME_S = 90 * 24 * 3600  # the Jester long session's ceiling; the api decides the real end
CODE_LIFETIME_S = 5 * 60
LOGIN_LIFETIME_S = 10 * 60
LOGIN_PATH = "/login"


def _sha256(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class Store:
    """Registered clients and access tokens (SQLite on the service's volume)."""

    def __init__(self, path: str) -> None:
        self._db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self._db.executescript(
            """
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS clients (client_id TEXT PRIMARY KEY, info TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS tokens (
                token_sha256 TEXT PRIMARY KEY,
                session      TEXT NOT NULL,
                username     TEXT NOT NULL,
                client_id    TEXT NOT NULL,
                expires_at   INTEGER NOT NULL
            );
            """
        )

    def close(self) -> None:
        self._db.close()

    def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        row = self._db.execute("SELECT info FROM clients WHERE client_id = ?", (client_id,)).fetchone()
        return OAuthClientInformationFull.model_validate_json(row[0]) if row else None

    def put_client(self, info: OAuthClientInformationFull) -> None:
        self._db.execute(
            "INSERT OR REPLACE INTO clients (client_id, info) VALUES (?, ?)",
            (info.client_id, info.model_dump_json()),
        )

    def put_token(self, token: str, session: str, username: str, client_id: str, expires_at: int) -> None:
        self._db.execute(
            "INSERT INTO tokens (token_sha256, session, username, client_id, expires_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (_sha256(token), session, username, client_id, expires_at),
        )

    def get_token(self, token: str) -> tuple[str, str, str, int] | None:
        """(session, username, client_id, expires_at) or None; expired rows are deleted on the way."""
        row = self._db.execute(
            "SELECT session, username, client_id, expires_at FROM tokens WHERE token_sha256 = ?",
            (_sha256(token),),
        ).fetchone()
        if row and row[3] <= time.time():
            self.delete_token(token)
            return None
        return row

    def delete_token(self, token: str) -> None:
        self._db.execute("DELETE FROM tokens WHERE token_sha256 = ?", (_sha256(token),))


@dataclass
class _PendingLogin:
    client_id: str
    params: AuthorizationParams
    expires_at: float


@dataclass
class _Code:
    code: AuthorizationCode
    session: str
    username: str


class Provider:
    """The SDK's `OAuthAuthorizationServerProvider`; the login page calls `login_request`/`complete_login`."""

    def __init__(self, settings: Settings, store: Store) -> None:
        self._settings = settings
        self.store = store
        self._logins: dict[str, _PendingLogin] = {}
        self._codes: dict[str, _Code] = {}

    # ---- clients (dynamic registration) ----------------------------------------------------------------
    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        return self.store.get_client(client_id)

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        uris = [str(u) for u in client_info.redirect_uris or []]
        if not uris or any(u not in self._settings.redirect_allow for u in uris):
            raise RegistrationError(
                "invalid_redirect_uri", "this connector only accepts claude.ai's callback"
            )
        self.store.put_client(client_info)

    # ---- authorize -> login page -> code --------------------------------------------------------------
    async def authorize(self, client: OAuthClientInformationFull, params: AuthorizationParams) -> str:
        self._sweep()
        request_id = secrets.token_urlsafe(32)
        self._logins[request_id] = _PendingLogin(
            str(client.client_id), params, time.time() + LOGIN_LIFETIME_S
        )
        return f"{self._settings.public_url}{LOGIN_PATH}?request={request_id}"

    def login_request(self, request_id: str) -> _PendingLogin | None:
        pending = self._logins.get(request_id)
        if pending is None or pending.expires_at <= time.time():
            self._logins.pop(request_id, None)
            return None
        return pending

    def complete_login(self, request_id: str, session: str, username: str) -> str:
        """The person signed in: one-time code for claude.ai; returns where to send the browser."""
        pending = self._logins.pop(request_id)
        code = secrets.token_urlsafe(32)
        p = pending.params
        self._codes[code] = _Code(
            AuthorizationCode(
                code=code,
                scopes=p.scopes or [],
                expires_at=time.time() + CODE_LIFETIME_S,
                client_id=pending.client_id,
                code_challenge=p.code_challenge,
                redirect_uri=p.redirect_uri,
                redirect_uri_provided_explicitly=p.redirect_uri_provided_explicitly,
                resource=p.resource,
                subject=username,
            ),
            session,
            username,
        )
        return construct_redirect_uri(str(p.redirect_uri), code=code, state=p.state)

    def cancel_login(self, request_id: str) -> str | None:
        pending = self._logins.pop(request_id, None)
        if pending is None:
            return None
        p = pending.params
        return construct_redirect_uri(str(p.redirect_uri), error="access_denied", state=p.state)

    async def load_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: str
    ) -> AuthorizationCode | None:
        entry = self._codes.get(authorization_code)
        if entry is None or entry.code.client_id != client.client_id:
            return None
        return entry.code

    async def exchange_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: AuthorizationCode
    ) -> OAuthToken:
        entry = self._codes.pop(authorization_code.code, None)  # one use only
        if entry is None or entry.code.expires_at <= time.time():
            raise TokenError("invalid_grant", "authorization code expired or already used")
        token = TOKEN_PREFIX + secrets.token_urlsafe(32)
        expires_at = int(time.time()) + TOKEN_LIFETIME_S
        self.store.put_token(token, entry.session, entry.username, str(client.client_id), expires_at)
        return OAuthToken(access_token=token, expires_in=TOKEN_LIFETIME_S)

    # ---- tokens ----------------------------------------------------------------------------------------
    async def load_refresh_token(self, client: OAuthClientInformationFull, refresh_token: str) -> None:
        return None  # no refresh tokens: when the Jester session ends, claude.ai signs in again

    async def exchange_refresh_token(
        self, client: OAuthClientInformationFull, refresh_token: RefreshToken, scopes: list[str]
    ) -> OAuthToken:
        raise TokenError("invalid_grant", "refresh tokens are not issued")

    async def load_access_token(self, token: str) -> AccessToken | None:
        row = self.store.get_token(token)
        if row is None:
            return None
        _session, username, client_id, expires_at = row
        return AccessToken(
            token=token, client_id=client_id, scopes=[], expires_at=expires_at, subject=username
        )

    async def revoke_token(self, token: AccessToken | RefreshToken) -> None:
        self.store.delete_token(token.token)

    def session_of(self, token: str) -> tuple[str, str] | None:
        """(Jester session, username) behind an access token."""
        row = self.store.get_token(token)
        return (row[0], row[1]) if row else None

    def forget(self, token: str) -> None:
        """The api said 401: the Jester session is gone, so is this token (claude.ai will sign in again)."""
        self.store.delete_token(token)

    def _sweep(self) -> None:
        now = time.time()
        for key in [k for k, v in self._logins.items() if v.expires_at <= now]:
            del self._logins[key]
        for key in [k for k, v in self._codes.items() if v.code.expires_at <= now]:
            del self._codes[key]
