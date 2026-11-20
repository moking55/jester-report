"use client";

import { createElement, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { ElementNode, Range } from "@/lib/doc-parse";
import { clear as clearFormat, stateAt, toggle as toggleFormat, type Format } from "@/lib/doc-format";
import { editorBus } from "@/lib/editor-bus";
import { domUnits, newChipHtml, readInlineIf, readInner, writeInlineIf, writeInner, type InlineIf } from "@/lib/doc-text";

import styles from "./Designer.module.css";
import { styleObject } from "./PaperCanvas";

// Typing in a text block on the paper (SPEC-studio.md "v1.7" ข้อความบนผืน): a contenteditable of the block's own
// element, where Jinja pieces are chips. `{{` opens a list of fields, a dropped "{{ … }}" becomes a chip, clicking an
// inline-if chip opens a popover. Leaving (Enter, Escape, clicking away) hands back the new inner source once.

export type Suggestion = { label: string; expression: string };

type Props = {
  el: ElementNode; // the element typed in: a text block, or a cell of a fixed table
  inner: Range; // its content in template.html
  src: string;
  fields: Suggestion[];
  onDone: (inner: string | null) => void; // null: nothing changed
};

/** Set while a field in the palette is pressed: the blur that follows does not end typing (it may be dropped in). */
export const keepEditing = { on: false };

/** The selection inside the paper's shadow root (window.getSelection() stops at the host). */
const selectionIn = (el: Element): Selection | null => {
  const root = el.getRootNode() as ShadowRoot & { getSelection?: () => Selection | null };
  return root.getSelection?.() ?? document.getSelection();
};

const chipNode = (raw: string): Element => {
  const t = document.createElement("template");
  t.innerHTML = newChipHtml(raw);
  return t.content.firstElementChild!;
};

/** Text holding a whole "{{ … }}" (typed or dropped) turns into a chip; the caret goes after it. */
function chipify(root: HTMLElement) {
  const sel = selectionIn(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (!(n.parentElement?.closest(".jd-chip"))) texts.push(n as Text);
  for (const t of texts) {
    const m = /\{\{[^{}]*\}\}/.exec(t.data);
    if (!m) continue;
    const after = t.splitText(m.index);
    const rest = after.splitText(m[0].length);
    const chip = chipNode(after.data);
    after.replaceWith(chip);
    if (sel) sel.collapse(rest, 0);
    chipify(root);
    return;
  }
}

/** The "{{ query" just typed before the caret, if any. */
function typedQuery(root: HTMLElement): { node: Text; start: number; query: string; rect: DOMRect } | null {
  const sel = selectionIn(root);
  if (!sel || !sel.rangeCount || !sel.isCollapsed) return null;
  const node = sel.anchorNode;
  if (!node || node.nodeType !== 3 || !root.contains(node)) return null;
  const before = (node as Text).data.slice(0, sel.anchorOffset);
  const m = /\{\{\s*([^\s{}]*)$/.exec(before); // the query may be a Thai label as well as a path
  if (!m) return null;
  return { node: node as Text, start: m.index, query: m[1], rect: sel.getRangeAt(0).getBoundingClientRect() };
}

export function TextEditor({ el, inner, src, fields, onDone }: Props) {
  const start = useMemo(() => readInner(src.slice(inner.start, inner.end)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const ref = useRef<HTMLElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const [suggest, setSuggest] = useState<{ query: string; rect: DOMRect; index: number } | null>(null);
  const [ifEdit, setIfEdit] = useState<{ chip: Element; value: InlineIf; rect: DOMRect; error: string | null } | null>(null);

  useLayoutEffect(() => {
    const e = ref.current!;
    e.innerHTML = start.html;
    e.focus();
    const sel = selectionIn(e);
    sel?.selectAllChildren(e);
    sel?.collapseToEnd();
  }, [start]);

  // the toolbar formats the selected words through this (SPEC-studio.md v1.9)
  useEffect(() => {
    const e = ref.current!;
    const range = () => {
      const sel = selectionIn(e);
      const r = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
      return sel && r && e.contains(r.commonAncestorContainer) ? { sel, r } : null;
    };
    const show = (next: globalThis.Range | null, sel: Selection) => {
      if (next) {
        sel.removeAllRanges();
        sel.addRange(next);
      }
      editorBus.notify();
    };
    editorBus.set({
      toggle: (f, color) => {
        const at = range();
        if (at && !at.r.collapsed) show(toggleFormat(e, at.r, f, color), at.sel);
      },
      clear: () => {
        const at = range();
        if (at && !at.r.collapsed) show(clearFormat(e, at.r), at.sel);
      },
      state: () => {
        const at = range();
        return at ? { selected: !at.r.collapsed, format: stateAt(e, at.r) } : null;
      },
    });
    const look = () => editorBus.notify();
    document.addEventListener("selectionchange", look);
    return () => {
      document.removeEventListener("selectionchange", look);
      editorBus.set(null);
    };
  }, []);

  // after pressing (and maybe dragging) a field from the palette, typing goes on here
  useEffect(() => {
    const back = () => {
      if (!keepEditing.on) return;
      keepEditing.on = false;
      if (!done.current) ref.current?.focus();
    };
    window.addEventListener("mouseup", back, true);
    window.addEventListener("dragend", back, true);
    return () => {
      window.removeEventListener("mouseup", back, true);
      window.removeEventListener("dragend", back, true);
    };
  }, []);

  const matches = suggest ? fields.filter((f) => `${f.label} ${f.expression}`.toLowerCase().includes(suggest.query.toLowerCase())).slice(0, 8) : [];

  function finish() {
    if (done.current || !ref.current) return;
    done.current = true;
    const next = writeInner(start.units, domUnits(ref.current));
    onDone(next === src.slice(inner.start, inner.end) ? null : next);
  }

  function pick(f: Suggestion) {
    const e = ref.current!;
    const q = typedQuery(e);
    if (q) {
      const caret = selectionIn(e)!.anchorOffset;
      const typed = q.node.splitText(q.start); // "{{ query" up to the caret, then the rest
      const rest = typed.splitText(caret - q.start);
      typed.replaceWith(chipNode(f.expression));
      selectionIn(e)?.collapse(rest, 0);
    }
    setSuggest(null);
    e.focus();
  }

  function onInput() {
    const e = ref.current!;
    chipify(e);
    const q = typedQuery(e);
    setSuggest(q ? { query: q.query, rect: q.rect, index: 0 } : null);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (suggest && matches.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const d = e.key === "ArrowDown" ? 1 : -1;
        setSuggest({ ...suggest, index: (suggest.index + d + matches.length) % matches.length });
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(matches[suggest.index]);
        return;
      }
    }
    if (e.key === "Escape" && suggest) {
      e.preventDefault();
      setSuggest(null);
      return;
    }
    const mod = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;
    const shortcut: Record<string, Format> = { b: "bold", i: "italic", u: "underline" };
    if (mod && shortcut[e.key.toLowerCase()]) {
      e.preventDefault();
      const sel = selectionIn(ref.current!);
      const r = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
      if (sel && r && !r.collapsed) {
        const next = toggleFormat(ref.current!, r, shortcut[e.key.toLowerCase()]);
        if (next) {
          sel.removeAllRanges();
          sel.addRange(next);
        }
        editorBus.notify();
      }
      return;
    }
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      document.execCommand("insertLineBreak");
      return;
    }
    if (e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      finish();
    }
  }

  /** A field dropped from the palette: a chip where it lands (after a chip it lands on). */
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const text = e.dataTransfer.getData("text/plain").trim();
    const root = ref.current!;
    if (!text) return;
    type CaretAt = (x: number, y: number, o?: { shadowRoots: ShadowRoot[] }) => { offsetNode: globalThis.Node; offset: number } | null;
    const at = (document as Document & { caretPositionFromPoint?: CaretAt }).caretPositionFromPoint?.(e.clientX, e.clientY, {
      shadowRoots: [root.getRootNode() as ShadowRoot],
    });
    const range = document.createRange();
    const onChip = (e.target as Element).closest?.(".jd-chip") ?? (at?.offsetNode.parentElement?.closest(".jd-chip") || null);
    if (onChip && root.contains(onChip)) range.setStartAfter(onChip);
    else if (at && root.contains(at.offsetNode)) range.setStart(at.offsetNode, at.offset);
    else {
      range.selectNodeContents(root);
      range.collapse(false);
    }
    const asChip = /^\{\{[^{}]*\}\}$/.test(text) || /^<span class="(pageNumber|totalPages)"><\/span>$/.test(text);
    const chip = asChip ? chipNode(text) : document.createTextNode(text);
    range.insertNode(chip);
    selectionIn(root)?.collapse(chip.parentNode!, [...chip.parentNode!.childNodes].indexOf(chip as ChildNode) + 1);
    root.focus();
  }

  function onPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
  }

  function onClick(e: React.MouseEvent) {
    const chip = (e.target as Element).closest?.(".jd-if");
    if (!chip) return;
    const value = readInlineIf(chip.getAttribute("data-jd-raw") ?? "");
    if (value) setIfEdit({ chip, value, rect: chip.getBoundingClientRect(), error: null });
  }

  function saveIf() {
    if (!ifEdit) return;
    const raw = ifEdit.chip.getAttribute("data-jd-raw") ?? "";
    const out = writeInlineIf(raw, ifEdit.value);
    if (!out.ok) return setIfEdit({ ...ifEdit, error: out.error });
    const fresh = chipNode(out.value);
    ifEdit.chip.replaceWith(fresh);
    setIfEdit(null);
    ref.current?.focus();
  }

  const setBranch = (i: number, patch: Partial<InlineIf["branches"][number]>) =>
    ifEdit && setIfEdit({ ...ifEdit, error: null, value: { branches: ifEdit.value.branches.map((b, j) => (j === i ? { ...b, ...patch } : b)) } });

  const attr = (name: string) => el?.attrs.find((a) => a.name === name)?.value ?? undefined;
  return (
    <>
      {createElement(el?.name ?? "p", {
        ref,
        className: ["jd-editing", attr("class")].filter(Boolean).join(" "),
        style: styleObject(attr("style") ?? ""),
        contentEditable: true,
        suppressContentEditableWarning: true,
        spellCheck: false,
        onInput,
        onKeyDown,
        onPaste,
        onClick,
        onDragOver: (e: React.DragEvent) => e.preventDefault(),
        onDrop,
        onBlur: (e: React.FocusEvent) => {
          if (keepEditing.on || pop.current?.contains(e.relatedTarget as Node | null) || ifEdit) return;
          finish();
        },
      })}
      {suggest &&
        matches.length > 0 &&
        createPortal(
          <div ref={pop} className={styles.suggest} style={{ left: suggest.rect.left, top: suggest.rect.bottom + 4 }} role="listbox" aria-label="ช่องข้อมูล">
            {matches.map((f, i) => (
              <button
                key={f.expression}
                type="button"
                role="option"
                aria-selected={i === suggest.index}
                className={i === suggest.index ? styles.active : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(f)}
              >
                {f.label} <code>{f.expression}</code>
              </button>
            ))}
          </div>,
          document.body,
        )}
      {ifEdit &&
        createPortal(
          <div ref={pop} className={styles.popover} style={{ left: ifEdit.rect.left, top: ifEdit.rect.bottom + 6 }} role="dialog" aria-label="แก้เงื่อนไขในข้อความ">
            {ifEdit.value.branches.map((b, i) => (
              <div key={i} className={styles.prop}>
                {b.keyword === "else" ? (
                  "ไม่เช่นนั้น"
                ) : (
                  <label className={styles.prop}>
                    {b.keyword === "if" ? "ถ้า" : "ไม่เช่นนั้นถ้า"}
                    <input value={b.test} onChange={(e) => setBranch(i, { test: e.target.value })} />
                  </label>
                )}
                <label className={styles.prop}>
                  ข้อความ
                  <input value={b.body} onChange={(e) => setBranch(i, { body: e.target.value })} />
                </label>
              </div>
            ))}
            {ifEdit.error && <p className={styles.inlineAlert}>{ifEdit.error}</p>}
            <div className={styles.row}>
              <button type="button" onClick={saveIf}>
                ตกลง
              </button>
              <button
                type="button"
                onClick={() => {
                  setIfEdit(null);
                  ref.current?.focus();
                }}
              >
                ยกเลิก
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
