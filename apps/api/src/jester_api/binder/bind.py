"""bind(): template files + prepared view model -> files for the engine (SPEC-binder.md)."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from ..data_prep import Prepared
from ..engine_client import PageSetup, RenderFile
from ..report_definition.loader import ReportDefinition
from ..report_definition.problems import AssetInfo, Problem, has_errors
from .document import header_footer_html, index_html, page_setup
from .environment import MAX_OUTPUT_BYTES, BindEnvironment, render
from .resources import check_resources

PARTS = ("template.html", "header.html", "footer.html")


@dataclass(frozen=True)
class Bound:
    index_html: bytes
    header_html: bytes | None
    footer_html: bytes | None
    files: tuple[RenderFile, ...]  # text files the documents use (e.g. report.css)
    asset_names: tuple[str, ...]  # assets the documents use; render-service fetches their bytes
    page: PageSetup


@dataclass(frozen=True)
class BindResult:
    bound: Bound | None  # None when any problem is an error
    problems: list[Problem]


def bind(
    definition: ReportDefinition,
    files: Mapping[str, str],
    assets: Mapping[str, AssetInfo],
    prepared: Prepared,
) -> BindResult:
    report = definition.report
    env = BindEnvironment({n: t for n, t in files.items() if n.endswith(".html")})
    context = prepared.template_context()
    problems: list[Problem] = []
    rendered: dict[str, str] = {}
    budget = MAX_OUTPUT_BYTES  # for all parts together
    for name in PARTS:
        if name not in files and name != "template.html":  # template.html missing is reported, not skipped
            continue
        out, found = render(env, name, context, budget)
        problems += found  # every part is rendered, so all their errors come back at once
        if out is not None:
            rendered[name] = out
            budget -= len(out.encode("utf-8"))
    problems += env.warnings
    if has_errors(problems):
        return BindResult(None, problems)

    documents = {"template.html": index_html(rendered["template.html"], report, assets)}
    for name in ("header.html", "footer.html"):
        if name in rendered:
            documents[name] = header_footer_html(rendered[name], report)
    found, used_files, used_assets = check_resources(documents, files, assets)
    problems += found
    if has_errors(problems):
        return BindResult(None, problems)

    def encoded(name: str) -> bytes | None:
        return documents[name].encode("utf-8") if name in documents else None

    bound = Bound(
        index_html=documents["template.html"].encode("utf-8"),
        header_html=encoded("header.html"),
        footer_html=encoded("footer.html"),
        files=tuple(RenderFile(n, files[n].encode("utf-8")) for n in used_files),
        asset_names=used_assets,
        page=page_setup(report),
    )
    return BindResult(bound, problems)
