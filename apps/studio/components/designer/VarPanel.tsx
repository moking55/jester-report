"use client";

import { useState } from "react";

import { argToText, textToArg } from "@/lib/code-arg";
import type { Block } from "@/lib/doc-blocks";
import { setTagArgs, type Edited, type Result } from "@/lib/doc-edit";
import { readVar, TYPE_NAME, writeVar, type Var, type VarRow, type VarType } from "@/lib/doc-var";

import styles from "./Designer.module.css";
import { TemplateField } from "./BlockPanels";
import type { Suggestion } from "./TextEditor";

// The panel of a "ตั้งค่าตัวแปร" block (SPEC-studio.md v1.9): name, type, and one value or "ถ้า … → …" rows with an
// "ไม่เช่นนั้น". The draft lives here; it reaches template.html (one undo step) only when it is valid.

type Props = {
  block: Block;
  src: string;
  inner: string; // the tag's inner text: "set x = …"
  fields: Suggestion[];
  readOnly: boolean;
  apply: (r: Result<Edited> | Edited) => void;
};

/** The value of a type in another type's form (text is the panel's text, the others Jinja). */
export function convertValue(value: string, from: VarType, to: VarType): string {
  if (from === to || (from !== "text" && to !== "text")) return value;
  return to === "text" ? argToText(value) : textToArg(value);
}

function Line({ label, value, onChange, onCommit, readOnly, list, placeholder }: { label: string; value: string; onChange: (v: string) => void; onCommit: () => void; readOnly: boolean; list?: string; placeholder?: string }) {
  return (
    <input
      aria-label={label}
      className={styles.mono}
      value={value}
      list={list}
      placeholder={placeholder}
      disabled={readOnly}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

export function VarPanel(props: Props) {
  const v0 = readVar(props.inner);
  if (!v0) return <p className={styles.hint}>แท็ก set นี้ designer ยังอ่านเป็นตัวแปรไม่ได้ แก้เป็นโค้ดได้</p>;
  // a new draft when the file's tag changes (an undo, another edit): the key is the tag's text
  return <Draft key={props.inner} {...props} v0={v0} />;
}

function Draft({ block, src, inner, fields, readOnly, apply, v0 }: Props & { v0: Var }) {
  const [v, setV] = useState<Var>(v0);
  const [error, setError] = useState<string | null>(null);

  const commit = (next: Var) => {
    const out = writeVar(next);
    if (!out.ok) return setError(out.error);
    setError(null);
    if (`set ${out.value}` !== inner.trim()) apply(setTagArgs(src, block, block, "set", out.value));
  };
  const change = (next: Var, now = false) => {
    setV(next);
    if (now) commit(next);
  };
  const setRow = (i: number, patch: Partial<VarRow>) => change({ ...v, rows: v.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const move = (i: number, by: number) => {
    const rows = [...v.rows];
    [rows[i], rows[i + by]] = [rows[i + by], rows[i]];
    change({ ...v, rows }, true);
  };

  /** The editor of one value: `build` is the variable with that text in it. */
  const value = (label: string, text: string, build: (t: string) => Var) =>
    v.type === "text" ? (
      <TemplateField
        label={label}
        value={text}
        fields={fields}
        readOnly={readOnly}
        onCommit={(t) => {
          const next = build(t);
          setV(next);
          commit(next);
        }}
      />
    ) : (
      <Line label={label} value={text} onChange={(t) => setV(build(t))} onCommit={() => commit(v)} readOnly={readOnly} list="jd-var-fields" placeholder={v.type === "number" ? "เช่น data.total * 7 / 100" : v.type === "bool" ? "เช่น data.paid" : undefined} />
    );

  const conditional = v.rows.length > 0;
  return (
    <div className={styles.props}>
      <datalist id="jd-var-fields">
        {fields.map((f) => (
          <option key={f.expression} value={f.expression.replace(/^\{\{\s*|\s*\}\}$/g, "")}>
            {f.label}
          </option>
        ))}
      </datalist>
      <label className={styles.prop}>
        ชื่อตัวแปร
        <Line label="ชื่อตัวแปร" value={v.name} onChange={(name) => change({ ...v, name })} onCommit={() => commit(v)} readOnly={readOnly} />
      </label>
      <label className={styles.prop}>
        ประเภท
        <select
          value={v.type}
          disabled={readOnly}
          onChange={(e) => {
            const to = e.target.value as VarType;
            const conv = (x: string) => convertValue(x, v.type, to);
            change({ ...v, type: to, rows: v.rows.map((r) => ({ ...r, value: conv(r.value) })), otherwise: conv(v.otherwise) }, true);
          }}
        >
          {(Object.keys(TYPE_NAME) as VarType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_NAME[t]}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.prop}>
        ตั้งค่าแบบ
        <select
          value={conditional ? "if" : "one"}
          disabled={readOnly}
          onChange={(e) => change(e.target.value === "if" ? { ...v, rows: [{ test: "", value: v.otherwise }], otherwise: "" } : { ...v, rows: [], otherwise: v.rows[0]?.value ?? v.otherwise }, e.target.value !== "if")}
        >
          <option value="one">ค่าเดียว</option>
          <option value="if">ตามเงื่อนไข</option>
        </select>
      </label>
      {v.rows.map((r, i) => (
        <div key={i} className={styles.varRow}>
          <span className={styles.varRowHead}>
            ถ้า
            <Line label={`เงื่อนไขข้อ ${i + 1}`} value={r.test} onChange={(test) => setRow(i, { test })} onCommit={() => commit(v)} readOnly={readOnly} list="jd-var-fields" placeholder="เช่น data.paid" />
          </span>
          {value(`ค่าข้อ ${i + 1}`, r.value, (t) => ({ ...v, rows: v.rows.map((x, j) => (j === i ? { ...x, value: t } : x)) }))}
          {!readOnly && (
            <span className={styles.row}>
              <button type="button" aria-label={`เลื่อนข้อ ${i + 1} ขึ้น`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button type="button" aria-label={`เลื่อนข้อ ${i + 1} ลง`} disabled={i === v.rows.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button
                type="button"
                aria-label={`ลบเงื่อนไขข้อ ${i + 1}`}
                onClick={() => (v.rows.length === 1 ? change({ ...v, rows: [], otherwise: r.value || v.otherwise }, true) : change({ ...v, rows: v.rows.filter((_, j) => j !== i) }, true))}
              >
                ✕
              </button>
            </span>
          )}
        </div>
      ))}
      {conditional && !readOnly && (
        <button type="button" className={styles.secondary} onClick={() => change({ ...v, rows: [...v.rows, { test: "", value: "" }] })}>
          + เพิ่มเงื่อนไข
        </button>
      )}
      {value(conditional ? "ไม่เช่นนั้น" : "ค่า", v.otherwise, (t) => ({ ...v, otherwise: t }))}
      {error && (
        <p role="alert" className={styles.inlineAlert}>
          {error}
        </p>
      )}
      <p className={styles.hint}>
        {v.type === "text" ? "พิมพ์ข้อความได้เลย ใช้ค่าจากข้อมูลด้วย {{ … }} (พิมพ์ {{ เพื่อเลือก) · " : v.type === "number" ? "ตัวเลข หรือคำนวณ + - * / ( ) และ (…) | round(n) · ใช้เลขเต็มเท่านั้น (7 / 100 แทน 0.07) · " : v.type === "bool" ? "เงื่อนไขแบบเดียวกับบล็อกเงื่อนไข · " : ""}
        ไม่แสดงบนกระดาษ ใช้ชื่อนี้ในบล็อกถัดไปได้
      </p>
    </div>
  );
}
