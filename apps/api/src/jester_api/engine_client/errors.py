from __future__ import annotations

from enum import StrEnum

import httpx

_MAX_MESSAGE = 500


class ErrorCode(StrEnum):
    RENDER_INPUT_INVALID = "RENDER_INPUT_INVALID"
    RENDER_RESOURCE_FAILED = "RENDER_RESOURCE_FAILED"
    RENDER_TIMEOUT = "RENDER_TIMEOUT"
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"
    ENGINE_MISCONFIGURED = "ENGINE_MISCONFIGURED"
    RENDER_FAILED = "RENDER_FAILED"


class EngineError(Exception):
    def __init__(
        self,
        code: ErrorCode,
        *,
        message: str,
        retryable: bool = False,
        http_status: int | None = None,
        trace: str | None = None,
    ) -> None:
        self.code = code
        self.message = message[:_MAX_MESSAGE]
        self.retryable = retryable
        self.http_status = http_status
        self.trace = trace
        super().__init__(f"{code}: {self.message}")


# status -> (code, retryable); see SPEC-engine-client.md "Error taxonomy"
_STATUS_MAP: dict[int, tuple[ErrorCode, bool]] = {
    400: (ErrorCode.RENDER_INPUT_INVALID, False),
    413: (ErrorCode.RENDER_INPUT_INVALID, False),
    415: (ErrorCode.RENDER_INPUT_INVALID, False),
    401: (ErrorCode.ENGINE_MISCONFIGURED, False),
    403: (ErrorCode.ENGINE_MISCONFIGURED, False),
    404: (ErrorCode.ENGINE_MISCONFIGURED, False),
    409: (ErrorCode.RENDER_RESOURCE_FAILED, False),
    429: (ErrorCode.SERVICE_UNAVAILABLE, True),
    503: (ErrorCode.RENDER_TIMEOUT, True),
}


def map_response(resp: httpx.Response) -> EngineError:
    code, retryable = _STATUS_MAP.get(resp.status_code, (ErrorCode.RENDER_FAILED, False))
    # Gotenberg returns plain-text errors; never echoes input content
    return EngineError(
        code,
        message=resp.text.strip() or f"engine returned HTTP {resp.status_code}",
        retryable=retryable,
        http_status=resp.status_code,
        trace=resp.headers.get("Gotenberg-Trace"),
    )
