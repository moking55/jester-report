from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, JSONResponse

from ..state import services, settings

router = APIRouter()


@router.get("/v1/health")
async def health(request: Request) -> JSONResponse:
    h = await services(request).render.health()
    body = {
        "status": h.status,
        "components": {
            "database": h.database,
            "objectStorage": h.object_storage,
            "engine": {"status": h.engine, "version": h.engine_version},
        },
    }
    return JSONResponse(body, status_code=200 if h.status == "up" else 503)


@router.get("/v1/openapi.yaml")
async def contract(request: Request) -> FileResponse:
    return FileResponse(settings(request).contract_path, media_type="application/yaml")
