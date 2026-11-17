"use client";

import { useEffect, useState } from "react";
import { useImmer } from "use-immer";

import { getVersion, listVersions, setPublished } from "@/lib/actions/versions";
import { EMPTY, type Snapshot } from "@/lib/diff";
import { problemMessage } from "@/lib/messages";
import type { Version } from "@/lib/workspace";

import { DiffDialog } from "./DiffDialog";
import styles from "./VersionsPanel.module.css";

const when = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

type Props = {
  templateId: string;
  busy: boolean;
  onReset: (version: number) => void; // the workspace owns the draft, so it does the reset
  draft: () => Snapshot; // the draft as typed, for the reset diff
};

/** Published versions, newest first. Mounted while its tab is open, so it reloads every time it is shown. */
export function VersionsPanel({ templateId, busy, onReset, draft }: Props) {
  const [state, update] = useImmer<{ versions: Version[] | null; error: string | null; working: boolean }>({
    versions: null,
    error: null,
    working: false,
  });
  const [asking, setAsking] = useState<{ action: "alias" | "reset"; version: number } | null>(null);

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
  const published = state.versions.find((v) => v.isPublished)?.version ?? null;
  const snapshot = async (version: number | null) => (version === null ? { ok: true as const, data: EMPTY } : getVersion(templateId, version));
  return (
    <>
      {asking?.action === "alias" && (
        <DiffDialog
          title={`ตั้ง v${asking.version} เป็น published`}
          fromLabel={published ? `published ตอนนี้ (v${published})` : "ยังไม่มี published"}
          toLabel={`v${asking.version}`}
          load={async () => {
            const [from, to] = await Promise.all([snapshot(published), snapshot(asking.version)]);
            return !from.ok ? from : !to.ok ? to : { ok: true, data: { from: from.data, to: to.data } };
          }}
          confirmLabel={`ตั้ง v${asking.version} เป็น published`}
          onConfirm={() => makePublished(asking.version)}
          onClose={() => setAsking(null)}
        >
          <p className={styles.warn}>ระบบที่ render แบบ &quot;published&quot; จะได้เวอร์ชันนี้ทันที</p>
        </DiffDialog>
      )}
      {asking?.action === "reset" && (
        <DiffDialog
          title={`reset draft จาก v${asking.version}`}
          fromLabel="draft ตอนนี้ (รวมที่ยังไม่บันทึก)"
          toLabel={`v${asking.version}`}
          load={async () => {
            const to = await snapshot(asking.version);
            return to.ok ? { ok: true, data: { from: draft(), to: to.data } } : to;
          }}
          confirmLabel="แทน draft ด้วยเวอร์ชันนี้"
          onConfirm={() => onReset(asking.version)}
          onClose={() => setAsking(null)}
        >
          <p className={styles.warn}>การแก้ใน draft ที่ยังไม่ publish จะหายไป</p>
        </DiffDialog>
      )}
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
                  <button type="button" disabled={state.working} onClick={() => setAsking({ action: "alias", version: v.version })}>
                    ตั้งเป็น published
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setAsking({ action: "reset", version: v.version })}
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
