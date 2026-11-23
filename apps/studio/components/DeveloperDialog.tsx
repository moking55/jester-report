"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { fieldRows, formSpec, type FieldRow } from "@/lib/form";
import { curlExample, fetchExample, pythonExample } from "@/lib/render";
import type { IssueSource } from "@/lib/workspace";

import styles from "./RenderDialog.module.css";

const LANGS = [
  ["curl", curlExample],
  ["JavaScript", fetchExample],
  ["Python", pythonExample],
] as const;

const TOP: FieldRow[] = [
  { pointer: "/template/id", type: "string", required: true, label: "รหัสรายงาน (slug)" },
  { pointer: "/template/version", type: '"published" | integer', required: true, label: "\"published\" = เวอร์ชันที่ publish อยู่ตอนเรียก" },
  { pointer: "/filename", type: "string", required: false, label: "ชื่อไฟล์ PDF ที่ได้ (ไม่ส่ง = ตั้งจากรายงาน)" },
  { pointer: "/tags", type: "string[]", required: false, label: "tag ของเอกสาร (ไม่ส่ง = สำเนา tag ของรายงาน, [] = ไม่มี tag)" },
];

/** A real 422 shape (render_service, problem_response) pointed at a field of this report. */
function problemExample(rows: FieldRow[]): string {
  const param = rows.find((r) => r.pointer.startsWith("/params/") && r.required);
  const data = rows.find((r) => r.pointer.startsWith("/data/") && r.required);
  const problems = [
    param && { severity: "error", code: "PARAM_REQUIRED", message: `parameter '${param.pointer.slice(8)}' is required`, pointer: param.pointer },
    data && { severity: "error", code: "DATA_INVALID", message: `'${data.pointer.split("/").pop()}' is a required property`, pointer: data.pointer.slice(0, data.pointer.lastIndexOf("/")) },
  ].filter(Boolean);
  return JSON.stringify(
    {
      type: "https://jester-report.dev/errors/input-invalid",
      title: "Input invalid",
      status: 422,
      code: "INPUT_INVALID",
      detail: "params or data do not fit the template",
      retryable: false,
      runId: "019aa61f3c207d3e8a91c0",
      problems,
    },
    null,
    2,
  );
}

/** "สำหรับนักพัฒนา" in the issue mode: the request another system sends, ready to run, and what each field means. */
export function DeveloperDialog({ body, blank = false, source, onClose }: { body: string; blank?: boolean; source: IssueSource; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [lang, setLang] = useState(0);
  const [copied, setCopied] = useState(false);
  const code = LANGS[lang][1](body, blank ? "?allowEmpty=true" : ""); // v1.14: the form's blank box
  const rows = useMemo(() => fieldRows(formSpec(source.reportJson, source.schemaJson, source.formJson)), [source]);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false); // plain http has no clipboard API: the text can still be selected by hand
    }
  }

  return (
    <dialog ref={dialog} className={styles.dialog} onClose={onClose} aria-label="สำหรับนักพัฒนา">
      <div className={styles.form}>
        <div className={styles.head}>
          <h2>เรียกจากระบบอื่น</h2>
          <button type="button" className={styles.close} onClick={() => dialog.current?.close()} aria-label="ปิด">
            ×
          </button>
        </div>
        <p className={styles.hint}>
          <code>POST /v1/render</code> ด้วยค่าในฟอร์มตอนนี้ ช่องที่ยังว่างเติมจากข้อมูลตัวอย่างให้ จึงคัดลอกไปยิงได้ทันที (version ที่
          publish) · <Link href="/api/reference">API docs ฉบับเต็ม</Link>
        </p>

        <div className={styles.tabs} role="group" aria-label="ภาษา">
          {LANGS.map(([name], i) => (
            <button key={name} type="button" aria-pressed={i === lang} onClick={() => (setLang(i), setCopied(false))}>
              {name}
            </button>
          ))}
        </div>
        <pre className={styles.curl} aria-label={`ตัวอย่าง ${LANGS[lang][0]}`}>
          {code}
        </pre>
        <p className={styles.hint}>
          ตั้ง <code>JESTER_API</code> เป็น URL ของ api และ <code>JESTER_API_KEY</code> เป็น API key จาก{" "}
          <Link href="/settings?tab=keys">ตั้งค่า › API keys</Link> (ส่งใน header <code>Authorization: Bearer jrk_…</code>)
        </p>

        <h3>ผลลัพธ์</h3>
        <p className={styles.hint}>
          สำเร็จได้ <code>200</code> เป็น <code>application/pdf</code> พร้อม header <code>Jester-Run-Id</code> (ใช้ค้นใน ประวัติ
          Render และเอกสารที่ออก) และ <code>Jester-Template-Version</code> (เลขเวอร์ชันที่ใช้จริง) ไม่สำเร็จได้{" "}
          <code>application/problem+json</code> curl ข้างบนแสดงบรรทัดสถานะและ header ก่อน ถ้าไม่ใช่ <code>200</code> ไฟล์ report.pdf จะเป็น JSON นั้น
        </p>

        <h3>ฟิลด์</h3>
        <div className={styles.fields}>
          <table>
            <thead>
              <tr>
                <th>pointer</th>
                <th>ชนิด</th>
                <th>ความหมาย</th>
              </tr>
            </thead>
            <tbody>
              {[...TOP, ...rows].map((r) => (
                <tr key={r.pointer}>
                  <td>
                    <code>{r.pointer}</code>
                    {r.required && <b title="ต้องส่ง"> *</b>}
                  </td>
                  <td>{r.type}</td>
                  <td>
                    {r.label}
                    {r.description && <span className={styles.hint}> — {r.description}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.hint}>* ต้องส่ง · แถวใน array แสดงเป็น /0</p>

        <h3>เมื่อผิดพลาด (ตัวอย่าง 422)</h3>
        <pre className={styles.curl} aria-label="ตัวอย่าง 422">
          {problemExample(rows)}
        </pre>
        <p className={styles.hint}>
          <code>problems[].pointer</code> ชี้ฟิลด์ตามตารางข้างบน · 401 ไม่มี key หรือ key ถูกยกเลิก · 404 ไม่พบรายงานหรือยังไม่
          publish · 429 เกินโควตาต่อนาที (ดู <code>Retry-After</code>) · 503/504 ลองใหม่ได้ (<code>retryable</code>)
        </p>

        <div className={styles.buttons}>
          <button type="button" onClick={copy}>
            {copied ? "คัดลอกแล้ว" : `คัดลอก ${LANGS[lang][0]}`}
          </button>
          <button type="button" className={styles.primary} onClick={() => dialog.current?.close()}>
            ปิด
          </button>
        </div>
      </div>
    </dialog>
  );
}
