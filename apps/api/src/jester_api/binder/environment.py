"""Sandboxed Jinja environment and render-with-problems (SPEC-binder.md)."""

from __future__ import annotations

import sys
from collections.abc import Mapping, Sequence
from types import TracebackType
from typing import Any

from jinja2 import FunctionLoader, StrictUndefined, TemplateNotFound, TemplateSyntaxError, UndefinedError
from jinja2.sandbox import SandboxedEnvironment, SecurityError

from ..data_prep import formatters
from ..report_definition.problems import Problem, error, warning

MAX_OUTPUT_BYTES = 20 * 1024 * 1024  # same limit as engine-client's request size


class TooLarge(Exception):
    pass


class BindEnvironment(SandboxedEnvironment):
    """One per bind: templates are the draft's .html files; warnings collect while rendering."""

    def __init__(self, templates: Mapping[str, str]) -> None:
        # filename = template name, so traceback frames tell us which draft file failed
        loader = FunctionLoader(
            lambda name: (templates[name], name, lambda: True) if name in templates else None
        )
        super().__init__(loader=loader, autoescape=True, undefined=StrictUndefined, finalize=self._finalize)
        self.globals.pop("lipsum", None)
        self.template_names = frozenset(templates)
        self.warnings: list[Problem] = []

    def _finalize(self, value: Any) -> Any:
        if value is None:
            return ""
        if isinstance(value, Mapping | Sequence) and not isinstance(value, str):
            where = _caller_location(self.template_names)
            if not any(w.file == where[0] and w.line == where[1] for w in self.warnings):
                self.warnings.append(
                    warning(
                        "TEMPLATE_PRINTS_OBJECT",
                        "prints a whole object or list; pick a field such as data.customer.name",
                        file=where[0],
                        line=where[1],
                    )
                )
            return ""
        return value


def _caller_location(names: frozenset[str]) -> tuple[str | None, int | None]:
    frame = sys._getframe(2)
    while frame is not None:
        template = frame.f_globals.get("__jinja_template__")
        if template is not None and template.name in names:
            return template.name, template.get_corresponding_lineno(frame.f_lineno)
        frame = frame.f_back
    return None, None


def _location(exc: BaseException, names: frozenset[str], fallback: str) -> tuple[str, int | None]:
    """Innermost traceback frame in a draft file (Jinja rewrites template frames to template lines)."""
    found: tuple[str, int | None] = (fallback, None)
    tb: TracebackType | None = exc.__traceback__
    while tb is not None:
        if tb.tb_frame.f_code.co_filename in names:
            found = (tb.tb_frame.f_code.co_filename, tb.tb_lineno)
        tb = tb.tb_next
    return found


def _problem(exc: Exception, name: str, names: frozenset[str]) -> Problem:
    if isinstance(exc, TemplateSyntaxError):
        return error(
            "TEMPLATE_SYNTAX", exc.message or "template syntax error", file=exc.name or name, line=exc.lineno
        )
    file, line = _location(exc, names, name)
    if isinstance(exc, UndefinedError):
        # messages name the attribute and the object type only, never a value
        return error("TEMPLATE_UNDEFINED", exc.message or "undefined value", file=file, line=line)
    if isinstance(exc, SecurityError):
        return error("TEMPLATE_UNSAFE", str(exc), file=file, line=line)
    if isinstance(exc, TemplateNotFound):
        return error(
            "TEMPLATE_ERROR", f"included template {exc.name!r} is not in the draft", file=file, line=line
        )
    if isinstance(exc, ValueError) and _raised_in(exc, formatters.__file__):
        return error("TEMPLATE_ERROR", f"formatter: {exc}", file=file, line=line)
    return error("TEMPLATE_ERROR", f"{type(exc).__name__} while rendering", file=file, line=line)


def _raised_in(exc: BaseException, path: str) -> bool:
    tb = exc.__traceback__
    while tb is not None and tb.tb_next is not None:
        tb = tb.tb_next
    return tb is not None and tb.tb_frame.f_code.co_filename == path


def render(
    env: BindEnvironment, name: str, context: Mapping[str, Any], budget: int
) -> tuple[str | None, list[Problem]]:
    """Render one draft file, streaming, stopping once output passes `budget` bytes."""
    out: list[str] = []
    size = 0
    try:
        for chunk in env.get_template(name).generate(context):
            size += len(chunk.encode("utf-8"))
            if size > budget:
                raise TooLarge
            out.append(chunk)
    except TooLarge:
        return None, [error("OUTPUT_TOO_LARGE", "rendered documents are larger than 20 MB", file=name)]
    except Exception as exc:  # every template failure becomes a problem; nothing reaches the caller raw
        return None, [_problem(exc, name, env.template_names)]
    return "".join(out), []
