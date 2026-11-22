"""Configuration from the environment (SPEC-mcp.md "Config")."""

from __future__ import annotations

import os
from dataclasses import dataclass, field

CLAUDE_CALLBACKS = (
    "https://claude.ai/api/mcp/auth_callback",
    "https://claude.com/api/mcp/auth_callback",
)


class SettingsError(Exception):
    pass


@dataclass(frozen=True)
class Settings:
    api_url: str  # Jester api on the compose network, e.g. http://api:8000
    public_url: str  # this service as claude.ai sees it, e.g. https://mcp.example.com
    studio_public_url: str  # where people open Studio to publish
    studio_key: str  # same JESTER_STUDIO_KEY as api/studio: long sessions + the browser's IP
    db_path: str = "/data/mcp.sqlite3"
    client_ip_header: str | None = None  # header the proxy puts the browser's IP in; None = do not forward
    redirect_allow: tuple[str, ...] = field(default=CLAUDE_CALLBACKS)

    @property
    def resource_url(self) -> str:
        return f"{self.public_url}/mcp"


def from_env(env: dict[str, str] | None = None) -> Settings:
    env = dict(os.environ if env is None else env)
    required = {
        "JESTER_API_URL": "api_url",
        "JESTER_MCP_PUBLIC_URL": "public_url",
        "JESTER_STUDIO_PUBLIC_URL": "studio_public_url",
        "JESTER_STUDIO_KEY": "studio_key",
    }
    missing = [name for name in required if not env.get(name, "").strip()]
    if missing:  # names only: never print the values
        raise SettingsError(f"set {', '.join(missing)}")
    values = {attr: env[name].strip().rstrip("/") for name, attr in required.items()}
    values["studio_key"] = env["JESTER_STUDIO_KEY"].strip()
    allow = env.get("JESTER_MCP_REDIRECT_ALLOW", "").strip()
    return Settings(
        **values,
        db_path=env.get("JESTER_MCP_DB", "").strip() or "/data/mcp.sqlite3",
        client_ip_header=env.get("JESTER_MCP_CLIENT_IP_HEADER", "").strip() or None,
        redirect_allow=tuple(u.strip() for u in allow.split(",") if u.strip()) if allow else CLAUDE_CALLBACKS,
    )
