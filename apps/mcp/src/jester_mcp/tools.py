"""MCP tools (SPEC-mcp.md "Tools"). Each one: arguments -> api call with the caller's session -> result."""

from __future__ import annotations

import json
import logging
import time
from typing import Any

import httpx
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations

from .api import Api, ApiProblem, NotAllowed, SessionExpired
from .oauth import Provider

log = logging.getLogger("jester_mcp.tools")
READ = ToolAnnotations(readOnlyHint=True, openWorldHint=False)


class Caller:
    """Runs api calls as the person behind the current MCP request."""

    def __init__(self, api: Api, provider: Provider) -> None:
        self._api, self._provider = api, provider

    async def call(self, tool: str, method: str, url_path: str, **kwargs: Any) -> httpx.Response:
        access = get_access_token()
        found = self._provider.session_of(access.token) if access else None
        if access is None or found is None:
            raise ToolError("not signed in: reconnect the Jester connector")
        session, username = found
        started, status = time.monotonic(), "ok"
        try:
            return await self._api.call(method, url_path, session, **kwargs)
        except SessionExpired as e:
            status = "session ended"
            self._provider.forget(access.token)  # next request is 401, so claude.ai signs in again
            raise ToolError(
                "the Jester session ended: reconnect the Jester connector and sign in again"
            ) from e
        except ApiProblem as e:
            status = e.code
            raise ToolError(json.dumps(e.as_dict(), ensure_ascii=False)) from e
        except NotAllowed as e:
            status = "not allowed"
            raise ToolError(str(e)) from e
        except httpx.HTTPError as e:
            status = "api unreachable"
            raise ToolError("Jester api did not answer; try again shortly") from e
        finally:  # one line per call; never the session, token or file contents
            log.info(
                json.dumps(
                    {
                        "user": username,
                        "tool": tool,
                        "path": url_path,
                        "status": status,
                        "ms": round((time.monotonic() - started) * 1000),
                    }
                )
            )


def register(server: MCPServer, caller: Caller) -> None:
    @server.tool(annotations=READ)
    async def whoami() -> dict[str, Any]:
        """The Jester account this connector is signed in as."""
        user = (await caller.call("whoami", "GET", "/v1/auth/me")).json()
        return {"username": user["username"], "id": user["id"]}
