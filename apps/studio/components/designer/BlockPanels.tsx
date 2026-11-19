"use client";

import { useState } from "react";

import type { Block, Cell } from "@/lib/doc-blocks";
import { checkCode } from "@/lib/doc-check";
import {
  addBranch,
  addColumn,
  addRowColumn,
  gridAddColumn,
  gridAddRow,
  gridBorders,
  gridHeader,
  gridMoveColumn,
  gridRemoveColumn,
  gridRemoveRow,
  mergeColumns,
  moveColumn,
  removeColumn,
  replaceIn,
  setAttr,
  setColumnFlex,
  setTagArgs,
  unwrapRow,
  type Edited,
  type Result,
} from "@/lib/doc-edit";
import type { Range } from "@/lib/doc-parse";

import styles from "./Designer.module.css";
import type { Suggestion } from "./TextEditor";

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
          {!readOnly && (
            <button type="button" disabled={cols.length >= 4} onClick={() => apply(addRowColumn(src, block))}>
              + คอลัมน์
            </button>
          )}
        </div>
      );
    }
    case "grid": {
      const cols = d.rows[0].cells.length;
      const bordered = d.rows.every((r) => r.cells.every((c) => /(?:^|;)\s*border\s*:/.test(c.node.attrs.find((a) => a.name === "style")?.value ?? "")));
      return (
        <div className={styles.props}>
          <p className={styles.hint}>
            {d.rows.length} แถว × {cols} คอลัมน์ · ดับเบิลคลิกเซลล์บนกระดาษเพื่อพิมพ์
          </p>
          {!readOnly && (
            <>
              <label className={styles.check}>
                <input type="checkbox" checked={d.head} onChange={(e) => apply(gridHeader(src, block, e.target.checked))} /> แถวแรกเป็นหัวตาราง
              </label>
              <label className={styles.check}>
                <input type="checkbox" checked={bordered} onChange={(e) => apply(gridBorders(src, block, e.target.checked))} /> เส้นตาราง
              </label>
              <h3>แถว</h3>
              {d.rows.map((_, r) => (
                <div key={r} className={styles.row}>
                  <span className={styles.hint}>แถว {r + 1}</span>
                  <button type="button" onClick={() => apply(gridAddRow(src, block, r))}>
                    + แถวใต้
                  </button>
                  <button type="button" className={styles.danger} disabled={d.rows.length <= 1} onClick={() => apply(gridRemoveRow(src, block, r))}>
                    ลบ
                  </button>
                </div>
              ))}
              <h3>คอลัมน์</h3>
              {Array.from({ length: cols }, (_, c) => (
                <div key={c} className={styles.row}>
                  <span className={styles.hint}>คอลัมน์ {c + 1}</span>
                  <button type="button" aria-label="ย้ายซ้าย" disabled={c === 0} onClick={() => apply(gridMoveColumn(src, block, c, -1))}>
                    ←
                  </button>
                  <button type="button" aria-label="ย้ายขวา" disabled={c === cols - 1} onClick={() => apply(gridMoveColumn(src, block, c, 1))}>
                    →
                  </button>
                  <button type="button" onClick={() => apply(gridAddColumn(src, block, c))}>
                    + ขวา
                  </button>
                  <button type="button" className={styles.danger} disabled={cols <= 1} onClick={() => apply(gridRemoveColumn(src, block, c))}>
                    ลบ
                  </button>
                </div>
              ))}
            </>
          )}
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
      const pp = /^fmt\.qr\(fmt\.promptpay\(([\s\S]*)\)\)$/.exec(inner);
      const plain = /^fmt\.(qr|barcode)\(([\s\S]*)\)$/.exec(inner);
      const type = pp ? "promptpay" : (plain?.[1] ?? "");
      const arg = pp ? pp[1] : (plain?.[2] ?? "");
      const write = (t: string, a: string) =>
        apply(
          replaceIn(src, block, d.expr, `{{ ${t === "promptpay" ? `fmt.qr(fmt.promptpay(${a}))` : `fmt.${t}(${a})`} }}`),
        );
      return (
        <div className={styles.props}>
          {type ? (
            <>
              <label className={styles.prop}>
                ชนิด
                <select value={type} disabled={readOnly} onChange={(e) => write(e.target.value, arg)}>
                  <option value="qr">QR code</option>
                  <option value="promptpay">QR PromptPay</option>
                  <option value="barcode">บาร์โค้ด</option>
                </select>
              </label>
              <Field label={type === "promptpay" ? "เบอร์/เลขผู้เสียภาษี, ยอดเงิน" : "ข้อความในโค้ด"} value={arg} mono readOnly={readOnly} onCommit={(a) => write(type, a)} />
            </>
          ) : (
            <Field label="expression" value={inner} mono readOnly={readOnly} onCommit={(v) => apply(replaceIn(src, block, d.expr, `{{ ${v.trim()} }}`))} />
          )}
        </div>
      );
    }
    case "image": {
      const now = d.src ? src.slice(d.src.start, d.src.end) : "";
      const images = assets.filter((a) => /\.(png|jpe?g|gif|svg|webp)$/i.test(a));
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
          {!images.length && <p className={styles.hint}>อัปโหลดรูปในหน้า code (แท็บ assets) ก่อน</p>}
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
          <h3>คอลัมน์</h3>
          {d.cells.map((c, i) => (
            <div key={`${i}-${c.range.start}`} className={styles.column}>
              {head?.[i] && (
                <Field label={`หัวคอลัมน์ ${i + 1}`} value={cellText(head[i])} readOnly={readOnly} onCommit={(v) => apply(guarded(src, block, head[i].inner, v))} />
              )}
              <Field label="ค่าในแถว" value={cellText(c)} mono readOnly={readOnly} onCommit={(v) => apply(guarded(src, block, c.inner, v))} />
              {!readOnly && (
                <div className={styles.row}>
                  <button type="button" aria-label="ย้ายซ้าย" disabled={i === 0} onClick={() => apply(moveColumn(src, block, i, -1))}>
                    ←
                  </button>
                  <button type="button" aria-label="ย้ายขวา" disabled={i === d.cells.length - 1} onClick={() => apply(moveColumn(src, block, i, 1))}>
                    →
                  </button>
                  <button type="button" className={styles.danger} onClick={() => apply(removeColumn(src, block, i))}>
                    ลบคอลัมน์
                  </button>
                </div>
              )}
            </div>
          ))}
          {!readOnly && (
            <button type="button" onClick={() => apply(addColumn(src, block, d.cells.length - 1, "หัวคอลัมน์", `{{ ${variable} }}`))}>
              + คอลัมน์
            </button>
          )}
        </div>
      );
    }
    case "summary": {
      const text = (c: Cell) => src.slice(c.inner.start, c.inner.end);
      const last = d.rows[d.rows.length - 1];
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
          {!readOnly && last && (
            <button
              type="button"
              onClick={() => {
                const row = rowRange(src, last.label, last.value);
                const indent = src.slice(src.lastIndexOf("\n", row.start - 1) + 1, row.start);
                apply(replaceIn(src, block, { start: row.end, end: row.end }, `\n${/^[ \t]*$/.test(indent) ? indent : ""}${src.slice(row.start, row.end)}`));
              }}
            >
              + แถว
            </button>
          )}
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
              {!d.branches.some((b) => b.keyword === "else") && (
                <button type="button" onClick={() => apply(addBranch(src, block, "else"))}>
                  + ไม่เช่นนั้น
                </button>
              )}
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
          <p className={styles.hint}>ลากบล็อกลงใน &quot;ทุกแถว&quot; บนกระดาษ ใช้ชื่อแต่ละแถวในช่องข้อมูล</p>
        </div>
      );
    case "set": {
      const m = /^set\s+([A-Za-z_]\w*)\s*=\s*([\s\S]*)$/.exec(d.inner.trim());
      const write = (name: string, expr: string) => {
        if (!/^[A-Za-z_]\w*$/.test(name.trim())) return apply(fail("ชื่อตัวแปรต้องเป็นตัวอักษรอังกฤษ/ตัวเลข/_"));
        if (!expr.trim() || /%\}|\{%/.test(expr)) return apply(fail("ค่าไม่ถูกต้อง"));
        apply(setTagArgs(src, block, block, "set", `${name.trim()} = ${expr.trim()}`));
      };
      return m ? (
        <div className={styles.props}>
          <Field label="ชื่อตัวแปร" value={m[1]} mono readOnly={readOnly} onCommit={(v) => write(v, m[2])} />
          <Field label="ค่า (expression)" value={m[2]} mono readOnly={readOnly} onCommit={(v) => write(m[1], v)} />
          <p className={styles.hint}>ไม่แสดงบนกระดาษ ใช้ชื่อนี้ในบล็อกถัดไปได้</p>
        </div>
      ) : null;
    }
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
