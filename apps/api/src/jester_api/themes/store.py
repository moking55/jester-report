"""Theme store: raw SQL on the shared pool, like the other modules."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal

from psycopg.errors import UniqueViolation
from psycopg.types.json import Jsonb
from psycopg_pool import AsyncConnectionPool

from ..report_definition.problems import Problem
from .builtin import BUILTIN, check_tokens

MAX_THEMES = 50
FALLBACK = "mahasamut"
_LOCK_ID = 0x4A54_484D  # "JTHM": serialises creates so the 50-theme limit holds across processes

ThemeErrorCode = Literal["INPUT_INVALID", "NOT_FOUND", "CONFLICT"]


class ThemeError(Exception):
    def __init__(self, code: ThemeErrorCode, message: str, problems: list[Problem] | None = None) -> None:
        super().__init__(message)
        self.code, self.message, self.problems = code, message, problems or []


@dataclass(frozen=True)
class Theme:
    id: str
    name: str
    built_in: bool
    tokens: dict[str, Any]
    created_by: str | None = None
    updated_at: datetime | None = None


BUILTIN_THEMES = [Theme(key, b["name"], True, b["tokens"]) for key, b in BUILTIN.items()]
_BUILTIN_NAMES = {t.name.casefold() for t in BUILTIN_THEMES}


def _checked(name: str, tokens: Any) -> str:
    name = name.strip()
    if not 1 <= len(name) <= 40:
        raise ThemeError("INPUT_INVALID", "name must be 1-40 characters")
    if problems := check_tokens(tokens):
        raise ThemeError("INPUT_INVALID", "the theme has invalid tokens", problems)
    if name.casefold() in _BUILTIN_NAMES:
        raise ThemeError("CONFLICT", f"{name} is the name of a built-in theme")
    return name


def _uuid(theme_id: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(theme_id)
    except ValueError:
        return None


class Themes:
    def __init__(self, db: AsyncConnectionPool, clock: Callable[[], datetime] = lambda: datetime.now(UTC)):
        self._db, self._now = db, clock

    async def list(self) -> list[Theme]:
        async with self._db.connection() as conn:
            cur = await conn.execute(
                "SELECT id, name, tokens, created_by, updated_at FROM themes ORDER BY lower(name)"
            )
            rows = await cur.fetchall()
        return [*BUILTIN_THEMES, *(Theme(str(r[0]), r[1], False, r[2], r[3], r[4]) for r in rows)]

    async def get(self, theme_id: str) -> Theme:
        for theme in BUILTIN_THEMES:
            if theme.id == theme_id:
                return theme
        key = _uuid(theme_id)
        if key is not None:
            async with self._db.connection() as conn:
                cur = await conn.execute(
                    "SELECT id, name, tokens, created_by, updated_at FROM themes WHERE id = %s", (key,)
                )
                row = await cur.fetchone()
            if row is not None:
                return Theme(str(row[0]), row[1], False, row[2], row[3], row[4])
        raise ThemeError("NOT_FOUND", "theme not found")

    async def create(self, name: str, tokens: Any, created_by: str) -> Theme:
        theme = Theme(str(uuid.uuid4()), _checked(name, tokens), False, dict(tokens), created_by, self._now())
        try:
            async with self._db.connection() as conn, conn.transaction():
                await conn.execute("SELECT pg_advisory_xact_lock(%s)", (_LOCK_ID,))
                cur = await conn.execute("SELECT count(*) FROM themes")
                if (await cur.fetchone())[0] >= MAX_THEMES:  # type: ignore[index]
                    raise ThemeError("CONFLICT", f"there are already {MAX_THEMES} themes; delete one first")
                await conn.execute(
                    "INSERT INTO themes (id, name, tokens, created_by, updated_at) "
                    "VALUES (%s, %s, %s, %s, %s)",
                    (theme.id, theme.name, Jsonb(theme.tokens), created_by, theme.updated_at),
                )
        except UniqueViolation:
            raise ThemeError("CONFLICT", f"a theme named {theme.name} exists") from None
        return theme

    async def update(self, theme_id: str, name: str, tokens: Any) -> Theme:
        current = await self.get(theme_id)
        if current.built_in:
            raise ThemeError("CONFLICT", "built-in themes cannot be changed; make a copy instead")
        name, now = _checked(name, tokens), self._now()
        try:
            async with self._db.connection() as conn:
                cur = await conn.execute(
                    "UPDATE themes SET name = %s, tokens = %s, updated_at = %s WHERE id = %s RETURNING id",
                    (name, Jsonb(dict(tokens)), now, current.id),
                )
                if await cur.fetchone() is None:  # deleted by someone else meanwhile
                    raise ThemeError("NOT_FOUND", "theme not found")
        except UniqueViolation:
            raise ThemeError("CONFLICT", f"a theme named {name} exists") from None
        return Theme(current.id, name, False, dict(tokens), current.created_by, now)

    async def delete(self, theme_id: str) -> None:
        current = await self.get(theme_id)
        if current.built_in:
            raise ThemeError("CONFLICT", "built-in themes cannot be deleted")
        async with self._db.connection() as conn, conn.transaction():
            await conn.execute("DELETE FROM themes WHERE id = %s", (current.id,))
            await conn.execute(
                "UPDATE theme_default SET theme_id = %s WHERE theme_id = %s", (FALLBACK, current.id)
            )

    async def default(self) -> Theme:
        async with self._db.connection() as conn:
            cur = await conn.execute("SELECT theme_id FROM theme_default")
            row = await cur.fetchone()
        try:
            return await self.get(row[0] if row else FALLBACK)
        except ThemeError:  # cannot happen through this store; never leave the login page without a theme
            return await self.get(FALLBACK)

    async def set_default(self, theme_id: str) -> Theme:
        theme = await self.get(theme_id)
        async with self._db.connection() as conn:
            await conn.execute("UPDATE theme_default SET theme_id = %s", (theme.id,))
        return theme
