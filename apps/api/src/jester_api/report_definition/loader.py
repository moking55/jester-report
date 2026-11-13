from __future__ import annotations

import hashlib
from dataclasses import dataclass

from .data_schema import DataSchema, check_data
from .lint import lint_templates
from .model import ReportJson, parse_report_json
from .problems import DefinitionInput, Problem, error, has_errors
from .refs import CheckedExpressions, check_expressions

REQUIRED_FILES = ("report.json", "template.html")


@dataclass(frozen=True)
class ReportDefinition:
    report: ReportJson
    data: DataSchema
    expressions: CheckedExpressions
    template_files: tuple[str, ...]  # .html/.css files the binder sends to the engine


@dataclass(frozen=True)
class DefinitionResult:
    definition: ReportDefinition | None  # None when any problem is an error
    problems: list[Problem]
    sha256: str


def definition_sha256(inp: DefinitionInput) -> str:
    """Hash over (name, content hash) of every file and asset, independent of dict order."""
    lines = [f"f\0{name}\0{hashlib.sha256(text.encode()).hexdigest()}" for name, text in inp.files.items()]
    lines += [f"a\0{name}\0{asset.sha256}" for name, asset in inp.assets.items()]
    return hashlib.sha256("\n".join(sorted(lines)).encode()).hexdigest()


def load_definition(inp: DefinitionInput) -> DefinitionResult:
    """Run every check and return all problems at once (SPEC-report-definition.md)."""
    problems: list[Problem] = [
        error("FILE_MISSING", f"{name} is required", file=name)
        for name in REQUIRED_FILES
        if name not in inp.files
    ]
    report = data = checked = None
    if "report.json" in inp.files:
        report, found = parse_report_json(inp.files["report.json"])
        problems += found
    if report is not None:
        data, found = check_data(report, inp.files)
        problems += found
    if report is not None and data is not None:
        checked, found = check_expressions(report, data)
        problems += found
    problems += lint_templates(inp.files, inp.assets, report, inp.system_fonts)

    definition = None
    if report is not None and data is not None and checked is not None and not has_errors(problems):
        templates = tuple(sorted(n for n in inp.files if n.endswith((".html", ".css"))))
        definition = ReportDefinition(report, data, checked, templates)
    return DefinitionResult(definition, problems, definition_sha256(inp))
