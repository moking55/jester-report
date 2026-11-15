"use client";

import { useEffect } from "react";
import { useImmer } from "use-immer";

import { listVersions, setPublished } from "@/lib/actions/versions";
import { problemMessage } from "@/lib/messages";
import type { Version } from "@/lib/workspace";

import styles from "./VersionsPanel.module.css";

const when = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

type Props = {
  templateId: string;
  busy: boolean;
  onReset: (version: number) => void; // the workspace owns the draft, so it does the reset
};

/** Published versions, newest first. Mounted while its tab is open, so it reloads every time it is shown. */
export function VersionsPanel({ templateId, busy, onReset }: Props) {
  const [state, update] = useImmer<{ versions: Version[] | null; error: string | null; working: boolean }>({
    versions: null,
    error: null,
    working: false,
  });

  async function load() {
    const result = await listVersions(templateId);
    update((s) => {
      s.versions = result.ok ? result.data : s.versions;
      s.error = result.ok ? null : problemMessage(result.problem);
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount
  }, []);

  async function makePublished(version: number) {
    if (!confirm(`ให้ "published" ชี้ไปที่ v${version}? ระบบที่ render แบบ published จะได้เวอร์ชันนี้ทันที`)) return;
    update((s) => {
      s.working = true;
    });
    const result = await setPublished(templateId, version);
    update((s) => {
      s.working = false;
      if (!result.ok) s.error = problemMessage(result.problem);
    });
    if (result.ok) await load();
  }

  if (state.versions === null) return <p className={styles.hint}>{state.error ?? "กำลังโหลด…"}</p>;
  if (state.versions.length === 0) return <p className={styles.hint}>ยังไม่เคย publish กด Publish เพื่อสร้าง v1</p>;
  return (
    <>
      {state.error && <p className={styles.error}>{state.error}</p>}
      <table className={styles.table}>
        <tbody>
          {state.versions.map((v) => (
            <tr key={v.version}>
              <td>
                <b>v{v.version}</b>
                {v.isPublished && <span className={styles.published}>published</span>}
              </td>
              <td>{when(v.publishedAt)}</td>
              <td>{v.publishedBy}</td>
              <td className={styles.note}>{v.note}</td>
              <td className={styles.actions}>
                {!v.isPublished && (
                  <button type="button" disabled={state.working} onClick={() => makePublished(v.version)}>
                    ตั้งเป็น published
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    confirm(`แทน draft ทั้งหมดด้วย v${v.version}? การแก้ใน draft ที่ยังไม่ publish จะหายไป`) &&
                    onReset(v.version)
                  }
                >
                  reset draft จากเวอร์ชันนี้
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
