"""POST /v1/render and draft preview: bodies are parsed with Decimal (SPEC-public-api.md assumption 6)."""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Annotated, Any, Literal
from urllib.parse import quote

from fastapi import APIRouter, Request, Response
from fastapi.exceptions import RequestValidationError
from pydantic import Field, ValidationError

from .. import views
from ..problems import ApiError
from ..security import RenderCaller, SessionCaller
from ..state import services

router = APIRouter()
FILENAME = r'^[^\\/"\x00-\x1f\x7f]{1,200}$'  # public-api.yaml RenderRequest.filename


class TemplateRef(views.Body):
    id: str
    version: Annotated[int, Field(ge=1)] | Literal["published"]


class RenderBody(views.Body):
    template: TemplateRef
    params: dict[str, Any] | None = None
    data: Any
    filename: Annotated[str, Field(pattern=FILENAME)] | None = None


class PreviewBody(views.Body):
    params: dict[str, Any] | None = None
    data: Any = None
    sampleFile: str | None = None


async def decimal_json(request: Request) -> Any:
    """JSON numbers become exact Decimals, never binary floats (1250.5 stays 1250.5)."""
    raw = await request.body()
    if not raw.strip():
        return None
    try:
        return json.loads(raw, parse_float=Decimal)
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise ApiError("INPUT_INVALID", "the body must be JSON") from None


def parse(model: type[views.Body], value: Any) -> Any:
    try:
        return model.model_validate(value if value is not None else {})
    except ValidationError as exc:  # same 422 problem shape as FastAPI's own body validation
        raise RequestValidationError([{**e, "loc": ("body", *e["loc"])} for e in exc.errors()]) from None


def content_disposition(filename: str) -> str:
    """RFC 6266/8187: an ASCII fallback plus the exact UTF-8 name (Thai names survive)."""
    fallback = filename.encode("ascii", "ignore").decode().strip() or "document.pdf"
    if fallback.startswith("."):
        fallback = "document" + fallback
    return f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{quote(filename, safe='')}"


def pdf_response(outcome: Any) -> Response:
    headers = {"Jester-Run-Id": outcome.run_id, "Content-Disposition": content_disposition(outcome.filename)}
    if outcome.version is not None:
        headers["Jester-Template-Version"] = str(outcome.version)
    return Response(outcome.pdf, media_type="application/pdf", headers=headers)


@router.post("/v1/render")
async def render(request: Request, caller: RenderCaller) -> Response:
    body: RenderBody = parse(RenderBody, await decimal_json(request))
    outcome = await services(request).render.render(
        body.template.id,
        body.template.version,
        body.params or {},
        body.data,
        caller,
        (request.headers.get("X-Request-Id") or "")[:128] or None,
        body.filename,
    )
    return pdf_response(outcome)


@router.post("/v1/templates/{templateId}/draft/preview")
async def preview(request: Request, caller: SessionCaller, templateId: str) -> Response:  # noqa: N803
    body: PreviewBody = parse(PreviewBody, await decimal_json(request))
    outcome = await services(request).render.preview(
        templateId, body.params, body.data, body.sampleFile, caller
    )
    return pdf_response(outcome)
