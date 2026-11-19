"use client";

import { createPortal } from "react-dom";
import { createElement, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { Block, BlockList } from "@/lib/doc-blocks";
import { BASE_CSS, fontFaces, renderSource, scopeReportCss, type RenderMode } from "@/lib/doc-render";
import { lookup, test, type Scope } from "@/lib/doc-sample";
import { readStyle } from "@/lib/doc-edit";
import { pageBreaks, paperOf, PX_PER_MM } from "@/lib/paper";

// The A4 paper of the Document Designer (SPEC-studio.md "v1.7"): a shadow root keeps report.css away from
// Studio's styles; blocks are drawn by React from the block tree (lib/doc-blocks), so later steps can wrap them
// with selection and drag handles. Containers (rows, conditions, loops) recurse; leaves render their source.

export type Files = Record<string, string>;

export type BlockFrame = (props: { block: Block; children: React.ReactNode }) => React.ReactNode;
export type ListFrame = (props: { list: BlockList; id: string; children: React.ReactNode[] }) => React.ReactNode;

/** Blocks drawn on the paper: comments, macros, {% set %} and the stylesheet link keep their place but draw nothing. */
export const visible = (b: Block) => b.render;

/** A list's id: "root" for the page, `<block path>/<list index>` inside a block. */
export const listId = (block: Block | null, index: number) => (block ? `${block.path.join(".")}/${index}` : "root");

type Props = {
  src: string; // template.html as it is now
  blocks: BlockList;
  files: Files; // report.json, report.css, header.html, footer.html
  templateId: string;
  sample: Scope | null; // null: show expressions
  frame?: BlockFrame; // wraps each block (selection, drag handle) — T7
  editor?: (block: Block) => React.ReactNode | null; // the text block being typed in, drawn instead — T8
  cellEditor?: (block: Block, row: number, col: number) => React.ReactNode | null; // a fixed table's cell being typed in
  onCell?: (block: Block, row: number, col: number) => void; // double-click on a fixed table's cell
  list?: ListFrame; // wraps each list's children (drop slots) — T7
};

const asset = (templateId: string) => (name: string) => `/assets/${templateId}?name=${encodeURIComponent(name)}`;

/** style="…" as a React style object (unknown or invalid declarations dropped). */
export function styleObject(css: string): React.CSSProperties {
  const out: Record<string, string> = {};
  for (const [k, v] of readStyle(css)) out[k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
  return out as React.CSSProperties;
}

/** Fonts must be declared on the document: Chromium ignores @font-face inside a shadow root. */
function useDocumentFonts() {
  useEffect(() => {
    if (document.getElementById("jd-fonts")) return;
    const style = document.createElement("style");
    style.id = "jd-fonts";
    style.textContent = fontFaces("{}").split("\n.jd-doc")[0];
    document.head.appendChild(style);
  }, []);
}

const PAPER_CSS = `
:host { all: initial; display: block; } /* Studio's inherited styles (line-height, font, color) stop here */
.jd-sheet { box-sizing: border-box; position: relative; background: #fff; color: #000; box-shadow: 0 2px 12px rgba(0,0,0,.18); margin: 0 auto; }
.jd-margin { position: absolute; left: 0; right: 0; overflow: hidden; color: #555; pointer-events: none; }
.jd-margin-label { position: absolute; right: 4px; top: 2px; font: 10px system-ui; color: #9aa; }
.jd-body { position: relative; display: flow-root; } /* the page's content box; holds the document's margins */
.jd-doc { margin: 8px; } /* Chromium's default body margin, which the PDF has too; report.css may change it */
.jd-break { position: absolute; left: -8mm; right: -8mm; border-top: 1px dashed #d33; pointer-events: none; }
.jd-break span { position: absolute; right: 0; top: -14px; font: 10px system-ui; color: #d33; background: #fff; padding: 0 4px; }
.jd-guide { position: absolute; inset: 0; outline: 1px dashed #c8d3e0; pointer-events: none; }
.jd-chip { display: inline-block; max-width: 100%; box-sizing: border-box; vertical-align: bottom; padding: 0 3px; border-radius: 4px;
  font-size: 0.85em; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } /* one line, never wider than its place */
.jd-expr { background: #e6f0ff; color: #1f4fa3; }
.jd-tag { background: #fff0db; color: #8a5300; }
.jd-editing { outline: 2px solid #f0a020; outline-offset: 2px; cursor: text; }
.jd-editing .jd-chip { user-select: all; }
.jd-editing .jd-if { cursor: pointer; }
.jd-container { position: relative; outline: 1px dashed #9db4d6; outline-offset: 2px; min-height: 8mm; }
.jd-container-label { display: block; font: 10px system-ui; color: #5b7aa5; margin: 2px 0; }
.jd-custom { position: relative; outline: 1px dashed #b98; outline-offset: 2px; }
.jd-custom-label { position: absolute; right: 0; top: -14px; font: 10px system-ui; color: #a76; background: #fff; padding: 0 3px; }
.jd-empty { font: 11px system-ui; color: #9aa; padding: 2mm; }
.jd-list { min-height: 6mm; }
.jd-block { position: relative; border-radius: 2px; }
.jd-block:hover { outline: 1px solid #b9cdf0; }
.jd-block.jd-selected { outline: 2px solid #2f6fe0; z-index: 1; }
.jd-block.jd-lifted { position: absolute; visibility: hidden; pointer-events: none; }
.jd-block.jd-faded { opacity: .35; }
.jd-handle { position: absolute; left: -7mm; top: 0; width: 5mm; height: 5mm; display: none; place-items: center;
  border: 1px solid #b9cdf0; border-radius: 3px; background: #fff; color: #2f6fe0; font: 12px system-ui; cursor: grab; touch-action: none; padding: 0; }
.jd-block:hover > .jd-handle, .jd-block.jd-selected > .jd-handle { display: grid; }
.jd-col-handle { position: absolute; width: 7px; margin-left: -3px; cursor: col-resize; z-index: 3; touch-action: none; }
.jd-col-handle:hover { background: rgba(47,111,224,.35); }
.jd-slot, .jd-slot-bad { display: grid; place-items: center; min-height: 8mm; margin: 1mm 0; border: 2px dashed #2f6fe0;
  border-radius: 3px; background: rgba(47,111,224,.08); color: #2f6fe0; font: 600 11px system-ui; }
.jd-slot-bad { border-color: #d33; background: rgba(221,51,51,.08); color: #d33; }
`;

export function PaperCanvas({ src, blocks, files, templateId, sample, frame, list, editor, cellEditor, onCell }: Props) {
  useDocumentFonts();
  const host = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<ShadowRoot | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);
  const paper = useMemo(() => paperOf(files["report.json"]), [files]);
  const mode: RenderMode = useMemo(() => ({ sample, asset: asset(templateId) }), [sample, templateId]);

  useLayoutEffect(() => {
    if (host.current && !root) setRoot(host.current.shadowRoot ?? host.current.attachShadow({ mode: "open" }));
  }, [root]);

  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBodyHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [root]);

  // a roll is one sheet as tall as its content, and a free layout is one sheet: no page breaks
  const pageHeightPx = paper.contentHeightMm * PX_PER_MM;
  const breaks = paper.roll || paper.layout === "free" ? [] : pageBreaks(bodyHeight, pageHeightPx);
  const pages = breaks.length + 1;
  const sheetMin = paper.roll ? 30 : paper.heightMm * pages; // mm
  const runningParts = !paper.roll && paper.layout === "flow"; // header.html / footer.html show on sheets of pages only

  const css = `${PAPER_CSS}${fontFaces(files["report.json"]).split("\n").slice(2).join("\n")}${BASE_CSS}${scopeReportCss(files["report.css"] ?? "")}`;

  const renderList = (l: BlockList, scope: Scope | null, id: string): React.ReactNode => {
    const children = l.items.filter(visible).map((b) => renderBlock(b, scope));
    if (list) return list({ list: l, id, children });
    return children.length ? children : <div className="jd-empty">ว่าง</div>;
  };

  const leaf = (b: Block, scope: Scope | null) => (
    <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: renderSource(src.slice(b.start, b.end), mode, scope) }} />
  );

  const renderBlock = (b: Block, scope: Scope | null): React.ReactNode => {
    let inner: React.ReactNode;
    const own = b.node.kind === "element" ? b.node : null;
    switch (b.kind) {
      case "row": {
        const style = own ? styleObject(own.attrs.find((a) => a.name === "style")?.value ?? "") : {};
        inner = (
          <div style={style} className={own?.attrs.find((a) => a.name === "class")?.value ?? undefined}>
            {b.lists.map((l, i) => {
              const col = own?.children.filter((c) => c.kind === "element")[i];
              const colAttr = (name: string) => (col && col.kind === "element" ? (col.attrs.find((a) => a.name === name)?.value ?? "") : "");
              return (
                <div key={l.key} style={styleObject(colAttr("style"))} className={`jd-container ${colAttr("class")}`.trim()}>
                  {renderList(l.list, scope, listId(b, i))}
                </div>
              );
            })}
          </div>
        );
        break;
      }
      case "condition": {
        const d = b.detail.kind === "condition" ? b.detail : null;
        let only = -1;
        if (scope && d) {
          only = d.branches.findIndex((br) => br.keyword === "else" || test(br.test, scope) === true);
          if (d.branches.some((br, i) => i < (only < 0 ? d.branches.length : only) && br.keyword !== "else" && test(br.test, scope) === undefined)) only = -2;
        }
        inner =
          only >= 0 && scope ? (
            // the sample picks a branch: drawn as the PDF would draw it, with no frame or label
            <div>{renderList(b.lists[only].list, scope, listId(b, only))}</div>
          ) : (
          <div>
            {b.lists.map((l, i) =>
              only >= -1 && scope && i !== only ? null : (
                <div key={l.key} className="jd-container">
                  <span className="jd-container-label">{l.label}</span>
                  {renderList(l.list, scope, listId(b, i))}
                </div>
              ),
            )}
          </div>
          );
        break;
      }
      case "repeat": {
        const d = b.detail.kind === "repeat" ? b.detail : null;
        const items = scope && d ? lookup(scope, d.iterable) : null;
        if (scope && d && Array.isArray(items)) {
          inner = items.length
            ? items.map((item, i) => (
                <div key={i}>{renderList(b.lists[0].list, { ...scope, [d.variable]: item, loop: { index: i + 1, first: i === 0, last: i === items.length - 1 } }, listId(b, 0))}</div>
              ))
            : b.lists[1]
              ? renderList(b.lists[1].list, scope, listId(b, 1))
              : null;
        } else {
          inner = b.lists.map((l, i) => (
            <div key={l.key} className="jd-container">
              <span className="jd-container-label">{l.label}</span>
              {renderList(l.list, scope, listId(b, i))}
            </div>
          ));
        }
        break;
      }
      case "table":
        inner = <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: tableHtml(src, b, mode, scope) }} />;
        break;
      case "grid": {
        const d = b.detail.kind === "grid" ? b.detail : null;
        const attrOf = (el: { attrs: { name: string; value: string | null }[] } | null, name: string) =>
          el?.attrs.find((a) => a.name === name)?.value ?? undefined;
        inner = d && (
          <table style={styleObject(attrOf(own, "style") ?? "")} className={attrOf(own, "class")}>
            <tbody>
              {d.rows.map((row, r) => (
                <tr key={r}>
                  {row.cells.map(
                    (cell, c) =>
                      cellEditor?.(b, r, c) ??
                      createElement(cell.node.name, {
                        key: c,
                        style: styleObject(attrOf(cell.node, "style") ?? ""),
                        className: attrOf(cell.node, "class"),
                        title: onCell ? "ดับเบิลคลิกเพื่อพิมพ์" : undefined,
                        onDoubleClick: onCell ? () => onCell(b, r, c) : undefined,
                        dangerouslySetInnerHTML: { __html: renderSource(src.slice(cell.inner.start, cell.inner.end), mode, scope) },
                      }),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        );
        break;
      }
      case "custom":
        inner = (
          <div className="jd-custom">
            <span className="jd-custom-label">Custom Code</span>
            {leaf(b, scope)}
          </div>
        );
        break;
      default:
        inner = editor?.(b) ?? leaf(b, scope);
    }
    const key = `${b.path.join(".")}@${b.start}`;
    return frame ? <FrameKey key={key}>{frame({ block: b, children: inner })}</FrameKey> : <FrameKey key={key}>{inner}</FrameKey>;
  };

  const margin = (name: "header.html" | "footer.html", top: boolean) =>
    runningParts && files[name] ? (
      <div
        className="jd-margin"
        style={{ [top ? "top" : "bottom"]: 0, height: `${top ? paper.margins.top : paper.margins.bottom}mm`, padding: "2mm 0" }}
      >
        <span className="jd-margin-label">{top ? "header.html" : "footer.html"} (แก้ใน code)</span>
        <div dangerouslySetInnerHTML={{ __html: renderSource(files[name], mode) }} />
      </div>
    ) : null;

  return (
    <div ref={host} data-paper>
      {root &&
        createPortal(
          <>
            <style>{css}</style>
            <div
              className="jd-sheet"
              style={{
                width: `${paper.widthMm}mm`,
                minHeight: `${sheetMin}mm`,
                padding: `${paper.margins.top}mm ${paper.margins.right}mm ${paper.margins.bottom}mm ${paper.margins.left}mm`,
              }}
            >
              {margin("header.html", true)}
              <div ref={body} className="jd-body" style={{ width: `${paper.contentWidthMm}mm` }}>
                <div className="jd-doc" style={paper.layout === "free" ? { margin: 0 } : undefined}>
                  {renderList(blocks, sample, "root")}
                </div>
                {breaks.map((at, i) => (
                  <div key={at} className="jd-break" style={{ top: `${at}px` }}>
                    <span>หน้า {i + 2}</span>
                  </div>
                ))}
              </div>
              {margin("footer.html", false)}
            </div>
          </>,
          root as unknown as Element,
        )}
    </div>
  );
}

const FrameKey = ({ children }: { children: React.ReactNode }) => <>{children}</>;

/** A list table as HTML: the head as written, one row per sample item (or one row of expressions), the else and footer rows. */
function tableHtml(src: string, b: Block, mode: RenderMode, scope: Scope | null): string {
  if (b.detail.kind !== "table" || b.node.kind !== "element") return "";
  const d = b.detail;
  const el = b.node;
  const slice = (r: { start: number; end: number }) => src.slice(r.start, r.end);
  const cellsHtml = (cells: { range: { start: number; end: number } }[], sc: Scope | null) =>
    cells.map((c) => renderSource(slice(c.range), mode, sc)).join("");
  const tbody = el.children.find((c) => c.kind === "element" && c.name === "tbody");
  const thead = el.children.find((c) => c.kind === "element" && c.name === "thead");
  const rows: string[] = [];
  const items = scope ? lookup(scope, d.loop.iterable) : null;
  if (scope && Array.isArray(items)) {
    if (items.length === 0 && d.emptyRow) rows.push(`<tr>${cellsHtml(d.emptyRow, scope)}</tr>`);
    items.forEach((item, i) =>
      rows.push(`<tr>${cellsHtml(d.cells, { ...scope, [d.loop.variable]: item, loop: { index: i + 1 } })}</tr>`),
    );
  } else {
    rows.push(`<tr>${cellsHtml(d.cells, null)}</tr>`);
    if (d.emptyRow) rows.push(`<tr class="jd-empty-row">${cellsHtml(d.emptyRow, null)}</tr>`);
  }
  for (const f of d.footer) rows.push(`<tr>${cellsHtml(f, scope)}</tr>`);
  const tbodyOpen = tbody && tbody.kind === "element" ? slice(tbody.open) : "<tbody>";
  return `${slice(el.open)}${thead ? renderSource(slice(thead), mode, scope) : ""}${tbodyOpen}${rows.join("")}</tbody></table>`;
}
