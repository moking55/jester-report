"use client";

import type { Block } from "@/lib/doc-blocks";
import { readStyle } from "@/lib/doc-edit";

import styles from "./Designer.module.css";

// The style panel of the Document Designer: the advanced properties (spacing, width, borders, line height), written
// into the block's style="" (others stay as written). A style holding Jinja is read-only. The text formatting that used
// to be here (size, weight, alignment, colour, font) is in the toolbar since v1.9.

type Props = { src: string; block: Block; readOnly: boolean; onChange: (props: Record<string, string | null>) => void };

export function StylePanel({ src, block, readOnly, onChange }: Props) {
  const range = block.style?.range;
  const decls = Object.fromEntries(range ? readStyle(src.slice(range.start, range.end)) : []);
  const locked = readOnly || !!block.style?.readOnly;
  const set = (k: string, v: string) => onChange({ [k]: v || null });
  const mm = (k: string) => (decls[k]?.endsWith("mm") ? decls[k].slice(0, -2) : "");

  const select = (label: string, k: string, options: [string, string][]) => (
    <label className={styles.prop}>
      {label}
      <select value={decls[k] ?? ""} disabled={locked} onChange={(e) => set(k, e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
        {decls[k] && !options.some(([v]) => v === decls[k]) && <option value={decls[k]}>{decls[k]}</option>}
      </select>
    </label>
  );
  const mmBox = (label: string, k: string) => (
    <label className={styles.prop}>
      {label}
      <input
        key={`${block.start}-${k}-${decls[k] ?? ""}`}
        type="number"
        min={0}
        max={300}
        step={0.5}
        defaultValue={mm(k)}
        disabled={locked}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v !== mm(k)) set(k, v ? `${v}mm` : "");
        }}
      />
    </label>
  );

  const textual = ["text", "field", "summary", "table", "code"].includes(block.kind);
  return (
    <div className={styles.props}>
      <h3>สไตล์</h3>
      {block.style?.readOnly && <p className={styles.hint}>style นี้มี Jinja อยู่ แก้ได้ในหน้า code เท่านั้น</p>}
      {textual &&
        select("ระยะบรรทัด", "line-height", [
          ["", "ตามเอกสาร"],
          ["1", "1"],
          ["1.15", "1.15"],
          ["1.3", "1.3"],
          ["1.5", "1.5"],
          ["2", "2"],
        ])}
      {(block.kind === "image" || block.kind === "summary") && mmBox("ความกว้าง (mm)", "width")}
      {block.kind === "space" && mmBox("ความสูง (mm)", "height")}
      {mmBox("ระยะห่างด้านบน (mm)", "margin-top")}
      {mmBox("ระยะห่างด้านล่าง (mm)", "margin-bottom")}
      {block.kind === "table" &&
        select("เส้นตาราง", "border", [
          ["", "ตาม report.css"],
          ["1px solid #000", "เส้นนอก"],
          ["none", "ไม่มี"],
        ])}
    </div>
  );
}
