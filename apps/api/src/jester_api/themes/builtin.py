"""The token allow-list and the built-in themes. A theme is only these values; never raw CSS."""

from __future__ import annotations

import re
from typing import Any

from ..report_definition.problems import Problem, error

COLOR_KEYS = (
    "color.background",
    "color.surface",
    "color.surfaceAlt",
    "color.border",
    "color.text",
    "color.textMuted",
    "color.primary",
    "color.onPrimary",
    "color.danger",
    "color.warning",
    "color.success",
)
FONTS = ("TH Sarabun New", "Sarabun", "Noto Sans Thai", "system-ui")
CHOICES = {"font.family": FONTS, "shadow": ("none", "soft", "strong"), "density": ("compact", "comfortable")}
RANGES = {"font.size": (12, 18), "radius": (0, 16)}
TOKEN_KEYS = (*COLOR_KEYS, "font.family", "font.size", "radius", "shadow", "density")
HEX = re.compile(r"#[0-9a-fA-F]{6}")


def check_tokens(tokens: Any) -> list[Problem]:
    """Every problem points at /tokens/<key>; an empty list means the tokens are safe to put in CSS."""
    if not isinstance(tokens, dict):
        return [error("INPUT_INVALID", "tokens must be an object", pointer="/tokens")]
    problems = [
        error("INPUT_INVALID", f"unknown token {key!r}", pointer=f"/tokens/{key}")
        for key in tokens
        if key not in TOKEN_KEYS
    ]
    for key in TOKEN_KEYS:
        where = f"/tokens/{key}"
        if key not in tokens:
            problems.append(error("INPUT_INVALID", f"{key} is required", pointer=where))
            continue
        value = tokens[key]
        if key in COLOR_KEYS:
            ok = isinstance(value, str) and HEX.fullmatch(value) is not None
            rule = "a colour like #1E90D6"
        elif key in RANGES:
            low, high = RANGES[key]
            ok = type(value) is int and low <= value <= high  # not bool, not 14.5
            rule = f"a whole number from {low} to {high}"
        else:
            ok = value in CHOICES[key]
            rule = "one of " + ", ".join(CHOICES[key])
        if not ok:
            problems.append(error("INPUT_INVALID", f"{key} must be {rule}", pointer=where))
    return problems


# mahasamut: the default, modern business in indigo blue; classic: the Aero look of design/studio-mvp.html;
# suriyan: design/studio-suriyan.html. Listed in this order.
BUILTIN: dict[str, dict[str, Any]] = {
    "mahasamut": {
        "name": "Mahasamut",
        "tokens": {
            "color.background": "#f2f6fa",
            "color.surface": "#ffffff",
            "color.surfaceAlt": "#edf3f9",
            "color.border": "#d6e1ec",
            "color.text": "#0d1b33",
            "color.textMuted": "#566a84",
            "color.primary": "#155fa8",
            "color.onPrimary": "#ffffff",
            "color.danger": "#c8372d",
            "color.warning": "#b26b00",
            "color.success": "#1d8656",
            "font.family": "Noto Sans Thai",
            "font.size": 14,
            "radius": 8,
            "shadow": "soft",
            "density": "comfortable",
        },
    },
    "classic": {
        "name": "Classic",
        "tokens": {
            "color.background": "#c8ecff",
            "color.surface": "#f4fbff",
            "color.surfaceAlt": "#e2f2fc",
            "color.border": "#9cc6e2",
            "color.text": "#12324a",
            "color.textMuted": "#4a6a80",
            "color.primary": "#1e90d6",
            "color.onPrimary": "#ffffff",
            "color.danger": "#c0281c",
            "color.warning": "#a26a00",
            "color.success": "#2e8b23",
            "font.family": "Sarabun",
            "font.size": 14,
            "radius": 4,
            "shadow": "strong",
            "density": "compact",
        },
    },
    "suriyan": {
        "name": "Suriyan",
        "tokens": {
            "color.background": "#f5f6f8",
            "color.surface": "#ffffff",
            "color.surfaceAlt": "#f1f3f6",
            "color.border": "#e3e7ed",
            "color.text": "#18212d",
            "color.textMuted": "#5d6878",
            "color.primary": "#d9730d",
            "color.onPrimary": "#ffffff",
            "color.danger": "#d0342c",
            "color.warning": "#b7791f",
            "color.success": "#1f8a4c",
            "font.family": "Noto Sans Thai",
            "font.size": 14,
            "radius": 8,
            "shadow": "soft",
            "density": "comfortable",
        },
    },
}
