"use client";

import { useEffect, useRef } from "react";
import { useImmer } from "use-immer";

import { listVersions } from "@/lib/actions/versions";
import { curlExample, renderBody, type RenderForm } from "@/lib/render";
import type { Version } from "@/lib/workspace";

import styles from "./RenderDialog.module.css";

type Props = { templateId: string; params: string; data: string; onClose: () => void };

/** Render a published version like another system would; shows the matching curl with a placeholder key. */
export function RenderDialog({ templateId, params, data, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, update] = useImmer<{ form: RenderForm; versions: Version[] }>({
    form: { templateId, version: "published", params, data, filename: "" },
    versions: [],
  });

  useEffect(() => {
    dialog.current?.showModal();
    listVersions(templateId).then((result) => {
      if (result.ok)
        update((s) => {
          s.versions = result.data;
        });
    });
  }, [templateId, update]);

  const set = (key: keyof RenderForm) => (e: { target: { value: string } }) => {
    const value = e.target.value;
    update((s) => {
      s.form[key] = value;
    });
  };
  const built = renderBody(state.form);

  return (
    <dialog ref={dialog} className={styles.dialog} onClose={onClose} aria-label="Render">
      <form method="post" action={`/render/${templateId}`} target="_blank" className={styles.form}>
        <div className={styles.head}>
          <h2>Render {templateId}</h2>
          <button type="button" className={styles.close} onClick={() => dialog.current?.close()} aria-label="ปิด">
            ×
          </button>
        </div>
        {state.versions.length === 0 && (
          <p className={styles.warn}>ยังไม่มีเวอร์ชันที่ publish — render ใช้ได้เฉพาะเวอร์ชันที่ publish แล้ว</p>
        )}
        <label>
          version
          <select name="version" value={state.form.version} onChange={set("version")}>
            <option value="published">published (เวอร์ชันที่ alias ชี้อยู่ตอนเรียก)</option>
            {state.versions.map((v) => (
              <option key={v.version} value={String(v.version)}>
                v{v.version}
                {v.isPublished ? " (published)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          params
          <textarea name="params" rows={3} value={state.form.params} onChange={set("params")} spellCheck={false} />
        </label>
        <label>
          data
          <textarea name="data" rows={8} value={state.form.data} onChange={set("data")} spellCheck={false} />
        </label>
        <label>
          filename (เว้นว่างได้)
          <input name="filename" value={state.form.filename} onChange={set("filename")} placeholder="report.pdf" />
        </label>
        <h3>ตัวอย่างสำหรับระบบอื่น</h3>
        <pre className={styles.curl}>{"body" in built ? curlExample(built.body) : built.error}</pre>
        <p className={styles.hint}>
          ตั้ง <code>JESTER_API</code> เป็น URL ของ api แล้วแทน <code>jrk_…</code> ด้วย API key จากหน้าตั้งค่า
        </p>
        <div className={styles.buttons}>
          <button type="button" onClick={() => dialog.current?.close()}>
            ปิด
          </button>
          <button type="submit" className={styles.primary} disabled={!("body" in built) || state.versions.length === 0}>
            Render PDF (แท็บใหม่)
          </button>
        </div>
      </form>
    </dialog>
  );
}
