"""Wrap rendered parts for the engine: index.html, header/footer CSS, page setup (SPEC-binder.md)."""

from __future__ import annotations

from collections.abc import Iterable, Mapping

from ..engine_client import PageSetup
from ..report_definition.model import ReportJson
from ..report_definition.problems import AssetInfo

# thead repeats on every page and rows may split across pages (spike M0, decision D3)
BASE_CSS = "thead { display: table-header-group; }\ntr { break-inside: auto; }\n"
# v1.8: a background image for lining boxes up is never printed; free layout counts from the sheet's edge
GUIDE_CSS = '[data-jd="guide"] { display: none; }\n'
# v1.15.2: a QR code or barcode sits on the top of its line, with no descender gap under it (as the designer draws it)
FREE_CSS = 'body { margin: 0; }\n[data-jd="page"] { overflow: hidden; }\n[data-jd="box"] svg { vertical-align: top; }\n'
# v1.14: a blank form's empty rows get a line to write on, even in a table drawn without borders;
# in a table with solid borders (border-collapse) the solid line wins, so nothing changes there
BLANK_CSS = 'tr[data-jd="blank"] > td { border-bottom: 1px dotted #777; }\n'


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
        f"<style>\n{css}{BASE_CSS}{GUIDE_CSS}{BLANK_CSS}"
        f"{FREE_CSS if report.page.layout == 'free' else ''}</style>\n"
        f"</head><body>\n{body}\n</body></html>\n"
    )


def header_footer_html(part: str, report: ReportJson) -> str:
    # engine fonts by name only, @font-face is ignored there (D1); border-box fixes layout (spike round 2)
    families = report.fonts.headerFooter
    font = f" font-family: {font_stack(families)};" if families else ""
    return f"<style>body {{ box-sizing: border-box;{font} }}</style>\n{part}"


def page_setup(report: ReportJson) -> PageSetup:
    page = report.page
    m = page.effective_margins()
    width, height = page.portrait_mm()
    return PageSetup(
        width_mm=width,
        height_mm=height,
        landscape=page.orientation == "landscape",
        single_page=page.size == "roll",
        margin_top_mm=m["top"],
        margin_bottom_mm=m["bottom"],
        margin_left_mm=m["left"],
        margin_right_mm=m["right"],
    )
