"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import type { Problem } from "@/lib/api-core";
import { idFromFile, isWordFile, nameFromFile } from "@/lib/import-id";
import { problemMessage } from "@/lib/messages";
import { readManifest, type ZipManifest } from "@/lib/zip";

import styles from "./RenderDialog.module.css";

// ask: the id exists, replace its draft or pick another id; archived: the same, but the report is in the archive
// and replacing it brings it back (v1.14.1). A Word file that came in with warnings opens a second dialog on top (v1.15)
type Step = "pick" | "ask" | "archived";
type Warning = { code: string; message: string };

/**
 * "นำเข้า (.zip)": a template zip becomes a new report or replaces a draft.
 * "นำเข้า Word (.docx)" (`word`, v1.15): a Word form becomes a new report, never a replace.
 */
export function ImportDialog({ className, word = false }: { className?: string; word?: boolean }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const result = useRef<HTMLDialogElement>(null); // stacked over `dialog`: what the Word file could not bring
  const idInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [manifest, setManifest] = useState<ZipManifest | null>(null);
  const [ready, setReady] = useState(false); // a Word file was chosen (the zip dialog waits for its manifest)
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [step, setStep] = useState<Step>("pick");
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(chosen: File | null) {
    setFile(chosen);
    setStep("pick");
    setError(null);
    if (word) {
      const ok = !!chosen && isWordFile(chosen);
      setReady(ok);
      if (chosen && !ok) return setError("เลือกไฟล์ Word (.docx) — zip ของ Jester ใช้ปุ่ม \"นำเข้า (.zip)\"");
      if (chosen) {
        setId(idFromFile(chosen.name));
        setName(nameFromFile(chosen.name));
      }
      return;
    }
    const found = chosen ? await readManifest(chosen) : null;
    setManifest(found);
    setId(found?.id ?? "");
    if (chosen && !found)
      setError(
        chosen && isWordFile(chosen)
          ? "ไฟล์นี้เป็น Word: ใช้ปุ่ม \"นำเข้า Word (.docx)\""
          : "ไฟล์นี้ไม่ใช่ zip ที่ export จาก Jester",
      );
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
          setCreated({ id: body.template.id, name });
          return requestAnimationFrame(() => result.current?.showModal()); // on top of this dialog: read, then open
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
        {word ? "นำเข้า Word (.docx)" : "นำเข้า (.zip)"}
      </button>
      <dialog ref={dialog} className={styles.dialog} aria-label={word ? "นำเข้าแบบฟอร์ม Word" : "นำเข้ารายงาน"}>
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            send(false);
          }}
        >
          <div className={styles.head}>
            <h2>{word ? "นำเข้าแบบฟอร์ม Word เป็นรายงานใหม่" : "นำเข้ารายงานจาก .zip"}</h2>
            <button type="button" className={styles.close} onClick={() => dialog.current?.close()} aria-label="ปิด">
              ×
            </button>
          </div>
          <label>
            {word ? "ไฟล์แบบฟอร์ม Word (.docx)" : "ไฟล์ zip ที่ export จาก Jester"}
            <input
              type="file"
              accept={word ? ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" : ".zip,application/zip"}
              required
              onChange={(e) => choose(e.target.files?.[0] ?? null)}
            />
          </label>
          {manifest && (
            <p>
              รายงานในไฟล์: <b>{manifest.name}</b> (<code>{manifest.id}</code>)
            </p>
          )}
          {word && ready && (
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
          {step === "archived" ? (
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
              <button type="submit" className={styles.primary} disabled={busy || !(word ? ready : manifest)}>
                {busy ? "กำลังนำเข้า…" : "นำเข้า"}
              </button>
            </div>
          )}
          {error && <p role="alert">{error}</p>}
        </form>
      </dialog>
      <dialog
        ref={result}
        className={styles.dialog}
        aria-label="ผลการนำเข้า Word"
        onClose={() => {
          // closed without opening the Designer: the report exists, so show it in the catalog
          if (created) {
            dialog.current?.close();
            router.refresh();
          }
        }}
      >
        {created && (
          <div className={styles.form} role="status">
            <div className={styles.head}>
              <h2>นำเข้าแล้ว แต่มีบางส่วนที่แปลงไม่ได้</h2>
              <button type="button" className={styles.close} onClick={() => result.current?.close()} aria-label="ปิด">
                ×
              </button>
            </div>
            <p>
              <b>{created.name}</b> (<code>{created.id}</code>) ถูกสร้างเป็นรายงานใหม่แล้ว ส่วนต่อไปนี้ไม่ได้ถูกนำเข้า:
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
                  const id = created.id;
                  setCreated(null); // so onClose below does not also refresh
                  result.current?.close();
                  dialog.current?.close();
                  router.push(`/templates/${id}/designer`);
                }}
              >
                เปิดใน Designer
              </button>
              <button type="button" onClick={() => result.current?.close()}>
                ปิด
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
