"""Opaque session tokens (jrs_) and API keys (jrk_); only their sha256 is stored."""

from __future__ import annotations

import hashlib
import secrets

SESSION_PREFIX = "jrs_"
API_KEY_PREFIX = "jrk_"


def new_token(prefix: str) -> str:
    return prefix + secrets.token_urlsafe(32)  # 256 random bits: a fast hash is enough to store it


def sha256_hex(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def display_prefix(token: str) -> str:
    """First 8 characters, e.g. `jrk_5Zq9`, so people can tell keys apart without the secret."""
    return token[:8]
