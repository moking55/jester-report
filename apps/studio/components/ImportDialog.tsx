"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import type { Problem } from "@/lib/api-core";
import { idFromFile, isWordFile, nameFromFile } from "@/lib/import-id";
import { problemMessage } from "@/lib/messages";
import { readManifest, type ZipManifest } from "@/lib/zip";

import styles from "./RenderDialog.module.css";

// ask: the id exists, replace its draft or pick another id; archived: the same, but the report is in the archive
// and replacing it brings it back (v1.14.1); warnings: a Word file came in, with what it could not bring (v1.15)
type Step = "pick" | "ask" | "archived" | "warnings";
type Warning = { code: string; message: string };

/** "นำเข้า (.zip / .docx)": a template zip becomes a new report or replaces a draft; a Word form, a new report. */
export function ImportDialog({ className }: { className?: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const idInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [manifest, setManifest] = useState<ZipManifest | null>(null);
  const [word, setWord] = useState(false);
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [step, setStep] = useState<Step>("pick");
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(chosen: File | null) {
    setFile(chosen);
    setStep("pick");
    setError(null);
    const isWord = !!chosen && isWordFile(chosen);
    setWord(isWord);
    if (isWord) {
      setManifest(null);
      setId(idFromFile(chosen.name));
      setName(nameFromFile(chosen.name));
      return;
    }
    const found = chosen ? await readManifest(chosen) : null;
    setManifest(found);
    setId(found?.id ?? "");
    if (chosen && !found) setError("ไฟล์นี้ไม่ใช่ zip ที่ export จาก Jester หรือไฟล์ Word (.docx)");
  }

  const backToId = () => {
    setStep("pick");
    idInput.current?.focus();
    idInput.current?.select();
  };

  async function send(overwrite: boolean, unarchive = false) {
    if (!file) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("file", file, file.name);
    form.set("templateId", id);
    if (word) form.set("name", name);
    if (overwrite) form.set("overwrite", "1");
    if (unarchive) form.set("unarchive", "1");
    try {
      const response = await fetch("/import", { method: "POST", body: form });
      if (response.status === 401) return router.push("/login");
      const body = await response.json();
      if (response.ok && word) {
        const found: Warning[] = body.warnings ?? [];
        if (found.length) {
          setWarnings(found);
          return setStep("warnings"); // read first, then open the Designer
        }
        dialog.current?.close();
        return router.push(`/templates/${body.template.id}/designer`);
      }
      if (response.ok) {
        dialog.current?.close();
        return router.push(`/templates/${body.template.id}`);
      }
      const problem = body as Problem;
      if (response.status === 409 && problem.code === "CONFLICT" && word) {
        setError("มีรายงาน id นี้อยู่แล้ว ใช้ id ใหม่ (นำเข้า Word ได้เฉพาะเป็นรายงานใหม่)");
        return backToId();
      }
      if (response.status === 409 && problem.code === "CONFLICT" && !overwrite) return setStep("ask");
      if (response.status === 409 && problem.code === "TEMPLATE_ARCHIVED" && !unarchive) return setStep("archived");
      setError(problemMessage(problem));
    } catch {
      setError("ส่งไฟล์ไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  }

  const otherId = (
    <button type="button" onClick={backToId}>
      ใช้ id ใหม่
    </button>
  );

  return (
    <>
      <button type="button" className={className} onClick={() => dialog.current?.showModal()}>
        นำเข้า (.zip / .docx)
      </button>
      <dialog ref={dialog} className={styles.dialog} aria-label="นำเข้ารายงาน">
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            send(false);
          }}
        >
          <div className={styles.head}>
            <h2>นำเข้ารายงานจาก .zip หรือแบบฟอร์ม Word</h2>
            <button type="button" className={styles.close} onClick={() => dialog.current?.close()} aria-label="ปิด">
              ×
            </button>
          </div>
          <label>
            ไฟล์ zip ที่ export จาก Jester หรือแบบฟอร์ม Word (.docx)
            <input
              type="file"
              accept=".zip,.docx,application/zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              required
              onChange={(e) => choose(e.target.files?.[0] ?? null)}
            />
          </label>
          {manifest && (
            <p>
              รายงานในไฟล์: <b>{manifest.name}</b> (<code>{manifest.id}</code>)
            </p>
          )}
          {word && (
            <>
              <p>แบบฟอร์ม Word: สร้างรายงานใหม่ที่แก้ต่อใน Designer ได้ (ไม่ทับรายงานเดิม)</p>
              <label>
                ชื่อรายงาน
                <input name="name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
              </label>
            </>
          )}
          <label>
            id ปลายทาง
            <input
              ref={idInput}
              name="templateId"
              required
              pattern="[a-z0-9][a-z0-9\-]{1,62}"
              value={id}
              onChange={(e) => {
                setId(e.target.value);
                setStep("pick");
              }}
              autoComplete="off"
            />
          </label>
          {step === "warnings" ? (
            <div role="status">
              <p>
                นำเข้าแล้ว: <b>{name}</b> (<code>{id}</code>) มีบางส่วนที่แปลงไม่ได้
              </p>
              <ul aria-label="สิ่งที่แปลงไม่ได้">
                {warnings.map((w, i) => (
                  <li key={i}>{w.message}</li>
                ))}
              </ul>
              <div className={styles.buttons}>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => {
                    dialog.current?.close();
                    router.push(`/templates/${id}/designer`);
                  }}
                >
                  เปิดใน Designer
                </button>
              </div>
            </div>
          ) : step === "archived" ? (
            <div role="alert">
              <p>
                รายงาน id <code>{id}</code> ถูก archive อยู่ จะทับ draft ของรายงานที่ archive ด้วยไฟล์นี้และเอากลับออกจาก archive
                หรือนำเข้าเป็น id ใหม่? (version ที่ publish แล้วไม่เปลี่ยน)
              </p>
              <div className={styles.buttons}>
                <button type="button" className={styles.primary} disabled={busy} onClick={() => send(true, true)}>
                  {busy ? "กำลังนำเข้า…" : "ทับและเลิก archive"}
                </button>
                {otherId}
              </div>
            </div>
          ) : step === "ask" ? (
            <div role="alert">
              <p>
                มีรายงาน id <code>{id}</code> อยู่แล้ว จะทับ draft ของรายงานนั้นด้วยไฟล์นี้ หรือนำเข้าเป็น id ใหม่?
                (version ที่ publish แล้วไม่เปลี่ยน)
              </p>
              <div className={styles.buttons}>
                <button type="button" className={styles.primary} disabled={busy} onClick={() => send(true)}>
                  {busy ? "กำลังนำเข้า…" : "ทับ draft ของรายงานเดิม"}
                </button>
                {otherId}
              </div>
            </div>
          ) : (
            <div className={styles.buttons}>
              <button type="submit" className={styles.primary} disabled={busy || !(manifest || word)}>
                {busy ? "กำลังนำเข้า…" : "นำเข้า"}
              </button>
            </div>
          )}
          {error && <p role="alert">{error}</p>}
        </form>
      </dialog>
    </>
  );
}
