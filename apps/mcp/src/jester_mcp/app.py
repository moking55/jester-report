"""The MCP service: Streamable HTTP at /mcp, OAuth for claude.ai, the login page and /healthz."""

from __future__ import annotations

from mcp.server.mcpserver import MCPServer
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse

from .api import Api
from .settings import Settings, from_env


def build(settings: Settings, api: Api) -> MCPServer:
    server = MCPServer(name="jester", instructions=None)

    @server.custom_route("/healthz", methods=["GET"], include_in_schema=False)
    async def healthz(request: Request) -> JSONResponse:
        up = await api.health()
        return JSONResponse({"status": "ok" if up else "api down"}, status_code=200 if up else 503)

    return server


def create_app(settings: Settings | None = None, api: Api | None = None) -> Starlette:
    settings = settings or from_env()
    server = build(settings, api or Api(settings.api_url))
    return server.streamable_http_app(host="0.0.0.0")


def main() -> None:
    import uvicorn

    # one worker: pending logins and authorization codes live in this process's memory
    uvicorn.run(create_app(), host="0.0.0.0", port=8100, workers=1, proxy_headers=False)
