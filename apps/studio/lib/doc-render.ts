// Drawing a template's pieces on the Document Designer's paper (SPEC-studio.md "v1.7"): source → HTML to show.
// Jinja never runs: an expression is a chip (or its sample value, when lib/doc-sample can tell), tags of
// inline conditions are chips (or the matching branch with the sample), comments and other tags disappear.
// Only text the template already holds is shown; sample values are escaped.

import { evaluate, test, type Scope } from "./doc-sample";
import { parse, type Node } from "./doc-parse";

export type RenderMode = { sample: Scope | null; asset: (name: string) => string };

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const chip = (cls: string, text: string) => `<span class="jd-chip ${cls}">${escapeHtml(text)}</span>`;

/** The first argument of a call (up to a top-level comma), for sizing a code from its sample text. */
function firstArg(args: string): string {
  let depth = 0;
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === "," && depth === 0) return args.slice(0, i);
  }
  return args;
}

/**
 * A QR code or barcode drawn as a box of its printed size (data_prep/codes.py), so the paper keeps the PDF's layout
 * where the sample cannot draw the code itself; null for any other expression.
 */
export function codeBox(expr: string, scope: Scope): string | null {
  const m = /^fmt\.(qr|barcode)\(([\s\S]*)\)$/.exec(expr.trim());
  if (!m) return null;
  const num = (name: string, fallback: number) => Number(new RegExp(`\\b${name}\\s*=\\s*([\\d.]+)`).exec(m[2])?.[1] ?? fallback);
  let w: number;
  let h: number;
  if (m[1] === "qr") {
    w = h = num("size_mm", 30);
  } else {
    const text = evaluate(firstArg(m[2]), scope);
    const n = text.ok ? text.text.length : 10;
    w = num("module_mm", 0.3) * (11 * n + 35 + 20); // Code 128: start, data, check, stop + quiet zones
    h = num("height_mm", 12);
  }
  // an <svg> like the real one, so report.css rules for svg (display: block, …) apply to it the same way
  const [ww, label] = [+w.toFixed(2), m[1] === "qr" ? "QR" : "barcode"];
  return `<svg class="jd-code-box" xmlns="http://www.w3.org/2000/svg" width="${ww}mm" height="${h}mm"><rect width="100%" height="100%" fill="#f4f5f8" stroke="#889" stroke-dasharray="4 3"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="10" font-family="system-ui" fill="#667">${label}</text></svg>`;
}

/** With a sample, what cannot be worked out shows short (a call by its name), so it takes about a value's room. */
export const shortLabel = (expr: string) => {
  const call = /^([\w.]+)\(/.exec(expr.trim());
  return call ? `${call[1].split(".").pop()}(…)` : (expr.trim().split(/[.\s|]/).filter(Boolean).pop() ?? expr);
};

/** A relative asset name (logo.png) as Studio's asset URL; anything else (http:, data:, /x) is left as is. */
function rewriteSrc(html: string, asset: (name: string) => string): string {
  return html.replace(/(<img\b[^>]*?\ssrc\s*=\s*)(["'])([^"'{}]+)\2/gi, (all, head: string, q: string, name: string) =>
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) ? `${head}${q}${escapeHtml(asset(name))}${q}` : all,
  );
}

/** HTML for a piece of template source (a block, a cell, a branch). */
export function renderSource(src: string, mode: RenderMode, scope: Scope | null = mode.sample): string {
  const root = parse(src);
  const out: string[] = [];
  const walk = (n: Node, sc: Scope | null) => {
    switch (n.kind) {
      case "root":
        n.children.forEach((c) => walk(c, sc));
        break;
      case "text":
      case "html-comment":
        out.push(n.kind === "text" ? src.slice(n.start, n.end) : "");
        break;
      case "comment":
      case "stray":
        break;
      case "expr": {
        const shown = sc ? evaluate(n.inner, sc) : null;
        const box = sc && !shown?.ok ? codeBox(n.inner, sc) : null;
        out.push(shown?.ok ? escapeHtml(shown.text) : (box ?? (sc ? chip("jd-expr jd-unknown", shortLabel(n.inner)) : chip("jd-expr", `{{ ${n.inner} }}`))));
        break;
      }
      case "stmt":
        out.push(sc ? "" : chip("jd-tag", `{% ${n.inner} %}`));
        break;
      case "element":
        out.push(src.slice(n.open.start, n.open.end));
        n.children.forEach((c) => walk(c, sc));
        if (n.close) out.push(src.slice(n.close.start, n.close.end));
        break;
      case "block": {
        if (n.keyword === "if" && sc) {
          // the first branch whose test holds; unknown → every branch (as without a sample)
          let chosen = -1;
          let known = true;
          for (let i = 0; i < n.branches.length; i++) {
            const b = n.branches[i];
            if (b.tag.keyword === "else") {
              chosen = i;
              break;
            }
            const t = test(b.tag.inner.replace(/^(el)?if\s+/, ""), sc);
            if (t === undefined) {
              known = false;
              break;
            }
            if (t) {
              chosen = i;
              break;
            }
          }
          if (known) {
            if (chosen >= 0) n.branches[chosen].children.forEach((c) => walk(c, sc));
            break;
          }
        }
        for (const b of n.branches) {
          out.push(chip("jd-tag", `{% ${b.tag.inner} %}`));
          b.children.forEach((c) => walk(c, sc));
        }
        if (n.close) out.push(chip("jd-tag", `{% ${n.close.inner} %}`));
        break;
      }
    }
  };
  walk(root, scope);
  return rewriteSrc(out.join(""), mode.asset);
}

/** report.css for the paper: rules for `body` apply to the document root instead (there is no body in a shadow root). */
export const scopeReportCss = (css: string) => css.replace(/(^|[\s,}])body(?=[\s,{.:#[])/g, "$1.jd-doc");

/** @font-face for the fonts the report uses that Studio serves (TH Sarabun New, as the engine has it). */
export function fontFaces(reportJson: string | undefined): string {
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((f): f is string => typeof f === "string") : []);
  let body: string[] = [];
  let margins: string[] = [];
  try {
    const r = JSON.parse(reportJson ?? "{}") as { fonts?: { body?: unknown; headerFooter?: unknown } };
    body = list(r.fonts?.body);
    margins = list(r.fonts?.headerFooter);
  } catch {
    body = [];
  }
  const faces = [
    `@font-face { font-family: "TH Sarabun New"; src: url("/fonts/THSarabunNew-Regular.ttf"); font-weight: normal; }`,
    `@font-face { font-family: "TH Sarabun New"; src: url("/fonts/THSarabunNew-Bold.ttf"); font-weight: bold; }`,
  ];
  const stack = (fs: string[]) => (fs.length ? fs.map((f) => JSON.stringify(f)).join(", ") : '"TH Sarabun New"');
  return `${faces.join("\n")}\n.jd-doc { font-family: ${stack(body)}; }\n.jd-margin { font-family: ${stack(margins.length ? margins : body)}; }\n`;
}

/** What binder adds to every document (binder/document.py BASE_CSS), so the paper lays out like the PDF. */
export const BASE_CSS = "thead { display: table-header-group; }\ntr { break-inside: auto; }\n";
