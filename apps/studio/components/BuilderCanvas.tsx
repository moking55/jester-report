"use client";

import { memo } from "react";

import { KIND_LABEL, type Builder, type BuilderField, type FieldPath, type Kind, type Section } from "@/lib/schema-edit";

import styles from "./FormBuilder.module.css";

export type CanvasProps = {
  builder: Builder;
  tree: { params: BuilderField[]; data: BuilderField[] };
  selected: FieldPath | null;
  readOnly: boolean;
  onSelect: (path: FieldPath) => void;
  onSection: (section: Section) => void;
  onRemove: (path: FieldPath) => void;
  onBuilder: (b: Builder) => void;
  onAdd: (kind: Kind, target: { section: Section; parentKeys: string[]; index: number }) => void;
  onMessage: (text: string | null) => void;
};

const isSelected = (selected: FieldPath | null, f: BuilderField) =>
  !!selected && selected.section === f.path.section && selected.keys.join("/") === f.path.keys.join("/");

/** One field: a card; groups and tables hold their fields inside. */
export const FieldCard = memo(function FieldCard({
  field,
  selected,
  readOnly,
  onSelect,
  onRemove,
  children,
  handle,
}: {
  field: BuilderField;
  selected: boolean;
  readOnly: boolean;
  onSelect: (path: FieldPath) => void;
  onRemove: (path: FieldPath) => void;
  children?: React.ReactNode;
  handle?: React.ReactNode;
}) {
  const p = field.props;
  const width = field.kind && field.kind !== "group" && field.kind !== "table" ? (p.width ?? "full") : "full";
  return (
    <div
      className={`${styles.card} ${selected ? styles.selected : ""} ${field.kind ? "" : styles.readOnly} ${styles[width]}`}
      data-pointer={field.pointer}
    >
      <div className={styles.cardHead}>
        {handle}
        <button type="button" className={styles.cardTitle} onClick={() => onSelect(field.path)} aria-pressed={selected}>
          <span>
            {p.label ?? field.key}
            {p.required && <span className={styles.required}> *</span>}
          </span>
          <span className={styles.kind}>{field.kind ? KIND_LABEL[field.kind] : "แก้ใน JSON"}</span>
          <code>{field.key}</code>
        </button>
        {!readOnly && (
          <button type="button" className={styles.remove} onClick={() => onRemove(field.path)} aria-label={`ลบ ${p.label ?? field.key}`}>
            ×
          </button>
        )}
      </div>
      {children}
    </div>
  );
});

/** The two sections of the form, without drag and drop (T7); BuilderCanvas in T8 adds it. */
export function BuilderCanvas({ tree, selected, readOnly, onSelect, onSection, onRemove }: CanvasProps) {
  const list = (fields: BuilderField[]): React.ReactNode =>
    fields.map((f) => (
      <FieldCard
        key={f.pointer}
        field={f}
        selected={isSelected(selected, f)}
        readOnly={readOnly}
        onSelect={onSelect}
        onRemove={onRemove}
      >
        {(f.kind === "group" || f.kind === "table") && (
          <div className={f.kind === "table" ? styles.columns : styles.fields}>
            {f.children.length ? list(f.children) : <p className={styles.empty}>ลากช่องมาวางที่นี่</p>}
          </div>
        )}
      </FieldCard>
    ));
  return (
    <div className={styles.canvas}>
      <section className={styles.section} onFocus={() => onSection("params")} onClick={() => onSection("params")}>
        <h3>ข้อมูลเอกสาร</h3>
        <div className={styles.fields}>{tree.params.length ? list(tree.params) : <p className={styles.empty}>ยังไม่มี parameter</p>}</div>
      </section>
      <section className={styles.section} onFocus={() => onSection("data")} onClick={() => onSection("data")}>
        <h3>ข้อมูล</h3>
        <div className={styles.fields}>{tree.data.length ? list(tree.data) : <p className={styles.empty}>ยังไม่มีช่อง</p>}</div>
      </section>
    </div>
  );
}
