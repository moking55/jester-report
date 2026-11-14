"""HTTP API (SPEC-public-api.md). `app` is the uvicorn target; settings come from the environment."""

from .app import create_app, main
from .settings import Settings

app = create_app()

__all__ = ["Settings", "app", "create_app", "main"]
