#!/usr/bin/env python3
"""Check a Jester report folder and pack it as a zip that Jester Studio imports ("นำเข้า (.zip)").

    python jester_pack.py <folder> --id <template-id> [--name "ชื่อรายงาน"] [--out <file.zip>] [--params '{"k": "v"}']

Always: the checks the import does (names, sizes, required files, JSON that parses, samples that parse).
When the Jester api package is importable (run from apps/api with `uv run python …`, or set JESTER_API_SRC to
apps/api/src), it also runs Jester's own checks: load_definition → prepare(sample) → bind, exactly as Validate does.
Exit code 0 = zip written; 1 = problems found (nothing written).
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import stat
import sys
import zipfile
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path

TEXT_FILE = re.compile(r"^(?!index\.html$)[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.(html|json|css)$")
ASSET_FILE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.(png|jpe?g|svg|webp|avif|bmp|ttf|otf)$")
TEMPLATE_ID = re.compile(r"^[a-z0-9][a-z0-9-]{1,62}$")
MAX_TEXT, MAX_ASSET, MAX_DRAFT, MAX_FILES = 1 << 20, 5 << 20, 20 << 20, 50
ENGINE_FONTS = frozenset({"TH Sarabun New"})
FIXED_TIME = (1980, 1, 1, 0, 0, 0)


def basic_checks(folder: Path) -> tuple[dict[str, str], dict[str, bytes], list[str]]:
    problems: list[str] = []
    files: dict[str, str] = {}
    assets: dict[str, bytes] = {}
    for path in sorted(folder.iterdir()):
        if path.is_dir() or path.name.startswith("."):
            problems.append(f"{path.name}: subfolders and hidden files are not allowed in a report (flat layout)")
            continue
        raw = path.read_bytes()
        if TEXT_FILE.match(path.name):
            if len(raw) > MAX_TEXT:
                problems.append(f"{path.name}: text files are at most 1 MB")
            try:
                files[path.name] = raw.decode("utf-8")
            except UnicodeDecodeError:
                problems.append(f"{path.name}: not UTF-8")
        elif ASSET_FILE.match(path.name):
            if len(raw) > MAX_ASSET:
                problems.append(f"{path.name}: assets are at most 5 MB")
            assets[path.name] = raw
        elif path.name == "index.html":
            problems.append("index.html is reserved (the binder makes it from template.html): rename it")
        else:
            problems.append(f"{path.name}: not a report file (.html .json .css) or asset (png jpg svg webp avif bmp ttf otf)")
    if len(files) > MAX_FILES or len(assets) > MAX_FILES:
        problems.append(f"at most {MAX_FILES} text files and {MAX_FILES} assets")
    if sum(len(v.encode()) for v in files.values()) + sum(len(v) for v in assets.values()) > MAX_DRAFT:
        problems.append("the whole report is larger than 20 MB")
    for required in ("report.json", "template.html"):
        if required not in files:
            problems.append(f"{required} is required")
    for name, text in files.items():
        if name.endswith(".json"):
            try:
                json.loads(text)
            except json.JSONDecodeError as exc:
                problems.append(f"{name}:{exc.lineno}:{exc.colno}: invalid JSON: {exc.msg}")
    if "<tfoot" in "".join(t for n, t in files.items() if n.endswith(".html")).lower():
        problems.append("<tfoot> is not allowed (Chromium repeats it on every page): put totals in <tbody> or after the table")
    return files, assets, problems


def default_params(report: dict) -> dict:
    """A value of the right type for every required parameter, like Studio's Preview."""
    today = date.today().isoformat()
    sample = {"string": "SAMPLE", "integer": 1, "decimal": "1", "boolean": False, "date": today}
    out = {}
    for name, spec in (report.get("parameters") or {}).items():
        if not isinstance(spec, dict) or not spec.get("required"):
            continue
        out[name] = (spec.get("values") or [""])[0] if spec.get("type") == "enum" else sample.get(spec.get("type"), "")
    return out


def jester_checks(files: dict[str, str], assets: dict[str, bytes], params: dict | None) -> list[str] | None:
    """Jester's real validate + trial bind; None when the jester_api package is not importable."""
    src = os.environ.get("JESTER_API_SRC")
    if src:
        sys.path.insert(0, src)
    try:
        from jester_api.binder import bind
        from jester_api.data_prep import prepare
        from jester_api.report_definition import DefinitionInput, load_definition
        from jester_api.template_store.assets import detect
    except ImportError:
        return None

    def show(p) -> str:
        where = ":".join(str(x) for x in (p.file, p.line) if x) or (p.pointer or "")
        return f"{p.severity.upper()} {p.code} {where}: {p.message}"

    out: list[str] = []
    infos = {}
    for name, raw in assets.items():
        try:
            infos[name] = detect(name, raw)
        except Exception as exc:  # noqa: BLE001 - StoreError: bytes do not match the extension
            out.append(f"ERROR ASSET {name}: {getattr(exc, 'message', exc)}")
    loaded = load_definition(DefinitionInput(files, infos, ENGINE_FONTS))
    out += [show(p) for p in loaded.problems]
    if loaded.definition is None:
        return out
    report = json.loads(files["report.json"])
    use = params if params is not None else default_params(report)
    for sample_name in report["data"]["samples"]:
        data = json.loads(files[sample_name], parse_float=Decimal)
        prepared = prepare(loaded.definition, use, data, {"templateId": "check", "version": None})
        out += [f"[{sample_name}] {show(p)}" for p in prepared.problems]
        if prepared.prepared is None:
            continue
        bound = bind(loaded.definition, files, infos, prepared.prepared)
        out += [f"[{sample_name}] {show(p)}" for p in bound.problems]
    return out


def pack(files: dict[str, str], assets: dict[str, bytes], template_id: str, name: str) -> bytes:
    manifest = {
        "formatVersion": 1,
        "id": template_id,
        "name": name,
        "source": {"kind": "draft", "revision": 1},
        "exportedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "files": sorted(files),
        "assets": [{"name": n, "sha256": hashlib.sha256(assets[n]).hexdigest()} for n in sorted(assets)],
    }
    entries = {"jester.json": json.dumps(manifest, ensure_ascii=False, indent=2).encode()}
    entries |= {n: t.encode() for n, t in files.items()} | assets
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for entry in sorted(entries):
            info = zipfile.ZipInfo(entry, FIXED_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            zf.writestr(info, entries[entry])
    return out.getvalue()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("folder", type=Path)
    parser.add_argument("--id", required=True, help="template id, e.g. receipt (a-z 0-9 -, 2-63 characters)")
    parser.add_argument("--name", help="report name; default: report.json name")
    parser.add_argument("--out", type=Path, help="zip path; default: <folder>/../<id>.zip")
    parser.add_argument("--params", help="JSON object of parameters for the trial bind; default: sample values")
    args = parser.parse_args(argv)

    if not TEMPLATE_ID.match(args.id):
        print(f"--id {args.id!r}: use a-z, 0-9 and -, 2-63 characters, starting with a letter or digit")
        return 1
    files, assets, problems = basic_checks(args.folder)
    if not problems:
        params = json.loads(args.params, parse_float=Decimal) if args.params else None
        checked = jester_checks(files, assets, params)
        if checked is None:
            print("note: Jester's own checks did not run (jester_api not importable); run from apps/api with "
                  "`uv run python …` or set JESTER_API_SRC, or press Validate in Studio after import")
        else:
            problems += [p for p in checked if not p.startswith("WARNING") and "] WARNING" not in p]
            for warning in (p for p in checked if p not in problems):
                print(warning)
    if problems:
        print("\n".join(problems))
        print(f"\n{len(problems)} problem(s): nothing written")
        return 1
    report_name = args.name or json.loads(files["report.json"]).get("name") or args.id
    out = args.out or args.folder.resolve().parent / f"{args.id}.zip"
    out.write_bytes(pack(files, assets, args.id, report_name))
    print(f"ok: {out} ({len(files)} files, {len(assets)} assets)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
