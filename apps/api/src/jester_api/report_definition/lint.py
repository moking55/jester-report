"""Static checks of template files (SPEC-report-definition.md "กติกาตรวจ template").

Targeted regexes on comment-masked text, plus Jinja2's own parser. Not a full HTML/CSS parser:
the engine's failOn* options are the second line of defence for missing files.
"""

from __future__ import annotations

import re
from collections.abc import Mapping

from jinja2 import Environment, TemplateSyntaxError, meta

from .model import ReportJson
from .problems import AssetInfo, Problem, error, pointer, warning

TEMPLATE_VARS = frozenset({"params", "data", "lists", "totals", "fmt", "meta"})
HEADER_FOOTER = ("header.html", "footer.html")
GENERIC_FAMILIES = frozenset(
    {"serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "inherit", "initial", "unset"}
)
_ENV = Environment()
_ALLOWED_VARS = TEMPLATE_VARS | set(_ENV.globals)

_COMMENTS = re.compile(r"<!--.*?-->|\{#.*?#\}|/\*.*?\*/", re.S)
_TFOOT = re.compile(r"<tfoot\b", re.I)
_FONT_FACE = re.compile(r"@font-face\b", re.I)
_FONT_FAMILY = re.compile(r"font-family\s*:\s*([^;}<\"]+(?:\"[^\"]*\"[^;}<\"]*)*)", re.I)
# resources the engine loads: src=, <link href=>, CSS url(); <a href> is only a link in the PDF
_REFS = re.compile(
    r"""<link\b[^>]*?\bhref\s*=\s*["']([^"']*)["']|\bsrc\s*=\s*["']([^"']*)["']|url\(\s*["']?([^"')\s]+)""",
    re.I,
)
EXTERNAL = re.compile(r"^(?:[a-z][a-z0-9+.-]*:|//)", re.I)


def mask(text: str) -> str:
    """Blank out comments but keep line numbers."""
    return _COMMENTS.sub(lambda m: re.sub(r"[^\n]", " ", m.group()), text)


def _line(text: str, index: int) -> int:
    return text.count("\n", 0, index) + 1


def _families(value: str) -> list[str]:
    out = []
    for raw in value.split(","):
        name = raw.strip().strip("\"'").strip()
        if (
            name
            and "{" not in name
            and name.casefold() not in GENERIC_FAMILIES
            and not name.startswith("var(")
        ):
            out.append(name)
    return out


def _font_known(family: str, fonts: frozenset[str] | None) -> bool | None:
    if fonts is None:
        return None
    return family.casefold() in {f.casefold() for f in fonts}


def _check_html(name: str, text: str, known: set[str]) -> list[Problem]:
    problems: list[Problem] = []
    try:
        ast = _ENV.parse(text)
    except TemplateSyntaxError as exc:
        return [error("TEMPLATE_SYNTAX", exc.message or "template syntax error", file=name, line=exc.lineno)]
    for var in sorted(meta.find_undeclared_variables(ast) - _ALLOWED_VARS):
        idx = re.search(rf"\b{re.escape(var)}\b", text)
        problems.append(
            error(
                "TEMPLATE_UNKNOWN_VAR",
                f"{var!r} is not available; use one of {', '.join(sorted(TEMPLATE_VARS))}",
                file=name,
                line=_line(text, idx.start()) if idx else None,
            )
        )
    for ref in meta.find_referenced_templates(ast):
        if ref is not None and ref not in known:
            problems.append(
                error("FILE_MISSING", f"included template {ref!r} is not in the draft", file=name)
            )
    return problems


def _check_text(name: str, text: str, known: set[str], fonts: frozenset[str] | None) -> list[Problem]:
    masked = mask(text)
    problems: list[Problem] = []
    for m in _TFOOT.finditer(masked):
        problems.append(
            error(
                "TFOOT_FORBIDDEN",
                "<tfoot> repeats on every page; put totals in a normal row (decision D4)",
                file=name,
                line=_line(masked, m.start()),
            )
        )
    for m in _REFS.finditer(masked):
        target = next(g for g in m.groups() if g is not None).strip()
        if not target or target.startswith(("data:", "#")) or "{{" in target or "{%" in target:
            continue
        where = {"file": name, "line": _line(masked, m.start())}
        if EXTERNAL.match(target):
            problems.append(error("EXTERNAL_URL", f"external reference {target!r} is not allowed", **where))
        elif target not in known:
            problems.append(error("FILE_MISSING", f"{target!r} is not in the draft or its assets", **where))
    if name in HEADER_FOOTER:
        for m in _FONT_FACE.finditer(masked):
            problems.append(
                error(
                    "HEADER_FONT_FACE",
                    "@font-face is ignored in header/footer; use an engine font (decision D1)",
                    file=name,
                    line=_line(masked, m.start()),
                )
            )
        for m in _FONT_FAMILY.finditer(masked):
            for family in _families(m.group(1)):
                problems += _font_problem(family, fonts, file=name, line=_line(masked, m.start()))
    return problems


def _font_problem(family: str, fonts: frozenset[str] | None, **where: object) -> list[Problem]:
    state = _font_known(family, fonts)
    if state is None:
        return [warning("FONT_UNVERIFIED", f"could not check font {family!r}: engine fonts unknown", **where)]
    if state is False:
        return [error("FONT_MISSING", f"font {family!r} is not installed in the engine", **where)]
    return []


def engine_font_candidates(files: Mapping[str, str], report: ReportJson | None) -> set[str]:
    """Font families whose presence in the engine matters: report.json fonts and header/footer CSS.

    render-service probes exactly these before calling load_definition with `system_fonts`.
    """
    found: set[str] = set()
    if report is not None:
        found.update(report.fonts.body)
        found.update(report.fonts.headerFooter)
    for name in HEADER_FOOTER:
        if name in files:
            for m in _FONT_FAMILY.finditer(mask(files[name])):
                found.update(_families(m.group(1)))
    return found


def _check_declared_fonts(report: ReportJson, assets: Mapping[str, AssetInfo], fonts: frozenset[str] | None):
    asset_families = {a.font_family.casefold() for a in assets.values() if a.font_family}
    problems: list[Problem] = []
    for i, family in enumerate(report.fonts.body):
        if family.casefold() in asset_families:
            continue
        problems += _font_problem(family, fonts, file="report.json", pointer=pointer(("fonts", "body", i)))
    for i, family in enumerate(report.fonts.headerFooter):
        problems += _font_problem(
            family, fonts, file="report.json", pointer=pointer(("fonts", "headerFooter", i))
        )
    return problems


def lint_templates(
    files: Mapping[str, str],
    assets: Mapping[str, AssetInfo],
    report: ReportJson | None,
    system_fonts: frozenset[str] | None,
) -> list[Problem]:
    known = set(files) | set(assets)
    problems: list[Problem] = []
    if "index.html" in files:
        problems.append(
            error(
                "RESERVED_NAME",
                "index.html is generated from template.html; rename this file",
                file="index.html",
            )
        )
    for name in sorted(files):
        if name.endswith(".html"):
            problems += _check_html(name, files[name], known)
        if name.endswith((".html", ".css")):
            problems += _check_text(name, files[name], known, system_fonts)
    if report is not None:
        problems += _check_declared_fonts(report, assets, system_fonts)
    return problems
