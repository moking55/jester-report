"""Check rendered documents before they reach the engine (SPEC-binder.md step 5).

The rule is an allow-list: every resource the engine would load must be exactly a draft file or an asset
(or a `data:` URI / `#fragment`). Anything else - external URL, internal host, encoded trick - is rejected,
so data values cannot make the engine fetch something. The engine's allow-list is the second layer.
"""

from __future__ import annotations

import html
import re
from collections.abc import Iterable, Mapping

from ..report_definition.lint import EXTERNAL, mask
from ..report_definition.problems import Problem, error

_TAG = re.compile(r"<\s*([a-z][a-z0-9:-]*)\b((?:[^>\"']|\"[^\"]*\"|'[^']*')*)>", re.I)
_ATTR = re.compile(r"""([^\s=/>"']+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?""")
_CSS_REF = re.compile(
    r"""url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)|@import\s+(?:"([^"]*)"|'([^']*)')""", re.I
)
# attributes that make the engine load something; href only outside <a> (a link in the PDF is fine)
_LOADS = frozenset(
    {"src", "srcset", "poster", "data", "background", "action", "formaction", "xlink:href", "href"}
)


def _first(groups: Iterable[str | None]) -> str:
    return next((g for g in groups if g is not None), "")


class _Scan:
    def __init__(self, text_files: Mapping[str, str], assets: Iterable[str]) -> None:
        self.text_files = {n: t for n, t in text_files.items() if not n.endswith(".html")}
        self.assets = frozenset(assets)
        self.problems: list[Problem] = []
        self.used_files: set[str] = set()
        self.used_assets: set[str] = set()

    def _target(self, target: str, file: str, line: int | None, what: str) -> None:
        target = target.strip()
        if not target or target.startswith("#") or target.lower().startswith("data:"):
            return
        if target in self.assets:
            self.used_assets.add(target)
        elif target in self.text_files:
            if target not in self.used_files:
                self.used_files.add(target)
                self.css(target, self.text_files[target])
        else:
            kind = (
                "an external address"
                if EXTERNAL.match(target)
                else "something that is not a draft file or asset"
            )
            # never echo the target: it may come from caller data
            self.problems.append(error("RESOURCE_NOT_ALLOWED", f"{what} loads {kind}", file=file, line=line))

    def css(self, name: str, text: str) -> None:
        masked = mask(text)
        static = not name.endswith(".html")  # rendered html has no template line numbers
        for m in _CSS_REF.finditer(masked):
            line = masked.count("\n", 0, m.start()) + 1 if static else None
            self._target(html.unescape(_first(m.groups())), name, line, "CSS url()/@import")

    def html(self, name: str, text: str) -> None:
        masked = mask(text)
        for tag in _TAG.finditer(masked):
            tag_name = tag.group(1).lower()
            if tag_name == "script":
                self.problems.append(error("SCRIPT_NOT_ALLOWED", "<script> is not allowed", file=name))
            elif tag_name == "tfoot":
                self.problems.append(
                    error(
                        "TFOOT_FORBIDDEN", "<tfoot> repeats on every page; use a normal row (D4)", file=name
                    )
                )
            for attr in _ATTR.finditer(tag.group(2)):
                key = attr.group(1).lower()
                value = html.unescape(_first(attr.groups()[1:]))
                if key.startswith("on"):
                    self.problems.append(
                        error("SCRIPT_NOT_ALLOWED", f"<{tag_name} {key}> is not allowed", file=name)
                    )
                elif key == "srcdoc":
                    self.problems.append(
                        error("RESOURCE_NOT_ALLOWED", f"<{tag_name} srcdoc> is not allowed", file=name)
                    )
                elif key in _LOADS and not (key == "href" and tag_name == "a"):
                    targets = (
                        [c.split()[0] for c in value.split(",") if c.split()] if key == "srcset" else [value]
                    )
                    for target in targets:
                        self._target(target, name, None, f"<{tag_name} {key}>")
        # <style> elements and style="" attributes
        self.css(name, text)


def check_resources(
    parts: Mapping[str, str], text_files: Mapping[str, str], assets: Iterable[str]
) -> tuple[list[Problem], tuple[str, ...], tuple[str, ...]]:
    """parts: rendered documents keyed by draft file. Returns problems, used text files, used assets.

    Line numbers are only given for problems inside static CSS files; rendered output has no template lines.
    """
    scan = _Scan(text_files, assets)
    for name, text in parts.items():
        scan.html(name, text)
    return scan.problems, tuple(sorted(scan.used_files)), tuple(sorted(scan.used_assets))
