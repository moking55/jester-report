"""Wrap rendered parts for the engine: index.html, header/footer CSS, page setup (SPEC-binder.md)."""

from __future__ import annotations

from collections.abc import Iterable, Mapping

from ..engine_client import PageSetup
from ..report_definition.model import ReportJson
from ..report_definition.problems import AssetInfo

# thead repeats on every page and rows may split across pages (spike M0, decision D3)
BASE_CSS = "thead { display: table-header-group; }\ntr { break-inside: auto; }\n"


def css_string(value: str) -> str:
    """Quoted CSS string that cannot end the string or the <style> element."""
    escaped = value.replace("\\", "\\\\").replace('"', '\\"').replace("<", "\\3c ").replace("\n", " ")
    return f'"{escaped}"'


def font_stack(families: Iterable[str]) -> str:
    # only what the author declared: a missing font is an error, never a silent fallback (D2)
    return ", ".join(css_string(f) for f in families)


def _font_faces(families: list[str], assets: Mapping[str, AssetInfo]) -> str:
    wanted = {f.casefold() for f in families}
    return "".join(
        f"@font-face {{ font-family: {css_string(info.font_family)}; src: url({css_string(name)}); }}\n"
        for name, info in sorted(assets.items())
        if info.font_family and info.font_family.casefold() in wanted
    )


def index_html(body: str, report: ReportJson, assets: Mapping[str, AssetInfo]) -> str:
    css = (
        _font_faces(report.fonts.body, assets) + f"body {{ font-family: {font_stack(report.fonts.body)}; }}\n"
    )
    return (
        '<!doctype html>\n<html lang="th"><head><meta charset="utf-8">\n'
        f"<style>\n{css}{BASE_CSS}</style>\n</head><body>\n{body}\n</body></html>\n"
    )


def header_footer_html(part: str, report: ReportJson) -> str:
    # engine fonts by name only, @font-face is ignored there (D1); border-box fixes layout (spike round 2)
    families = report.fonts.headerFooter
    font = f" font-family: {font_stack(families)};" if families else ""
    return f"<style>body {{ box-sizing: border-box;{font} }}</style>\n{part}"


def page_setup(report: ReportJson) -> PageSetup:
    m = report.page.marginsMm
    return PageSetup(
        landscape=report.page.orientation == "landscape",
        margin_top_mm=m.top,
        margin_bottom_mm=m.bottom,
        margin_left_mm=m.left,
        margin_right_mm=m.right,
    )
