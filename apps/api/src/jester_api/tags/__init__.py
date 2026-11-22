"""Tags on templates and issued documents, and the colour of a tag name (SPEC-public-api.md "v1.11").

`normalize_tags` is pure and is the one rule both the template store and the render service apply.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass

from psycopg_pool import AsyncConnectionPool

COLORS = ("gray", "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink")
MAX_TAGS = 10
MAX_LENGTH = 30
_SPACES = re.compile(r"\s+")
_LIST_LIMIT = 500  # shortcut: list is capped (enough for hundreds of tags); page it if it ever isn't


class TagError(Exception):
    """A tag broke the rules. `tag` names the offender (None when the whole list is wrong)."""

    def __init__(self, message: str, tag: str | None = None) -> None:
        super().__init__(message)
        self.message, self.tag = message, tag


def _one(raw: object) -> str:
    if not isinstance(raw, str):
        raise TagError("a tag must be a string")
    tag = _SPACES.sub(" ", unicodedata.normalize("NFC", raw)).strip()
    if not 1 <= len(tag) <= MAX_LENGTH:
        raise TagError(f"tag {raw!r} must be 1-{MAX_LENGTH} characters", raw)
    if "," in tag:
        raise TagError(f"tag {raw!r} must not contain a comma", raw)
    if any(unicodedata.category(c) == "Cc" for c in tag):
        raise TagError(f"tag {raw!r} must not contain control characters", raw)
    return tag


def normalize_tags(raw: Iterable[object] | None) -> list[str]:
    """Trim, collapse spaces, NFC; reject bad tags; merge duplicates (first kept); at most 10."""
    if raw is None:
        return []
    if isinstance(raw, str):
        raise TagError("tags must be a list")
    tags = list(dict.fromkeys(_one(item) for item in raw))
    if len(tags) > MAX_TAGS:
        raise TagError(f"at most {MAX_TAGS} tags")
    return tags


@dataclass(frozen=True)
class TagUse:
    tag: str
    color: str
    templates: int
    documents: int


class Tags:
    """Colours and usage counts. Raw SQL on the shared pool, like the other modules."""

    def __init__(self, db: AsyncConnectionPool) -> None:
        self._db = db

    async def list(self) -> list[TagUse]:
        """Every tag in use on a template or a document, busiest first, then by name."""
        async with self._db.connection() as conn:
            cur = await conn.execute(
                "WITH used AS ("
                " SELECT tag, sum(t)::int AS templates, sum(d)::int AS documents FROM ("
                "  SELECT unnest(tags) AS tag, 1 AS t, 0 AS d FROM templates"
                "  UNION ALL SELECT unnest(tags), 0, 1 FROM documents) x GROUP BY tag) "
                "SELECT u.tag, coalesce(c.color, 'gray'), u.templates, u.documents "
                "FROM used u LEFT JOIN tag_colors c USING (tag) "
                "ORDER BY u.templates + u.documents DESC, u.tag LIMIT %s",
                (_LIST_LIMIT,),
            )
            return [TagUse(*row) for row in await cur.fetchall()]

    async def set_color(self, tag: str, color: str) -> tuple[str, str]:
        """Colour belongs to the tag name. `gray` deletes the row. A tag nobody uses can be coloured."""
        (name,) = normalize_tags([tag])
        if color not in COLORS:
            raise TagError(f"color must be one of {', '.join(COLORS)}")
        async with self._db.connection() as conn:
            if color == "gray":
                await conn.execute("DELETE FROM tag_colors WHERE tag = %s", (name,))
            else:
                await conn.execute(
                    "INSERT INTO tag_colors (tag, color) VALUES (%s, %s) "
                    "ON CONFLICT (tag) DO UPDATE SET color = EXCLUDED.color",
                    (name, color),
                )
        return name, color
