"use client";

import { useActionState, useRef } from "react";

import type { FormState } from "@/lib/actions/auth";
import { duplicateTemplate } from "@/lib/actions/templates";

import styles from "./RenderDialog.module.css";

/** A button that asks for the new id and name, then copies the draft or one version. */
export function DuplicateDialog({
  templateId,
  version = "draft",
  label = "ทำสำเนา…",
  className,
}: {
  templateId: string;
  version?: "draft" | number;
  label?: string;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState<FormState, FormData>(duplicateTemplate, { error: null });
  const from = version === "draft" ? "draft" : `v${version}`;
  return (
    <>
      <button type="button" className={className} onClick={() => dialog.current?.showModal()}>
        {label}
      </button>
      <dialog ref={dialog} className={styles.dialog} aria-label={`ทำสำเนา ${templateId}`}>
        <form action={action} className={styles.form}>
          <div className={styles.head}>
            <h2>
              ทำสำเนา <code>{templateId}</code> ({from})
            </h2>
            <button type="button" className={styles.close} onClick={() => dialog.current?.close()} aria-label="ปิด">
              ×
            </button>
          </div>
          <input type="hidden" name="source" value={templateId} />
          <input type="hidden" name="version" value={String(version)} />
          <label>
            id ใหม่
            <input
              name="id"
              required
              pattern="[a-z0-9][a-z0-9\-]{1,62}"
              defaultValue={state.values?.id ?? `${templateId}-copy`.slice(0, 63)}
              autoComplete="off"
            />
          </label>
          <label>
            ชื่อรายงาน
            <input name="name" required maxLength={120} defaultValue={state.values?.name} />
          </label>
          <div className={styles.buttons}>
            <button type="submit" className={styles.primary} disabled={pending}>
              {pending ? "กำลังทำสำเนา…" : "ทำสำเนา"}
            </button>
          </div>
          {state.error && <p role="alert">{state.error}</p>}
        </form>
      </dialog>
    </>
  );
}
