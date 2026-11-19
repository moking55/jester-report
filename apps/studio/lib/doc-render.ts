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
        out.push(shown?.ok ? escapeHtml(shown.text) : chip("jd-expr", `{{ ${n.inner} }}`));
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
  let families: string[] = [];
  try {
    const r = JSON.parse(reportJson ?? "{}") as { fonts?: { body?: unknown } };
    families = Array.isArray(r.fonts?.body) ? (r.fonts!.body as unknown[]).filter((f): f is string => typeof f === "string") : [];
  } catch {
    families = [];
  }
  const faces = [
    `@font-face { font-family: "TH Sarabun New"; src: url("/fonts/THSarabunNew-Regular.ttf"); font-weight: normal; }`,
    `@font-face { font-family: "TH Sarabun New"; src: url("/fonts/THSarabunNew-Bold.ttf"); font-weight: bold; }`,
  ];
  const stack = families.length ? families.map((f) => JSON.stringify(f)).join(", ") : '"TH Sarabun New"';
  return `${faces.join("\n")}\n.jd-doc { font-family: ${stack}; }\n`;
}

/** What binder adds to every document (binder/document.py BASE_CSS), so the paper lays out like the PDF. */
export const BASE_CSS = "thead { display: table-header-group; }\ntr { break-inside: auto; }\n";
