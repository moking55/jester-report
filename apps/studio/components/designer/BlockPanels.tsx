"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";

import { IMAGE_ACCEPT, isImageName } from "@/lib/asset-name";

import type { Block, Cell } from "@/lib/doc-blocks";
import { readCode, writeCode, type CodeBlock } from "@/lib/code-block";
import { checkCode } from "@/lib/doc-check";
import {
  addBranch,
  addDetailRow,
  removeDetailRow,
  columnWidths,
  readStyle,
  setTableSizes,
  tableCells,
  mergeColumns,
  removeElse,
  replaceIn,
  setAttr,
  setBlankRows,
  setColumnFlex,
  setTagArgs,
  unwrapRow,
  type Edited,
  type Result,
} from "@/lib/doc-edit";
import type { Range } from "@/lib/doc-parse";

import styles from "./Designer.module.css";
import type { Suggestion } from "./TextEditor";
import { VarPanel } from "./VarPanel";

// The properties of each kind of block (SPEC-studio.md "v1.7" บล็อก): what the panel next to the paper edits.
// Every change is a range replace in template.html (lib/doc-edit), one undo step, committed on blur or Enter.

type Apply = (r: Result<Edited> | Edited) => void;
type Props = {
  block: Block;
  src: string;
  files: Record<string, string>;
  assets: string[];
  readOnly: boolean;
  fields: Suggestion[];
  apply: Apply;
  onCode: () => void; // open the Custom Code modal
  onUpload?: (file: File) => Promise<string | null>; // an image into the draft's assets; its name, or null
};

const fail = (error: string): Result<Edited> => ({ ok: false, error });
const bare = (expression: string) => expression.replace(/^\{\{\s*|\s*\}\}$/g, "");

/** A text box that commits when left (or on Enter), only if changed. */
function Field({ label, value, onCommit, readOnly, list, mono }: { label: string; value: string; onCommit: (v: string) => void; readOnly: boolean; list?: string; mono?: boolean }) {
  return (
    <label className={styles.prop}>
      {label}
      <input
        key={value}
        defaultValue={value}
        list={list}
        disabled={readOnly}
        className={mono ? styles.mono : undefined}
        onBlur={(e) => e.target.value !== value && onCommit(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    </label>
  );
}

/**
 * Text with {{ … }} for values (a QR code's text): typing {{ lists the fields; Enter or leaving the box commits.
 */
export function TemplateField({ label, value, onCommit, readOnly, fields }: { label: string; value: string; onCommit: (v: string) => void; readOnly: boolean; fields: Suggestion[] }) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  const [open, setOpen] = useState<{ from: number; to: number; query: string; index: number; rect: DOMRect } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }
  const matches = open ? fields.filter((f) => `${f.label} ${f.expression}`.toLowerCase().includes(open.query.toLowerCase())).slice(0, 8) : [];
  const look = (el: HTMLInputElement) => {
    const caret = el.selectionStart ?? el.value.length;
    const m = /\{\{\s*([^{}]*)$/.exec(el.value.slice(0, caret));
    setOpen(m ? { from: m.index, to: caret, query: m[1].trim(), index: 0, rect: el.getBoundingClientRect() } : null);
  };
  const pick = (f: Suggestion) => {
    if (!open) return;
    const inserted = `{{ ${bare(f.expression)} }}`;
    const after = text.slice(open.to).replace(/^\s*\}\}/, "");
    setText(text.slice(0, open.from) + inserted + after);
    setOpen(null);
    const at = open.from + inserted.length;
    requestAnimationFrame(() => input.current?.setSelectionRange(at, at));
  };
  const rect = open && matches.length ? open.rect : null;
  return (
    <label className={styles.prop}>
      {label}
      <input
        ref={input}
        value={text}
        disabled={readOnly}
        className={styles.mono}
        onChange={(e) => {
          setText(e.target.value);
          look(e.target);
        }}
        onBlur={() => {
          setOpen(null);
          if (text !== value) onCommit(text);
        }}
        onKeyDown={(e) => {
          if (open && matches.length) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const step = e.key === "ArrowDown" ? 1 : matches.length - 1;
              return setOpen({ ...open, index: (open.index + step) % matches.length });
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              return pick(matches[open.index]);
            }
            if (e.key === "Escape") return setOpen(null);
          }
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      {rect &&
        createPortal(
          <div className={styles.suggest} style={{ left: rect.left, top: rect.bottom + 4 }} role="listbox" aria-label="ช่องข้อมูล">
            {matches.map((f, i) => (
              <button
                key={f.expression}
                type="button"
                role="option"
                aria-selected={i === open?.index}
                className={i === open?.index ? styles.active : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(f)}
              >
                {f.label} <code>{f.expression}</code>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </label>
  );
}

/** The else of a condition or a loop: add it, or take it away (asking first when blocks are in it). */
function ElseButton({ block, src, apply, add, remove }: { block: Block; src: string; apply: Apply; add: string; remove: string }) {
  const has = block.node.kind === "block" && block.node.branches.some((b) => b.tag.keyword === "else");
  const last = block.lists[block.lists.length - 1];
  return (
    <button
      type="button"
      className={has ? styles.danger : undefined}
      onClick={() => {
        if (!has) return apply(addBranch(src, block, "else"));
        if (last?.list.items.length && !window.confirm("เอาสาขานี้ออกพร้อมบล็อกข้างใน?")) return;
        apply(removeElse(src, block));
      }}
    >
      {has ? remove : add}
    </button>
  );
}

/** Source for inside a cell or branch: refused when it would break the template. */
function guarded(src: string, block: Block, range: Range, text: string): Result<Edited> {
  const problem = checkCode(text)[0];
  return problem ? fail(problem.message) : { ok: true, value: replaceIn(src, block, range, text) };
}

const listsOf = (files: Record<string, string>): string[] => {
  try {
    return Object.keys((JSON.parse(files["report.json"] ?? "{}") as { lists?: object }).lists ?? {}).map((k) => `lists.${k}`);
  } catch {
    return [];
  }
};

/** A loop tag's "x in y". */
function LoopFields({ block, src, tag, variable, iterable, files, readOnly, apply }: Props & { tag: Range; variable: string; iterable: string }) {
  const set = (v: string, it: string) =>
    /^[A-Za-z_]\w*$/.test(v.trim()) ? apply(setTagArgs(src, block, tag, "for", `${v.trim()} in ${it.trim()}`)) : apply(fail("ชื่อตัวแปรต้องเป็นตัวอักษรอังกฤษ/ตัวเลข/_"));
  return (
    <>
      <datalist id="jd-lists">
        {listsOf(files).map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
      <Field label="วนจากรายการ" value={iterable} list="jd-lists" mono readOnly={readOnly} onCommit={(it) => set(variable, it)} />
      <Field label="ชื่อแต่ละแถว" value={variable} mono readOnly={readOnly} onCommit={(v) => set(v, iterable)} />
    </>
  );
}

/** A table row (<tr>) around a pair of cells, with the line it sits on. */
function rowRange(src: string, first: Cell, last: Cell): Range & { line: Range } {
  const start = src.lastIndexOf("<tr", first.range.start);
  const end = src.indexOf("</tr>", last.range.end) + 5;
  const lineStart = src.lastIndexOf("\n", start - 1);
  const lead = src.slice(lineStart + 1, start);
  return { start, end, line: { start: /^[ \t]*$/.test(lead) && lineStart >= 0 ? lineStart : start, end } };
}

export function BlockPanel(props: Props) {
  const { block, src, readOnly, apply, fields, assets, onCode } = props;
  const d = block.detail;
  const [cond, setCond] = useState<number | null>(null); // the branch whose test the helper builds

  switch (d.kind) {
    case "row": {
      const cols = block.node.kind === "element" ? block.node.children.filter((c) => c.kind === "element") : [];
      const flexOf = (i: number) => {
        const c = cols[i];
        const style = c?.kind === "element" ? (c.attrs.find((a) => a.name === "style")?.value ?? "") : "";
        return /(?:^|;)\s*flex\s*:\s*([\d.]+)/.exec(style)?.[1] ?? "1";
      };
      const merge = (i: number) => {
        if (cols.length > 2) return apply(mergeColumns(src, block, i));
        if (window.confirm("แถวจะเหลือคอลัมน์เดียว — ยกเลิกแถวและวางบล็อกข้างในไว้แทนที่?")) apply(unwrapRow(src, block));
      };
      return (
        <div className={styles.props}>
          <p className={styles.hint}>{cols.length} คอลัมน์ · ความกว้างเป็นสัดส่วน (เช่น 1 : 2)</p>
          {cols.map((_, i) => (
            <div key={i} className={styles.column}>
              <Field
                label={`สัดส่วนคอลัมน์ ${i + 1}`}
                value={flexOf(i)}
                readOnly={readOnly}
                onCommit={(v) => apply(setColumnFlex(src, block, i, Number(v)))}
              />
              {!readOnly && i < cols.length - 1 && (
                <button type="button" onClick={() => merge(i)}>
                  รวมกับคอลัมน์ขวา
                </button>
              )}
            </div>
          ))}
        </div>
      );
    }
    case "grid": {
      const cols = d.cols;
      return (
        <div className={styles.props}>
          <p className={styles.hint}>
            {d.rows.length} แถว × {cols} คอลัมน์ · คลิกเซลล์เพื่อเลือก (ปุ่มแถว/คอลัมน์/รวมช่องอยู่ในแถบเครื่องมือ) · ดับเบิลคลิกเพื่อพิมพ์
          </p>
        </div>
      );
    }
    case "field":
      return (
        <div className={styles.props}>
          <datalist id="jd-fields">
            {fields.map((f) => (
              <option key={f.expression} value={bare(f.expression)}>
                {f.label}
              </option>
            ))}
          </datalist>
          <Field
            label="ค่าที่แสดง (expression)"
            value={d.inner.trim()}
            list="jd-fields"
            mono
            readOnly={readOnly}
            onCommit={(v) => apply(/\{\{|\}\}|\{%|%\}/.test(v) || !v.trim() ? fail("ใส่เฉพาะ expression เช่น data.customer.name") : replaceIn(src, block, d.expr, `{{ ${v.trim()} }}`))}
          />
        </div>
      );
    case "code": {
      const inner = d.inner.trim();
      const code = readCode(inner);
      const type = code?.type ?? "";
      const write = (next: CodeBlock) => apply(replaceIn(src, block, d.expr, `{{ ${writeCode(next)} }}`));
      const text = code?.text ?? "";
      const amountText = code?.amount ?? "";
      return (
        <div className={styles.props}>
          {type ? (
            <>
              <TemplateField label={type === "promptpay" ? "เบอร์/เลขผู้เสียภาษี" : "ข้อความในโค้ด"} value={text} fields={fields} readOnly={readOnly} onCommit={(v) => code && write({ ...code, text: v })} />
              {type === "promptpay" && (
                <TemplateField label="ยอดเงิน (เว้นว่างได้)" value={amountText} fields={fields} readOnly={readOnly} onCommit={(v) => code && write({ ...code, amount: v })} />
              )}
              <p className={styles.hint}>พิมพ์ข้อความได้เลย ใช้ค่าจากข้อมูลด้วย {"{{ … }}"} (พิมพ์ {"{{"} เพื่อเลือก)</p>
            </>
          ) : (
            <Field label="expression" value={inner} mono readOnly={readOnly} onCommit={(v) => apply(replaceIn(src, block, d.expr, `{{ ${v.trim()} }}`))} />
          )}
        </div>
      );
    }
    case "image": {
      const now = d.src ? src.slice(d.src.start, d.src.end) : "";
      const images = assets.filter(isImageName);
      return (
        <div className={styles.props}>
          <label className={styles.prop}>
            รูป (asset)
            <select value={now} disabled={readOnly} onChange={(e) => apply(setAttr(src, block, "src", e.target.value))}>
              {!images.includes(now) && <option value={now}>{now || "—"}</option>}
              {images.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          {!readOnly && props.onUpload && <ImageUpload onUpload={props.onUpload} onDone={(name) => apply(setAttr(src, block, "src", name))} />}
        </div>
      );
    }
    case "table": {
      const head = d.head;
      const variable = d.loop.variable;
      const cellText = (c: Cell) => src.slice(c.inner.start, c.inner.end);
      return (
        <div className={styles.props}>
          <LoopFields {...props} tag={d.loop.tag} variable={variable} iterable={d.loop.iterable} />
          {!readOnly && (
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={d.detailRow !== null}
                onChange={(e) => {
                  if (e.target.checked) return apply(addDetailRow(src, block));
                  if (!block.lists[0]?.list.items.length || window.confirm("ลบแถวรายละเอียดพร้อมบล็อกข้างใน?")) apply(removeDetailRow(src, block));
                }}
              />{" "}
              แถวรายละเอียดใต้ทุกแถว (ใส่ตารางหรือวนซ้ำของรายการลูกได้)
            </label>
          )}
          <Field
            label="บรรทัดเปล่าในฟอร์มเปล่า (0–100)"
            value={String(d.blankRows?.count ?? 0)}
            readOnly={readOnly}
            onCommit={(v) => apply(/^\d+$/.test(v.trim()) ? setBlankRows(src, block, Number(v.trim())) : fail("ใส่จำนวนเต็ม 0–100"))}
          />
          <h3>คอลัมน์</h3>
          {d.cells.map((c, i) => (
            <div key={`${i}-${c.range.start}`} className={styles.column}>
              {head?.[i] && (
                <Field label={`หัวคอลัมน์ ${i + 1}`} value={cellText(head[i])} readOnly={readOnly} onCommit={(v) => apply(guarded(src, block, head[i].inner, v))} />
              )}
              <Field label="ค่าในแถว" value={cellText(c)} mono readOnly={readOnly} onCommit={(v) => apply(guarded(src, block, c.inner, v))} />
            </div>
          ))}
        </div>
      );
    }
    case "summary": {
      const text = (c: Cell) => src.slice(c.inner.start, c.inner.end);
      return (
        <div className={styles.props}>
          {d.rows.map((r, i) => (
            <div key={`${i}-${r.label.range.start}`} className={styles.column}>
              <Field label={`ป้ายแถว ${i + 1}`} value={text(r.label)} readOnly={readOnly} onCommit={(v) => apply(guarded(src, block, r.label.inner, v))} />
              <Field label="ค่า" value={text(r.value)} mono readOnly={readOnly} onCommit={(v) => apply(guarded(src, block, r.value.inner, v))} />
              {!readOnly && d.rows.length > 1 && (
                <button type="button" className={styles.danger} onClick={() => apply(replaceIn(src, block, rowRange(src, r.label, r.value).line, ""))}>
                  ลบแถว
                </button>
              )}
            </div>
          ))}
        </div>
      );
    }
    case "condition":
      return (
        <div className={styles.props}>
          {d.branches.map((b, i) =>
            b.keyword === "else" ? (
              <p key={i} className={styles.hint}>
                สาขา &quot;ไม่เช่นนั้น&quot;
              </p>
            ) : (
              <div key={`${i}-${b.tag.start}`} className={styles.column}>
                <Field
                  label={b.keyword === "if" ? "ถ้า" : "ไม่เช่นนั้นถ้า"}
                  value={b.test}
                  mono
                  readOnly={readOnly}
                  onCommit={(v) => apply(v.trim() ? setTagArgs(src, block, b.tag, b.keyword, v) : fail("เงื่อนไขว่างไม่ได้"))}
                />
                {!readOnly && (
                  <button type="button" onClick={() => setCond(i)}>
                    ตัวช่วยสร้างเงื่อนไข
                  </button>
                )}
              </div>
            ),
          )}
          {!readOnly && (
            <div className={styles.row}>
              <button type="button" onClick={() => apply(addBranch(src, block, "elif", "true"))}>
                + ไม่เช่นนั้นถ้า
              </button>
              <ElseButton block={block} src={src} apply={apply} add="+ ไม่เช่นนั้น" remove="เอา ไม่เช่นนั้น ออก" />
            </div>
          )}
          <p className={styles.hint}>ลากบล็อกลงในแต่ละสาขาบนกระดาษ</p>
          {cond !== null && d.branches[cond] && (
            <ConditionModal
              fields={fields}
              onClose={() => setCond(null)}
              onPick={(test) => {
                const b = d.branches[cond];
                setCond(null);
                apply(setTagArgs(src, block, b.tag, b.keyword, test));
              }}
            />
          )}
        </div>
      );
    case "repeat":
      return (
        <div className={styles.props}>
          <LoopFields {...props} tag={d.tag} variable={d.variable} iterable={d.iterable} />
          {!readOnly && (
            <div className={styles.row}>
              <ElseButton block={block} src={src} apply={apply} add="+ ถ้าไม่มีแถว" remove="เอา ถ้าไม่มีแถว ออก" />
            </div>
          )}
          <p className={styles.hint}>ลากบล็อกลงใน &quot;ทุกแถว&quot; บนกระดาษ ใช้ชื่อแต่ละแถวในช่องข้อมูล</p>
        </div>
      );
    case "list":
      return (
        <div className={styles.props}>
          <p className={styles.hint}>ดับเบิลคลิกข้อเพื่อพิมพ์ · Enter = ข้อถัดไป · Enter ที่ข้อว่าง = จบรายการ · ปุ่มรายการในแถบเครื่องมือเปลี่ยนจุด/ตัวเลข หรือกลับเป็นข้อความ</p>
        </div>
      );
    case "set":
      return <VarPanel block={block} src={src} inner={d.inner} fields={fields} readOnly={readOnly} apply={apply} />;
    case "none":
      return block.kind === "custom" ? (
        <div className={styles.props}>
          <p className={styles.hint}>ส่วนนี้ designer ยังอ่านเป็นบล็อกไม่ได้ แก้เป็นโค้ดได้ (ตรวจไวยากรณ์ก่อนปิด)</p>
          <button type="button" onClick={onCode}>
            {readOnly ? "ดูโค้ด" : "แก้โค้ด (ดับเบิลคลิก)"}
          </button>
        </div>
      ) : null;
    default:
      return null;
  }
}

const OPS = [
  ["==", "เท่ากับ"],
  ["!=", "ไม่เท่ากับ"],
  [">", "มากกว่า"],
  [">=", "มากกว่าหรือเท่ากับ"],
  ["<", "น้อยกว่า"],
  ["<=", "น้อยกว่าหรือเท่ากับ"],
  ["has", "มีค่า"],
  ["empty", "ไม่มีค่า"],
] as const;

/** The test a condition helper builds: a field, a comparison and a value (a number or quoted text). */
export function buildTest(field: string, op: string, value: string): string {
  if (op === "has") return field;
  if (op === "empty") return `not ${field}`;
  const v = value.trim();
  const literal = /^-?\d+(\.\d+)?$/.test(v) || /^(true|false|none)$/i.test(v) ? v.toLowerCase() : JSON.stringify(v);
  return `${field} ${op} ${literal}`;
}

function ConditionModal({ fields, onPick, onClose }: { fields: Suggestion[]; onPick: (test: string) => void; onClose: () => void }) {
  const values = fields.map((f) => bare(f.expression)).filter((e) => /^[\w.]+$/.test(e));
  const [field, setField] = useState(values[0] ?? "");
  const [op, setOp] = useState<string>("==");
  const [value, setValue] = useState("");
  const test = field ? buildTest(field, op, value) : "";
  return (
    <div className={styles.backdrop} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className={styles.smallModal} role="dialog" aria-label="ตัวช่วยสร้างเงื่อนไข">
        <h3>ตัวช่วยสร้างเงื่อนไข</h3>
        <label className={styles.prop}>
          ช่องข้อมูล
          <select value={field} onChange={(e) => setField(e.target.value)}>
            {values.map((v) => (
              <option key={v} value={v}>
                {fields.find((f) => bare(f.expression) === v)?.label} ({v})
              </option>
            ))}
          </select>
        </label>
        <label className={styles.prop}>
          เงื่อนไข
          <select value={op} onChange={(e) => setOp(e.target.value)}>
            {OPS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {op !== "has" && op !== "empty" && (
          <label className={styles.prop}>
            ค่า
            <input value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
        )}
        <code className={styles.mono}>{test || "—"}</code>
        <div className={styles.row}>
          <button type="button" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="button" className={styles.primary} disabled={!test} onClick={() => onPick(test)}>
            ใช้เงื่อนไขนี้
          </button>
        </div>
      </div>
    </div>
  );
}

/** Sizes of a list table or a fixed table (SPEC v1.7 รอบแก้ข้อ 8): % of the page, % per column, cell padding in mm. */
export function TableSizePanel({ block, src, readOnly, apply }: { block: Block; src: string; readOnly: boolean; apply: Apply }) {
  if (block.node.kind !== "element" || !(block.detail.kind === "table" || block.detail.kind === "grid")) return null;
  const styleOf = (el: { attrs: { name: string; value: string | null }[] }) => readStyle(el.attrs.find((a) => a.name === "style")?.value ?? "");
  const width = /^([\d.]+)%$/.exec(styleOf(block.node).find(([k]) => k === "width")?.[1] ?? "")?.[1] ?? "";
  const cells = tableCells(block);
  const padding = /^([\d.]+)mm$/.exec((cells ? styleOf(cells.all[0]) : []).find(([k]) => k === "padding")?.[1] ?? "")?.[1] ?? "";
  const cols = columnWidths(block);
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  return (
    <div className={styles.props}>
      <h3>ขนาดตาราง</h3>
      <Field label="ความกว้างตาราง (% ของหน้า, ว่าง = ตาม CSS)" value={width} readOnly={readOnly} onCommit={(v) => apply(setTableSizes(src, block, { width: num(v) }))} />
      <div className={styles.row}>
        {cols.map((w, i) => (
          <div key={i} className={styles.narrow}>
            <Field
              label={`คอลัมน์ ${i + 1} (%)`}
              value={w === null ? "" : String(w)}
              readOnly={readOnly}
              onCommit={(v) => apply(setTableSizes(src, block, { columns: cols.map((c, j) => (j === i ? num(v) : c)) }))}
            />
          </div>
        ))}
      </div>
      <p className={styles.hint}>ว่าง = อัตโนมัติ · ลากเส้นแบ่งคอลัมน์ที่แถวแรกบนกระดาษได้</p>
      <Field label="ระยะในเซลล์ (mm, ว่าง = ตาม CSS)" value={padding} readOnly={readOnly} onCommit={(v) => apply(setTableSizes(src, block, { padding: num(v) }))} />
    </div>
  );
}

/** "อัปโหลดรูป…": pick an image, upload it into the draft's assets, then use it (SPEC v1.7 รอบแก้ข้อ 9). */
export function ImageUpload({ onUpload, onDone, label = "อัปโหลดรูป…" }: { onUpload: (file: File) => Promise<string | null>; onDone: (name: string) => void; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  return (
    <>
      <button type="button" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? "กำลังอัปโหลด…" : label}
      </button>
      <input
        ref={input}
        type="file"
        hidden
        accept={IMAGE_ACCEPT}
        aria-label="เลือกรูปที่จะอัปโหลด"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          const name = await onUpload(file);
          setBusy(false);
          if (!name) return;
          setNote(name !== file.name ? `อัปโหลด "${file.name}" เป็น ${name}` : `อัปโหลด ${name} แล้ว`);
          onDone(name);
        }}
      />
      {note && <p className={styles.hint}>{note}</p>}
    </>
  );
}
