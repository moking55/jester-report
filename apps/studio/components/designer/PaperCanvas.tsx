"use client";

import { createPortal } from "react-dom";
import { createElement, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { Block, BlockList } from "@/lib/doc-blocks";
import { BASE_CSS, fontFaces, renderSource, scopeReportCss, type RenderMode } from "@/lib/doc-render";
import { lookup, test, type Scope } from "@/lib/doc-sample";
import { readStyle } from "@/lib/doc-edit";
import { pageBreaks, paperOf, PX_PER_MM } from "@/lib/paper";
import type { Rect } from "@/lib/doc-blocks";
import type { RenderBox } from "./FreeCanvas";

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
  part?: "body" | "header" | "footer"; // which file `blocks` and `src` are (v1.8); the others are drawn as they are
  onZone?: (part: "body" | "header" | "footer") => void; // double-click on a zone opens it; while one is edited, a double-click on the document goes back to the body
  // a free-layout sheet (v1.8): how a box is drawn (selection, handles), a rect that replaces its own while it is dragged,
  // lines drawn over the sheet (snap guides), and a click on the empty sheet
  renderBox?: RenderBox;
  placed?: (b: Block) => Rect | undefined;
  overlay?: React.ReactNode;
  onPage?: () => void;
  guide?: boolean; // show the guide picture of a free sheet (never printed)
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
.jd-margin { position: absolute; left: 0; right: 0; overflow: hidden; color: #555; }
.jd-margin.jd-zone-hint { color: #9aa; font: 11px system-ui; display: grid; place-items: center; cursor: pointer; }
.jd-margin.jd-zone-live { overflow: visible; z-index: 2; outline: 2px solid #f0a020; background: #fffdf5; }
.jd-dim { opacity: .4; pointer-events: none; }
.pageNumber::before { content: "1"; }
.totalPages::before { content: "N"; }
.jd-margin-label { position: absolute; right: 4px; top: 2px; font: 10px system-ui; color: #9aa; }
.jd-body { position: relative; display: flow-root; } /* the page's content box; holds the document's margins */
.jd-doc { margin: 8px; } /* Chromium's default body margin, which the PDF has too; report.css may change it */
.jd-break { position: absolute; left: -8mm; right: -8mm; border-top: 1px dashed #d33; pointer-events: none; }
.jd-break span { position: absolute; right: 0; top: -14px; font: 10px system-ui; color: #d33; background: #fff; padding: 0 4px; }
[data-jd-page] img[data-jd="guide"] { pointer-events: none; user-select: none; }
.jd-fbox.jd-outside { outline: 2px dashed #d33; }
.jd-fbox.jd-over { outline: 2px dashed #d33; outline-offset: 0; }
.jd-fbox.jd-over::after { content: "ข้อความล้นกล่อง"; position: absolute; left: 0; top: 100%; font: 10px system-ui; color: #fff; background: #d33; padding: 0 4px; white-space: nowrap; z-index: 3; }
.jd-fbox { box-sizing: border-box; cursor: move; touch-action: none; user-select: none; }
.jd-fbox:hover { outline: 1px solid #b9cdf0; }
.jd-fbox.jd-selected { outline: 2px solid #2f6fe0; z-index: 1; }
.jd-fbox.jd-moving { opacity: .85; }
.jd-fbox img { -webkit-user-drag: none; user-select: none; }
.jd-fbox[data-kind="line"]::before { content: ""; position: absolute; left: 0; right: 0; top: -2mm; bottom: -2mm; }
.jd-rh { position: absolute; width: 9px; height: 9px; margin: -5px 0 0 -5px; box-sizing: border-box; background: #fff;
  border: 1px solid #2f6fe0; border-radius: 2px; touch-action: none; z-index: 4; }
.jd-rh-nw { left: 0; top: 0; cursor: nwse-resize; } .jd-rh-n { left: 50%; top: 0; cursor: ns-resize; }
.jd-rh-ne { left: 100%; top: 0; cursor: nesw-resize; } .jd-rh-e { left: 100%; top: 50%; cursor: ew-resize; }
.jd-rh-se { left: 100%; top: 100%; cursor: nwse-resize; } .jd-rh-s { left: 50%; top: 100%; cursor: ns-resize; }
.jd-rh-sw { left: 0; top: 100%; cursor: nesw-resize; } .jd-rh-w { left: 0; top: 50%; cursor: ew-resize; }
.jd-gl { position: absolute; pointer-events: none; z-index: 5; border: 0 solid #e0357a; }
.jd-gl-x { top: 0; bottom: 0; border-left-width: 1px; } .jd-gl-y { left: 0; right: 0; border-top-width: 1px; }
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

export function PaperCanvas({ src, blocks, files, templateId, sample, frame, list, editor, cellEditor, onCell, part = "body", onZone, renderBox, placed, overlay, onPage, guide = true }: Props) {
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

  // header.html / footer.html bring their own <style> (body { … }): it applies to their zone
  const zoneCss = (["header", "footer"] as const)
    .map((z) =>
      [...(files[`${z}.html`] ?? "").matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => scopeReportCss(m[1], `.jd-zone-${z}`)).join("\n"),
    )
    .join("\n");
  const css = `${PAPER_CSS}${fontFaces(files["report.json"]).split("\n").slice(2).join("\n")}${BASE_CSS}${scopeReportCss(files["report.css"] ?? "")}\n${zoneCss}`;

  const renderList = (l: BlockList, scope: Scope | null, id: string): React.ReactNode => {
    const children = l.items.filter(visible).map((b) => renderBlock(b, scope));
    if (list) return list({ list: l, id, children });
    return children.length ? children : <div className="jd-empty">ว่าง</div>;
  };

  const leaf = (b: Block, scope: Scope | null) => (
    <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: renderSource(src.slice(b.start, b.end), mode, scope) }} />
  );

  const renderBlock = (b: Block, scope: Scope | null, bare = false): React.ReactNode => {
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
      case "table": {
        const d = b.detail.kind === "table" ? b.detail : null;
        if (!d?.detailRow || !own) {
          inner = <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: tableHtml(src, b, mode, scope) }} />;
          break;
        }
        // a table with a detail row: rows are drawn here so the detail cell can hold blocks of its own (SPEC v1.8)
        const slice = (r: { start: number; end: number }) => src.slice(r.start, r.end);
        const cells = (cs: { range: { start: number; end: number } }[], sc: Scope | null) => cs.map((c) => renderSource(slice(c.range), mode, sc)).join("");
        const thead = own.children.find((c) => c.kind === "element" && c.name === "thead");
        const attrOf = (name: string) => own.attrs.find((a) => a.name === name)?.value ?? undefined;
        const items = scope ? lookup(scope, d.loop.iterable) : null;
        const per: (Scope | null)[] = scope && Array.isArray(items) ? items.map((item, i) => ({ ...scope, [d.loop.variable]: item, loop: { index: i + 1 } })) : [null];
        inner = (
          <table style={styleObject(attrOf("style") ?? "")} className={attrOf("class")}>
            {thead && thead.kind === "element" && (
              <thead dangerouslySetInnerHTML={{ __html: renderSource(src.slice(thead.open.end, thead.close ? thead.close.start : thead.end), mode, scope) }} />
            )}
            <tbody>
              {per.flatMap((sc, i) => [
                <tr key={`r${i}`} dangerouslySetInnerHTML={{ __html: cells(d.cells, sc) }} />,
                <tr key={`d${i}`} data-jd="detail">
                  <td colSpan={d.cells.length}>{renderList(b.lists[0].list, sc, listId(b, 0))}</td>
                </tr>,
              ])}
              {d.footer.map((f, i) => (
                <tr key={`f${i}`} dangerouslySetInnerHTML={{ __html: cells(f, scope) }} />
              ))}
            </tbody>
          </table>
        );
        break;
      }
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
      case "page": {
        // the one sheet of a free layout: boxes drawn where their style puts them, in stacking order
        const own = b.node.kind === "element" ? b.node : null;
        const at = (name: string) => own?.attrs.find((a) => a.name === name)?.value ?? undefined;
        inner = (
          <div data-jd-page className={at("class")} style={styleObject(at("style") ?? "")} onClick={(e) => e.target === e.currentTarget && onPage?.()}>
            {b.lists[0].list.items.filter(visible).map((x) => renderBlock(x, scope))}
            {overlay}
          </div>
        );
        break;
      }
      case "box":
      case "rect":
      case "line": {
        const at = (name: string) => own?.attrs.find((a) => a.name === name)?.value ?? undefined;
        const over = placed?.(b);
        const style = {
          ...styleObject(at("style") ?? ""),
          ...(over ? { left: `${over.x}mm`, top: `${over.y}mm`, width: `${over.w}mm`, ...(b.kind === "line" ? {} : { height: `${over.h}mm` }) } : {}),
        };
        const kids = b.kind === "box" ? b.lists[0].list.items.filter(visible).map((x) => renderBlock(x, scope, true)) : null;
        const cls = at("class");
        inner = renderBox ? renderBox({ block: b, style, className: cls, children: kids }) : <div style={style} className={cls}>{kids}</div>;
        return <FrameKey key={`${b.path.join(".")}@${b.start}`}>{inner}</FrameKey>;
      }
      case "guide":
        return <FrameKey key={`${b.path.join(".")}@${b.start}`}>{guide ? leaf(b, scope) : null}</FrameKey>;
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
    return frame && !bare && b.kind !== "page" ? <FrameKey key={key}>{frame({ block: b, children: inner })}</FrameKey> : <FrameKey key={key}>{inner}</FrameKey>;
  };

  /**
   * The header or footer zone (SPEC v1.8): drawn as it prints; double-click to edit it. While it is the file being
   * edited (`part`) its blocks are the paper's list, with selection and drop slots; an absent file shows a hint.
   */
  const margin = (zone: "header" | "footer") => {
    if (!runningParts) return null;
    const name = `${zone}.html` as const;
    const top = zone === "header";
    const place = { [top ? "top" : "bottom"]: 0, height: `${top ? paper.margins.top : paper.margins.bottom}mm` };
    if (part === zone)
      return (
        <div className={`jd-margin jd-zone-live jd-zone-${zone}`} data-jd-zone={zone} style={{ ...place, minHeight: place.height, height: "auto" }}>
          {renderList(blocks, sample, "root")}
        </div>
      );
    if (!onZone && !files[name]) return null;
    const open = () => part !== zone && onZone?.(zone);
    if (!files[name])
      return (
        <div className="jd-margin jd-zone-hint" style={place} onDoubleClick={open}>
          ดับเบิลคลิกเพื่อเพิ่ม{top ? "หัวกระดาษ" : "ท้ายกระดาษ"}
        </div>
      );
    return (
      <div className={`jd-margin jd-zone-${zone}`} style={place} onDoubleClick={open} title={onZone ? "ดับเบิลคลิกเพื่อแก้" : undefined}>
        <div dangerouslySetInnerHTML={{ __html: renderSource(files[name], mode) }} />
      </div>
    );
  };

  return (
    <div ref={host} data-paper>
      {root &&
        createPortal(
          <>
            <style>{css}</style>
            <div
              className="jd-sheet"
              onDoubleClick={(e) => part !== "body" && !(e.target as Element).closest(".jd-margin") && onZone?.("body")} // like Word: back to the document
              style={{
                width: `${paper.widthMm}mm`,
                minHeight: `${sheetMin}mm`,
                padding: `${paper.margins.top}mm ${paper.margins.right}mm ${paper.margins.bottom}mm ${paper.margins.left}mm`,
              }}
            >
              {margin("header")}
              <div ref={body} className="jd-body" style={{ width: `${paper.contentWidthMm}mm` }}>
                <div
                  className={part === "body" ? "jd-doc" : "jd-doc jd-dim"}
                  style={paper.layout === "free" ? { margin: 0 } : undefined}
                  {...(part === "body" ? {} : { dangerouslySetInnerHTML: { __html: renderSource(files["template.html"] ?? "", mode) } })}
                >
                  {part === "body" ? renderList(blocks, sample, "root") : undefined}
                </div>
                {breaks.map((at, i) => (
                  <div key={at} className="jd-break" style={{ top: `${at}px` }}>
                    <span>หน้า {i + 2}</span>
                  </div>
                ))}
              </div>
              {margin("footer")}
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
