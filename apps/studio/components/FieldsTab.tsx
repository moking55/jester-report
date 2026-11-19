"use client";

import { useState } from "react";

import { fieldRefs, type FieldRef } from "@/lib/field-refs";

import styles from "./FieldsTab.module.css";

type Props = {
  /** The draft's text files as the editor holds them now (saved or not). */
  read: () => Record<string, string>;
};

/** "ช่องข้อมูล" (SPEC-studio v1.6): every field with what to paste in a template, and a hint for unused ones. */
export function FieldsTab({ read }: Props) {
  const [refs, setRefs] = useState(() => fieldRefs(read()));
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(ref: FieldRef) {
    try {
      await navigator.clipboard.writeText(ref.expression);
      setCopied(ref.pointer);
    } catch {
      setCopied(null);
    }
  }

  const row = (ref: FieldRef, depth: number): React.ReactNode => (
    <li key={ref.pointer}>
      <div className={styles.row} style={{ paddingLeft: `${depth * 18}px` }}>
        <span className={styles.label}>{ref.label}</span>
        <code className={styles.expr}>{ref.expression}</code>
        {ref.unused && (
          <span className={styles.unused} title="ไม่พบชื่อนี้ในไฟล์ .html หรือ expression ของ report.json">
            ไม่ถูกใช้
          </span>
        )}
        <button type="button" onClick={() => copy(ref)} aria-label={`คัดลอก ${ref.expression}`}>
          {copied === ref.pointer ? "คัดลอกแล้ว" : "คัดลอก"}
        </button>
      </div>
      {ref.children.length > 0 && <ul>{ref.children.map((c) => row(c, depth + 1))}</ul>}
    </li>
  );

  return (
    <div className={styles.tab}>
      <p className={styles.hint}>
        คัดลอก expression ไปวางในเทมเพลต · &quot;ไม่ถูกใช้&quot; ตรวจจากชื่อในไฟล์แบบข้อความ — การเข้าถึงแบบ{" "}
        <code>data[k]</code> จะไม่ถูกนับ{" "}
        <button type="button" onClick={() => setRefs(fieldRefs(read()))}>
          อ่านใหม่
        </button>
      </p>
      {!refs.ok ? (
        <p className={styles.hint}>{refs.error}</p>
      ) : (
        <>
          {refs.value.params.length > 0 && (
            <section>
              <h4>ข้อมูลเอกสาร (parameters)</h4>
              <ul>{refs.value.params.map((r) => row(r, 0))}</ul>
            </section>
          )}
          <section>
            <h4>ข้อมูล</h4>
            <ul>{refs.value.data.map((r) => row(r, 0))}</ul>
          </section>
        </>
      )}
    </div>
  );
}
