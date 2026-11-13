"""Spike M0 runner: render fixture variants through EngineClient, check, and record evidence.

Run from apps/api:  GOTENBERG_URL=http://localhost:3000 uv run python ../../spikes/m0/run_spike.py --case sp-b --runs 3
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import importlib.util
import io
import json
import os
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

from jester_api.engine_client import EngineClient, EngineError, PageSetup, RenderFile
from pypdf import PdfReader

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from common import FONTS, Variant  # noqa: E402

OUT = HERE / "out"
CASES = ["_smoke", "sp-b", "sp-a", "sp-c"]
VM = os.environ.get("SPIKE_VM", "root@10.0.1.29")
# image under test; official 9.4.1 = sha256:7d790c08..., jester/gotenberg:9.4.1-th1 adds TH Sarabun New
DIGEST = os.environ.get("SPIKE_IMAGE", "jester/gotenberg:9.4.1-th1 sha256:ab7478a2fef19abad868d64b65de4fad0cb2a394e0d5d56a56e67879a10b1eec")


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def norm(s: str) -> str:
    return re.sub(r"\s+", "", unicodedata.normalize("NFC", s))


def load_variants(case: str) -> list[Variant]:
    spec = importlib.util.spec_from_file_location(f"case_{case}", HERE / "fixtures" / case / "case.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod.variants()


def embedded_fonts(reader: PdfReader) -> list[str]:
    names: set[str] = set()

    def walk(res, depth=0):
        if not res or depth > 6:
            return
        res = res.get_object()
        for f in (res.get("/Font") or {}).values():
            names.add(str(f.get_object().get("/BaseFont")))
        for x in (res.get("/XObject") or {}).values():
            walk(x.get_object().get("/Resources"), depth + 1)

    for p in reader.pages:
        walk(p.get("/Resources"))
    return sorted(names)


def check(v: Variant, pages_text: list[str], fonts: list[str]) -> dict:
    full = "\n".join(pages_text)
    nfull = norm(full)
    e = v.expect
    res: dict = {}
    if e.ids:
        counts = {i: len(re.findall(rf"(?<![\w-]){re.escape(i)}(?![\w-])", full)) for i in e.ids}
        bad = {i: c for i, c in counts.items() if c != 1}
        res["L1_ids"] = {"pass": not bad, "expected": len(e.ids), "not_exactly_once": dict(list(bad.items())[:20])}
    if e.every_page:
        missing = {m: [n + 1 for n, t in enumerate(pages_text) if m not in t] for m in e.every_page}
        res["L1_every_page"] = {"pass": not any(missing.values()), "pages_missing": missing}
    if e.totals:
        miss = [t for t in e.totals if t not in full]
        res["L2_totals"] = {"pass": not miss, "missing": miss}
    if e.thai:
        miss = [t for t in e.thai if norm(t) not in nfull]
        res["L3_thai_pypdf"] = {"pass": not miss, "missing": miss}
    res["L3_no_replacement_char"] = {"pass": "�" not in full}
    if e.fonts:
        miss = [f for f in e.fonts if not any(f in name for name in fonts)]
        res["L3_fonts"] = {"pass": not miss, "missing": miss, "embedded": fonts}
    res["pages"] = {"pass": len(pages_text) >= e.min_pages, "count": len(pages_text), "min": e.min_pages}
    return res


async def render_variant(client: EngineClient, case: str, v: Variant, runs: int) -> dict:
    assets = [RenderFile(f, (FONTS / f).read_bytes()) for f in v.font_files]
    inputs = {"index.html": sha(v.index_html.encode())}
    if v.header_html:
        inputs["header.html"] = sha(v.header_html.encode())
    if v.footer_html:
        inputs["footer.html"] = sha(v.footer_html.encode())
    inputs.update({a.name: sha(a.content) for a in assets})
    record: dict = {"variant": v.name, "note": v.note, "inputs_sha256": inputs, "runs": []}
    vdir = OUT / case / v.name
    vdir.mkdir(parents=True, exist_ok=True)
    (vdir / "index.html").write_text(v.index_html, encoding="utf-8")
    for r in range(1, runs + 1):
        try:
            res = await client.convert_html(
                v.index_html.encode(),
                page=PageSetup(landscape=v.landscape),
                header_html=v.header_html.encode() if v.header_html else None,
                footer_html=v.footer_html.encode() if v.footer_html else None,
                assets=assets,
            )
        except EngineError as exc:
            record["runs"].append(
                {"run": r, "error": {"code": exc.code, "status": exc.http_status, "message": exc.message}}
            )
            continue
        (vdir / f"run-{r}.pdf").write_bytes(res.pdf)
        reader = PdfReader(io.BytesIO(res.pdf))
        pages_text = [p.extract_text() or "" for p in reader.pages]
        fonts = embedded_fonts(reader)
        record["runs"].append(
            {
                "run": r,
                "pdf_sha256": sha(res.pdf),
                "duration_ms": res.duration_ms,
                "trace": res.trace,
                "pages_text_sha256": [sha(t.encode()) for t in pages_text],
                "checks": check(v, pages_text, fonts),
            }
        )
        if r == 1:
            record["options"] = res.options
            (vdir / "run-1.pypdf.txt").write_text("\n\f\n".join(pages_text), encoding="utf-8")
    ok_runs = [x for x in record["runs"] if "checks" in x]
    record["deterministic_text"] = len({tuple(x["pages_text_sha256"]) for x in ok_runs}) <= 1
    record["all_checks_pass"] = bool(ok_runs) and all(
        c["pass"] for x in ok_runs for c in x["checks"].values()
    )
    return record


def vm_postprocess(case: str) -> None:
    """Rasterise run-1 PDFs and extract text with poppler on the VM (dev tooling only)."""
    local = OUT / case
    remote = f"/tmp/jester-spike/{case}"
    subprocess.run(["ssh", VM, f"rm -rf {remote} && mkdir -p {remote}"], check=True)
    dirs = [p.name for p in local.iterdir() if p.is_dir()]
    # relative paths + cwd: Windows scp treats "D:\..." as a host name
    subprocess.run(["scp", "-q", "-r", *dirs, f"{VM}:{remote}/"], check=True, cwd=local)
    script = (
        f"cd {remote} && for d in */; do d=${{d%/}}; f=$d/run-1.pdf; [ -f $f ] || continue; "
        "pdftoppm -r 50 -png $f $d/page; pdftotext -layout $f $d/run-1.poppler.txt; pdffonts $f > $d/run-1.pdffonts.txt; done"
    )
    subprocess.run(["ssh", VM, script], check=True)
    subprocess.run(["scp", "-q", "-r", *[f"{VM}:{remote}/{d}" for d in dirs], "."], check=True, cwd=local)


def recheck_with_poppler(case: str, manifest: dict) -> None:
    """pypdf drops some Thai marks and header/footer text; poppler is the primary extractor (plan.md)."""
    variants = {v.name: v for v in load_variants(case)}
    for rec in manifest["variants"]:
        vdir = OUT / case / rec["variant"]
        txt = vdir / "run-1.poppler.txt"
        if not txt.exists():
            continue
        pages = txt.read_text(encoding="utf-8").split("")
        if pages and not pages[-1].strip():
            pages = pages[:-1]
        fonts_txt = (vdir / "run-1.pdffonts.txt").read_text(encoding="utf-8").splitlines()[2:]
        fonts = [line.split()[0] for line in fonts_txt if line.strip()]
        rec["checks_poppler"] = check(variants[rec["variant"]], pages, fonts)
        rec["all_checks_pass"] = all(c["pass"] for c in rec["checks_poppler"].values())
        print(f"{case}/{rec['variant']} (poppler): {'PASS' if rec['all_checks_pass'] else 'FAIL'}")


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--case", choices=[*CASES, "all"], default="all")
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--no-vm", action="store_true")
    args = ap.parse_args()
    cases = [c for c in CASES if c != "_smoke"] if args.case == "all" else [args.case]
    async with EngineClient(os.environ["GOTENBERG_URL"], timeout_s=90) as client:
        health = await client.health()
        if not health.up:
            sys.exit(f"engine not up: {health.details}")
        for case in cases:
            manifest = {
                "case": case,
                "engine": {"version": health.version, "image_digest": DIGEST},
                "fonts_sha256": {f.name: sha(f.read_bytes()) for f in sorted(FONTS.glob("*.ttf"))},
                "variants": [],
            }
            for v in load_variants(case):
                rec = await render_variant(client, case, v, args.runs)
                manifest["variants"].append(rec)
                status = "PASS" if rec["all_checks_pass"] else "FAIL"
                print(f"{case}/{v.name}: {status} deterministic={rec['deterministic_text']}")
            (OUT / case).mkdir(parents=True, exist_ok=True)
            (OUT / case / "manifest.json").write_text(
                json.dumps(manifest, ensure_ascii=False, indent=2, default=str), encoding="utf-8"
            )
            if not args.no_vm:
                vm_postprocess(case)
                recheck_with_poppler(case, manifest)
            (OUT / case / "manifest.json").write_text(
                json.dumps(manifest, ensure_ascii=False, indent=2, default=str), encoding="utf-8"
            )


if __name__ == "__main__":
    asyncio.run(main())
