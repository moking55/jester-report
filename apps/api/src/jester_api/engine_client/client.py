from __future__ import annotations

import time
from collections.abc import Sequence

import httpx

from .errors import EngineError, ErrorCode, map_response
from .models import EngineHealth, EngineResult, PageSetup, RenderFile, collect_files

CONVERT_HTML = "/forms/chromium/convert/html"

# Always on; callers cannot disable them (SPEC-engine-client.md "กฎของ request")
SAFETY_FIELDS: dict[str, str] = {
    "failOnResourceLoadingFailed": "true",
    "failOnResourceHttpStatusCodes": "[499,599]",
    "failOnConsoleExceptions": "true",
}


class EngineClient:
    def __init__(
        self,
        base_url: str,
        *,
        timeout_s: float = 30.0,
        basic_auth: tuple[str, str] | None = None,
        max_request_bytes: int = 20 * 1024 * 1024,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._max_request_bytes = max_request_bytes
        self._http = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            timeout=timeout_s,
            auth=basic_auth,
            transport=transport,
        )

    async def aclose(self) -> None:
        await self._http.aclose()

    async def __aenter__(self) -> EngineClient:
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.aclose()

    async def convert_html(
        self,
        index_html: bytes,
        *,
        page: PageSetup,
        header_html: bytes | None = None,
        footer_html: bytes | None = None,
        assets: Sequence[RenderFile] = (),
        wait_for_expression: str | None = None,
    ) -> EngineResult:
        files = collect_files(index_html, header_html, footer_html, assets, self._max_request_bytes)
        fields = {**page.form_fields(), **SAFETY_FIELDS}
        if wait_for_expression:
            fields["waitForExpression"] = wait_for_expression
        started = time.monotonic()
        resp = await self._send(
            "POST",
            CONVERT_HTML,
            data=fields,
            files=[("files", (f.name, f.content)) for f in files],
        )
        if resp.status_code != 200:
            raise map_response(resp)
        return EngineResult(
            pdf=resp.content,
            trace=resp.headers.get("Gotenberg-Trace"),
            duration_ms=int((time.monotonic() - started) * 1000),
            options=fields,
        )

    async def health(self) -> EngineHealth:
        resp = await self._send("GET", "/health")
        if resp.status_code not in (200, 503):
            raise map_response(resp)
        details = resp.json()
        version_resp = await self._send("GET", "/version")
        version = version_resp.text.strip() if version_resp.status_code == 200 else None
        return EngineHealth(up=details.get("status") == "up", version=version, details=details)

    async def _send(self, method: str, url: str, **kwargs: object) -> httpx.Response:
        try:
            return await self._http.request(method, url, **kwargs)  # type: ignore[arg-type]
        except httpx.TimeoutException as exc:
            raise EngineError(ErrorCode.RENDER_TIMEOUT, message="engine timed out", retryable=True) from exc
        except httpx.TransportError as exc:
            raise EngineError(
                ErrorCode.SERVICE_UNAVAILABLE,
                message=f"engine unreachable: {type(exc).__name__}",
                retryable=True,
            ) from exc
