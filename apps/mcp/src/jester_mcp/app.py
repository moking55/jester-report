"""The MCP service: Streamable HTTP at /mcp, OAuth for claude.ai, the login page and /healthz."""

from __future__ import annotations

from urllib.parse import urlparse

from mcp.server.auth.settings import AuthSettings, ClientRegistrationOptions, RevocationOptions
from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse

from . import login, tools
from .api import Api
from .oauth import LOGIN_PATH, Provider, Store
from .settings import Settings, from_env


def build(settings: Settings, api: Api, provider: Provider) -> MCPServer:
    server = MCPServer(
        name="jester",
        instructions=None,
        auth_server_provider=provider,
        auth=AuthSettings(
            issuer_url=settings.public_url,
            resource_server_url=settings.resource_url,
            client_registration_options=ClientRegistrationOptions(enabled=True),
            revocation_options=RevocationOptions(enabled=True),
            # our tokens are only ever valid here (we are both the authorization and the resource server)
            validate_token_resource=False,
        ),
    )

    @server.custom_route("/healthz", methods=["GET"], include_in_schema=False)
    async def healthz(request: Request) -> JSONResponse:
        up = await api.health()
        return JSONResponse({"status": "ok" if up else "api down"}, status_code=200 if up else 503)

    show, submit = login.routes(settings, api, provider)
    server.custom_route(LOGIN_PATH, methods=["GET"], include_in_schema=False)(show)
    server.custom_route(LOGIN_PATH, methods=["POST"], include_in_schema=False)(submit)
    tools.register(server, tools.Caller(api, provider), settings.studio_public_url)
    return server


def create_app(settings: Settings | None = None, api: Api | None = None) -> Starlette:
    settings = settings or from_env()
    api = api or Api(settings.api_url)
    provider = Provider(settings, Store(settings.db_path))
    server = build(settings, api, provider)
    public = urlparse(settings.public_url)
    app = server.streamable_http_app(
        host="0.0.0.0",
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=[public.netloc, "localhost:*", "127.0.0.1:*", "mcp:*"],
            allowed_origins=[f"{public.scheme}://{public.netloc}"],
        ),
    )
    app.state.provider, app.state.server = provider, server
    return app


def main() -> None:
    import uvicorn

    # one worker: pending logins and authorization codes live in this process's memory
    uvicorn.run(create_app(), host="0.0.0.0", port=8100, workers=1, proxy_headers=False)
