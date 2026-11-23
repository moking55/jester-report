from __future__ import annotations

from typing import Literal

StoreErrorCode = Literal[
    "NOT_FOUND",
    "CONFLICT",
    "REVISION_CONFLICT",
    "PAYLOAD_TOO_LARGE",
    "UNSUPPORTED_MEDIA_TYPE",
    "INPUT_INVALID",
    "ARCHIVED",
    "INTERNAL_ERROR",  # v1.15: a Word file converted to a draft that does not bind (a converter bug)
]


class StoreError(Exception):
    """public-api maps `code` to the HTTP status and problem type of the contract."""

    def __init__(self, code: StoreErrorCode, message: str) -> None:
        super().__init__(message)
        self.code, self.message = code, message
