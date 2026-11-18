"use client";

import { useRef, useState, useTransition } from "react";

import { createApiKey, revokeApiKey } from "@/lib/actions/settings";
import { when } from "@/lib/format";
import { keyOptions } from "@/lib/keys";
import type { components } from "@/lib/types.gen";

import styles from "./Settings.module.css";

type ApiKey = components["schemas"]["ApiKey"];

type TemplateChoice = { id: string; name: string };

export function ApiKeysPanel({ keys, templates, today }: { keys: ApiKey[]; templates: TemplateChoice[]; today: string }) {
  // the only copy of a new secret: gone when the box is closed or the page is left
  const [created, setCreated] = useState<{ id: string; name: string; secret: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const secretInput = useRef<HTMLInputElement>(null);

  const create = (form: FormData) =>
    startTransition(async () => {
      const checked = keyOptions(
        {
          expires: String(form.get("expires") ?? ""),
          templates: form.getAll("templates").map(String),
          limit: String(form.get("limit") ?? "").trim(),
        },
        today,
      );
      if (!checked.ok) return setError(checked.error);
      const result = await createApiKey(String(form.get("name") ?? ""), checked.options);
      if (result.ok) {
        setCreated({ id: result.id, name: result.name, secret: result.secret });
        setCopied(false);
        setError(null);
      } else {
        setError(result.error);
      }
    });

  const revoke = (key: ApiKey) => {
    if (!window.confirm(`เพิกถอน key "${key.name}"? ระบบที่ใช้ key นี้จะเรียก render ไม่ได้ทันที`)) return;
    if (key.id === created?.id) setCreated(null); // revoking another key keeps an uncopied secret
    startTransition(async () => setError(await revokeApiKey(key.id)));
  };

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.secret);
      setCopied(true);
    } catch {
      // plain http has no clipboard API, and a browser may refuse it; the old command still works there
      secretInput.current?.select();
      setCopied(document.execCommand("copy"));
    }
  };

  return (
    <div className={styles.panel}>
      {created && (
        <div className={styles.secret} role="region" aria-label="secret ของ key ใหม่">
          <p>
            <b>secret ของ key &quot;{created.name}&quot; แสดงครั้งเดียวเท่านั้น</b> คัดลอกเก็บไว้ตอนนี้
            ปิดกล่องนี้แล้วจะดูอีกไม่ได้ ถ้าหายต้องเพิกถอนแล้วสร้างใหม่
          </p>
          <div className={styles.row}>
            <input
              ref={secretInput}
              readOnly
              value={created.secret}
              aria-label="secret"
              className={styles.code}
              onFocus={(e) => e.currentTarget.select()}
            />
            <button type="button" className={styles.primary} onClick={copy}>
              {copied ? "คัดลอกแล้ว" : "คัดลอก"}
            </button>
            <button type="button" onClick={() => setCreated(null)}>
              ปิด (เก็บแล้ว)
            </button>
          </div>
        </div>
      )}

      {keys.length === 0 ? (
        <p className={styles.muted}>ยังไม่มี API key</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ชื่อ</th>
              <th>ขึ้นต้นด้วย</th>
              <th>สร้างโดย</th>
              <th>สร้างเมื่อ</th>
              <th>ใช้ล่าสุด</th>
              <th>หมดอายุ</th>
              <th>รายงาน</th>
              <th>จำกัด/นาที</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key.id}>
                <td>{key.name}</td>
                <td>
                  <code>{key.prefix}…</code>
                </td>
                <td>{key.createdBy ?? "–"}</td>
                <td>{when(key.createdAt)}</td>
                <td>{when(key.lastUsedAt)}</td>
                <td>{key.expiresAt ? when(key.expiresAt) : "ไม่หมดอายุ"}</td>
                <td>{key.templates ? key.templates.join(", ") : "ทุกรายงาน"}</td>
                <td>{key.rateLimitPerMinute ?? "ไม่จำกัด"}</td>
                <td>
                  <button type="button" className={styles.danger} disabled={pending} onClick={() => revoke(key)}>
                    เพิกถอน
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      <form action={create} className={styles.form} aria-label="สร้าง API key">
        <h2>สร้าง API key</h2>
        <label>
          ชื่อ (เช่น ระบบที่จะใช้)
          <input name="name" required maxLength={80} placeholder="ERP" autoComplete="off" />
        </label>
        <label>
          หมดอายุสิ้นวันที่ (เว้นว่าง = ไม่หมดอายุ)
          <input name="expires" type="date" min={today} />
        </label>
        <label>
          render ได้ไม่เกินต่อนาที (เว้นว่าง = ไม่จำกัด)
          <input name="limit" type="number" min={1} max={10000} step={1} inputMode="numeric" />
        </label>
        <fieldset className={styles.choices}>
          <legend>ใช้กับรายงาน (ไม่เลือก = ทุกรายงาน)</legend>
          {templates.length === 0 && <p className={styles.muted}>ยังไม่มีรายงาน</p>}
          {templates.map((t) => (
            <label key={t.id}>
              <input type="checkbox" name="templates" value={t.id} /> {t.name} <code>{t.id}</code>
            </label>
          ))}
        </fieldset>
        <button type="submit" className={styles.primary} disabled={pending}>
          {pending ? "กำลังสร้าง…" : "สร้าง key"}
        </button>
      </form>
    </div>
  );
}
