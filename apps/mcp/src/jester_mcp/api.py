"""Client of Jester's public api (public-api.yaml). The allow-list here is the only way out.

Tools build paths with `path()` and call `Api.call()` with the caller's Jester session. Any method + path
outside ALLOWED is refused before a request is sent, so a tool cannot publish, manage users or keys,
or touch retention even by mistake (SPEC-mcp.md assumption 5).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import quote

import httpx

_SEG = r"[^/]+"
ALLOWED: tuple[tuple[str, re.Pattern[str]], ...] = tuple(
    (method, re.compile(f"^{pattern.replace('{}', _SEG)}$"))
    for method, pattern in (
        ("GET", "/v1/health"),
        ("POST", "/v1/auth/login"),
        ("GET", "/v1/auth/me"),
        ("GET", "/v1/templates"),
        ("POST", "/v1/templates"),
        ("GET", "/v1/templates/{}"),
        ("POST", "/v1/templates/{}/duplicate"),
        ("GET", "/v1/templates/{}/draft"),
        ("PUT", "/v1/templates/{}/draft/files/{}"),
        ("DELETE", "/v1/templates/{}/draft/files/{}"),
        ("POST", "/v1/templates/{}/draft/assets"),
        ("DELETE", "/v1/templates/{}/draft/assets/{}"),
        ("POST", "/v1/templates/{}/draft/validate"),
        ("POST", "/v1/templates/{}/draft/prepared"),
        ("POST", "/v1/templates/{}/draft/preview"),
        ("GET", "/v1/templates/{}/versions"),
    )
)


def path(*segments: str) -> str:
    """'/v1/templates/<id>/draft' from segments; one with '/' or '\' or that is '.'/'..' is refused, since
    the api decodes %2F back to '/' before routing. Segments are percent-encoded otherwise."""
    for s in segments:
        if s in ("", ".", "..") or "/" in s or "\\" in s:
            raise ValueError(f"invalid path segment {s!r}")
    return "/" + "/".join(quote(s, safe="") for s in segments)


def allowed(method: str, url_path: str) -> bool:
    return any(m == method and p.match(url_path) for m, p in ALLOWED)


class NotAllowed(Exception):
    pass


@dataclass
class ApiProblem(Exception):
    """An error answer of the api, kept as the api said it (problem+json)."""

    status: int
    code: str
    detail: str
    problems: list[Any] = field(default_factory=list)
    run_id: str | None = None

    def __str__(self) -> str:
        return f"{self.status} {self.code}: {self.detail}"

    def as_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"status": self.status, "code": self.code, "detail": self.detail}
        if self.problems:
            out["problems"] = self.problems
        if self.run_id:
            out["runId"] = self.run_id
        return out


class SessionExpired(ApiProblem):
    """401 from the api: the Jester session behind this connector is gone (expired, user deleted, ...)."""


def _problem(response: httpx.Response) -> ApiProblem:
    try:
        body = response.json()
    except ValueError:
        body = {}
    if not isinstance(body, dict):
        body = {}
    cls = SessionExpired if response.status_code == 401 else ApiProblem
    return cls(
        response.status_code,
        str(body.get("code") or f"HTTP_{response.status_code}"),
        str(body.get("detail") or body.get("title") or response.reason_phrase),
        list(body.get("problems") or []),
        body.get("runId"),
    )


class Api:
    def __init__(
        self, base_url: str, *, timeout: float = 60.0, transport: httpx.AsyncBaseTransport | None = None
    ):
        self._http = httpx.AsyncClient(base_url=base_url, timeout=timeout, transport=transport)

    async def aclose(self) -> None:
        await self._http.aclose()

    async def call(
        self,
        method: str,
        url_path: str,
        session: str | None,
        *,
        headers: dict[str, str] | None = None,
        **kwargs: Any,
    ) -> httpx.Response:
        if not allowed(method, url_path):
            raise NotAllowed(f"{method} {url_path} is not open to the MCP connector")
        sent = dict(headers or {})
        if session:
            sent["Authorization"] = f"Bearer {session}"
        response = await self._http.request(method, url_path, headers=sent, **kwargs)
        if response.status_code >= 400:
            raise _problem(response)
        return response

    async def health(self) -> bool:
        try:
            response = await self.call("GET", "/v1/health", None)
        except (ApiProblem, httpx.HTTPError):
            return False
        return response.json().get("status") == "up"
