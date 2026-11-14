"""Configuration from the environment (SPEC-public-api.md "Interface")."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

# apps/api/openapi/public-api.yaml; the Docker image copies the openapi/ folder next to src/
DEFAULT_CONTRACT = Path(__file__).resolve().parents[3] / "openapi" / "public-api.yaml"


@dataclass(frozen=True)
class Settings:
    database_url: str
    s3_endpoint: str
    s3_bucket: str
    s3_access_key: str
    s3_secret_key: str
    gotenberg_url: str
    studio_key: str | None = None  # unset: never trust X-Jester-Client-IP
    max_request_bytes: int = 10 * 1024 * 1024
    engine_image: str = "jester/gotenberg:9.4.1-th1"
    workers: int = 2
    contract_path: Path = DEFAULT_CONTRACT

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> Settings:
        env = os.environ if env is None else env
        required = {
            "database_url": "DATABASE_URL",
            "s3_endpoint": "JESTER_S3_ENDPOINT",
            "s3_bucket": "JESTER_S3_BUCKET",
            "s3_access_key": "JESTER_S3_ACCESS_KEY",
            "s3_secret_key": "JESTER_S3_SECRET_KEY",
            "gotenberg_url": "GOTENBERG_URL",
        }
        missing = [name for name in required.values() if not env.get(name)]
        if missing:
            raise RuntimeError(f"missing environment variables: {', '.join(missing)}")
        return cls(
            **{field: env[name] for field, name in required.items()},
            studio_key=env.get("JESTER_STUDIO_KEY") or None,
            max_request_bytes=int(env.get("JESTER_MAX_REQUEST_BYTES", 10 * 1024 * 1024)),
            engine_image=env.get("JESTER_ENGINE_IMAGE", "jester/gotenberg:9.4.1-th1"),
            workers=int(env.get("JESTER_API_WORKERS", 2)),
        )
