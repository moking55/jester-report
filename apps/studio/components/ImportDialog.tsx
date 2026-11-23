"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import type { Problem } from "@/lib/api-core";
import { problemMessage } from "@/lib/messages";
import { readManifest, type ZipManifest } from "@/lib/zip";

import styles from "./RenderDialog.module.css";

// ask: the id exists, replace its draft or pick another id; archived: the same, but the report is in the archive
// and replacing it brings it back (v1.14.1)
type Step = "pick" | "ask" | "archived";

/** "นำเข้า (.zip)": a template zip from exportTemplate becomes a new report or replaces a draft. */
export function ImportDialog({ className }: { className?: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const idInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [manifest, setManifest] = useState<ZipManifest | null>(null);
  const [id, setId] = useState("");
  const [step, setStep] = useState<Step>("pick");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(chosen: File | null) {
    setFile(chosen);
    setStep("pick");
    setError(null);
    const found = chosen ? await readManifest(chosen) : null;
    setManifest(found);
    setId(found?.id ?? "");
    if (chosen && !found) setError("ไฟล์นี้ไม่ใช่ zip ที่ export จาก Jester");
  }

  async function send(overwrite: boolean, unarchive = false) {
    if (!file) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("file", file, file.name);
    form.set("templateId", id);
    if (overwrite) form.set("overwrite", "1");
    if (unarchive) form.set("unarchive", "1");
    try {
      const response = await fetch("/import", { method: "POST", body: form });
      if (response.status === 401) return router.push("/login");
      const body = await response.json();
      if (response.ok) {
        dialog.current?.close();
        return router.push(`/templates/${body.template.id}`);
      }
      const problem = body as Problem;
      if (response.status === 409 && problem.code === "CONFLICT" && !overwrite) return setStep("ask");
      if (response.status === 409 && problem.code === "TEMPLATE_ARCHIVED" && !unarchive) return setStep("archived");
      setError(problemMessage(problem));
    } catch {
      setError("ส่งไฟล์ไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => dialog.current?.showModal()}>
        นำเข้า (.zip)
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
            <h2>นำเข้ารายงานจาก .zip</h2>
            <button type="button" className={styles.close} onClick={() => dialog.current?.close()} aria-label="ปิด">
              ×
            </button>
          </div>
          <label>
            ไฟล์ zip ที่ export จาก Jester
            <input type="file" accept=".zip,application/zip" required onChange={(e) => choose(e.target.files?.[0] ?? null)} />
          </label>
          {manifest && (
            <p>
              รายงานในไฟล์: <b>{manifest.name}</b> (<code>{manifest.id}</code>)
            </p>
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
                <button
                  type="button"
                  onClick={() => {
                    setStep("pick");
                    idInput.current?.focus();
                    idInput.current?.select();
                  }}
                >
                  ใช้ id ใหม่
                </button>
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
                <button
                  type="button"
                  onClick={() => {
                    setStep("pick");
                    idInput.current?.focus();
                    idInput.current?.select();
                  }}
                >
                  ใช้ id ใหม่
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.buttons}>
              <button type="submit" className={styles.primary} disabled={busy || !manifest}>
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
