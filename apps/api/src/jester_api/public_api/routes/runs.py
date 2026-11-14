"""Render history and the retention policy. /v1/runs/retention is declared before /v1/runs/{runId}."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Query, Request
from pydantic import Field

from .. import views
from ..security import SessionCaller
from ..state import services

router = APIRouter()


class RetentionBody(views.Body):
    days: Annotated[int, Field(ge=1, le=36500)] | None


@router.get("/v1/runs")
async def list_runs(
    request: Request,
    caller: SessionCaller,
    templateId: str | None = None,  # noqa: N803
    status: Literal["succeeded", "failed"] | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    before: str | None = None,
) -> dict:
    items, next_cursor = await services(request).render.list_runs(templateId, status, limit, before)
    return {"items": [views.run(r) for r in items], "next": next_cursor}


@router.get("/v1/runs/retention")
async def get_retention(
    request: Request,
    caller: SessionCaller,
    previewDays: Annotated[int | None, Query(ge=1, le=36500)] = None,  # noqa: N803
) -> dict:
    return views.retention(await services(request).render.retention(previewDays))


@router.put("/v1/runs/retention")
async def set_retention(request: Request, caller: SessionCaller, body: RetentionBody) -> dict:
    return views.retention(await services(request).render.set_retention(body.days, caller.name))


@router.get("/v1/runs/{runId}")
async def get_run(request: Request, caller: SessionCaller, runId: str) -> dict:  # noqa: N803
    return views.run(await services(request).render.get_run(runId))
