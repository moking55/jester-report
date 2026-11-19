"use client";

import { useState } from "react";

import { keyProblem, KIND_LABEL, type BuilderField, type FieldProps } from "@/lib/schema-edit";

import styles from "./FormBuilder.module.css";

type Props = {
  field: BuilderField;
  readOnly: boolean;
  siblings: string[];
  onEdit: (patch: FieldProps) => void;
  onRename: (key: string) => void;
};

/** The selected field's properties (SPEC-studio v1.6 table); text boxes apply when they lose focus. */
export function PropsPanel({ field, readOnly, siblings, onEdit, onRename }: Props) {
  const p = field.props;
  const kind = field.kind;
  const isParam = field.path.section === "params";
  const [key, setKey] = useState(field.key);
  const keyError = key === field.key ? null : keyProblem(key, siblings);

  if (!kind) {
    return (
      <div className={styles.props}>
        <h3>{p.label ?? field.key}</h3>
        <p className={styles.warning}>แก้ใน JSON: {field.reason}</p>
        <code>{field.pointer}</code>
      </div>
    );
  }

  const text = (label: string, prop: keyof FieldProps, opts: { hint?: string; area?: boolean; max?: number } = {}) => {
    const value = (p[prop] as string | undefined) ?? "";
    const Tag = opts.area ? "textarea" : "input";
    return (
      <label className={styles.prop}>
        {label}
        <Tag
          key={`${field.pointer}-${prop}-${value}`}
          defaultValue={value}
          disabled={readOnly}
          maxLength={opts.max}
          onBlur={(e) => {
            if (e.target.value !== value) onEdit({ [prop]: e.target.value });
          }}
        />
        {opts.hint && <span className={styles.hint}>{opts.hint}</span>}
      </label>
    );
  };

  const isText = kind === "text" || kind === "textarea";
  const isNumber = kind === "number";
  const scalar = kind !== "group" && kind !== "table";

  return (
    <div className={styles.props}>
      <h3>
        {KIND_LABEL[kind]} <code>{field.pointer}</code>
      </h3>
      <label className={styles.prop}>
        key
        <input
          value={key}
          disabled={readOnly}
          aria-invalid={Boolean(keyError)}
          onChange={(e) => setKey(e.target.value)}
          onBlur={() => {
            if (key !== field.key && !keyError) onRename(key);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && key !== field.key && !keyError) onRename(key);
            if (e.key === "Escape") setKey(field.key);
          }}
        />
        {keyError && <span className={styles.error}>{keyError}</span>}
      </label>
      {text("ป้าย", "label", { max: isParam ? 80 : undefined })}
      {text("คำอธิบาย", "description", { area: true, max: isParam ? 300 : undefined })}
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={p.required === true}
          disabled={readOnly}
          onChange={(e) => onEdit({ required: e.target.checked })}
        />
        บังคับกรอก
      </label>
      {isNumber && !isParam && (
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={p.integer === true}
            disabled={readOnly}
            onChange={(e) => onEdit({ integer: e.target.checked })}
          />
          จำนวนเต็ม
        </label>
      )}
      {kind === "checkbox" ? (
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={p.defaultValue === true}
            disabled={readOnly || (isParam && p.required)}
            onChange={(e) => onEdit({ defaultValue: e.target.checked ? true : null })}
          />
          ค่าเริ่มต้น: ติ๊กไว้
        </label>
      ) : kind === "choice" ? (
        <>
          <label className={styles.prop}>
            ตัวเลือก (บรรทัดละค่า)
            <textarea
              key={`${field.pointer}-options-${p.options?.join("|")}`}
              defaultValue={p.options?.join("\n")}
              disabled={readOnly}
              rows={4}
              onBlur={(e) => {
                const next = e.target.value.split("\n");
                if (next.join("|") !== p.options?.join("|")) onEdit({ options: next });
              }}
            />
          </label>
          <label className={styles.prop}>
            ค่าเริ่มต้น
            <select
              value={typeof p.defaultValue === "string" ? p.defaultValue : ""}
              disabled={readOnly || (isParam && p.required)}
              onChange={(e) => onEdit({ defaultValue: e.target.value })}
            >
              <option value="">— ไม่มี —</option>
              {p.options?.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <label className={styles.prop}>
            แสดงเป็น
            <select value={p.widget ?? ""} disabled={readOnly} onChange={(e) => onEdit({ widget: e.target.value ? "radio" : null })}>
              <option value="">dropdown</option>
              <option value="radio">radio</option>
            </select>
          </label>
        </>
      ) : (
        scalar &&
        !(isParam && p.required) &&
        text("ค่าเริ่มต้น", "defaultValue", {
          hint: kind === "date" ? "ปปปป-ดด-วว" : kind === "money" ? "เช่น 1250.50" : undefined,
        })
      )}
      {isText && (
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={kind === "textarea"}
            disabled={readOnly}
            onChange={(e) => onEdit({ widget: e.target.checked ? "textarea" : null })}
          />
          หลายบรรทัด
        </label>
      )}
      {isText && !isParam && text("ยาวอย่างน้อย", "minLength")}
      {isText && text("ยาวไม่เกิน", "maxLength")}
      {isText && !isParam && text("pattern (regex)", "pattern")}
      {isNumber && !isParam && text("ต่ำสุด", "minimum")}
      {isNumber && !isParam && text("สูงสุด", "maximum")}
      {kind === "table" && text("แถวอย่างน้อย", "minItems")}
      {kind === "table" && text("แถวไม่เกิน", "maxItems")}
      {scalar && (
        <label className={styles.prop}>
          ความกว้าง
          <select value={p.width ?? "full"} disabled={readOnly} onChange={(e) => onEdit({ width: e.target.value as FieldProps["width"] })}>
            <option value="full">เต็มแถว</option>
            <option value="half">ครึ่งแถว</option>
            <option value="third">หนึ่งในสาม</option>
          </select>
          <span className={styles.hint}>ไม่มีผลกับคอลัมน์ในตาราง</span>
        </label>
      )}
    </div>
  );
}
