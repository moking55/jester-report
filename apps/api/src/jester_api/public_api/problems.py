"""Every error becomes RFC 9457 problem+json here, in one place (SPEC-public-api.md assumption 8)."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from ..auth import AuthError
from ..render_service import RenderError
from ..report_definition.problems import Problem
from ..template_store import StoreError

log = logging.getLogger("jester.api")

# module error code -> HTTP status (render-service errors carry their own status)
STATUS = {
    "INPUT_INVALID": 422,
    "UNAUTHORIZED": 401,
    "NOT_FOUND": 404,
    "CONFLICT": 409,
    "REVISION_CONFLICT": 412,
    "REVISION_REQUIRED": 428,
    "PAYLOAD_TOO_LARGE": 413,
    "UNSUPPORTED_MEDIA_TYPE": 415,
    "RATE_LIMITED": 429,
    "SETUP_COMPLETED": 409,
    "SETUP_TOKEN_INVALID": 403,
    "DRAFT_INVALID": 422,
    "INTERNAL_ERROR": 500,
}


class ApiError(Exception):
    """Raised by routes for HTTP-level problems (missing If-Match, bad JSON, body too large)."""

    def __init__(self, code: str, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.code, self.message, self.status = code, message, status or STATUS[code]


def problem_dict(p: Problem) -> dict[str, Any]:
    out: dict[str, Any] = {"severity": p.severity, "code": p.code, "message": p.message}
    for key in ("pointer", "file", "line", "column"):
        if (value := getattr(p, key)) is not None:
            out[key] = value
    return out


def problem_response(
    code: str,
    status: int,
    detail: str,
    *,
    problems: list[dict[str, Any]] | None = None,
    retryable: bool = False,
    run_id: str | None = None,
) -> JSONResponse:
    body: dict[str, Any] = {
        "type": f"https://jester-report.dev/errors/{code.lower().replace('_', '-')}",
        "title": code.replace("_", " ").capitalize(),
        "status": status,
        "code": code,
        "detail": detail,
        "retryable": retryable,
    }
    if problems:
        body["problems"] = problems
    if run_id is not None:
        body["runId"] = run_id
    return JSONResponse(body, status_code=status, media_type="application/problem+json")


def install(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api(_: Request, exc: ApiError) -> JSONResponse:
        return problem_response(exc.code, exc.status, exc.message)

    @app.exception_handler(StoreError)
    async def _store(_: Request, exc: StoreError) -> JSONResponse:
        return problem_response(exc.code, STATUS[exc.code], exc.message)

    @app.exception_handler(AuthError)
    async def _auth(_: Request, exc: AuthError) -> JSONResponse:
        return problem_response(exc.code, STATUS[exc.code], exc.message)

    @app.exception_handler(RenderError)
    async def _render(_: Request, exc: RenderError) -> JSONResponse:
        return problem_response(
            exc.code,
            exc.http_status,
            exc.message,
            problems=[problem_dict(p) for p in exc.problems],
            retryable=exc.retryable,
            run_id=exc.run_id,
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        problems = [
            {
                "severity": "error",
                "code": "INPUT_INVALID",
                "message": err.get(
                    "msg", "invalid value"
                ),  # pydantic messages describe the rule, not the input
                "pointer": "".join(f"/{part}" for part in err.get("loc", ())[1:]),
            }
            for err in exc.errors()
        ]
        return problem_response(
            "INPUT_INVALID", 422, "the request does not match the contract", problems=problems
        )

    @app.exception_handler(HTTPException)
    async def _http(_: Request, exc: HTTPException) -> JSONResponse:
        code = "NOT_FOUND" if exc.status_code == 404 else "INPUT_INVALID"
        return problem_response(code, exc.status_code, str(exc.detail))

    @app.exception_handler(Exception)
    async def _unexpected(request: Request, exc: Exception) -> JSONResponse:
        # stack trace to the log only; the caller gets a plain message without request values
        log.exception("unexpected error on %s %s", request.method, request.url.path)
        return problem_response("INTERNAL_ERROR", 500, "something went wrong on the server")
