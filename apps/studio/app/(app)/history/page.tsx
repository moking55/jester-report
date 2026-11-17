import Link from "next/link";

import { RunDetails } from "@/components/RunDetails";
import { api } from "@/lib/api";
import { isTemplateId } from "@/lib/result";
import type { components } from "@/lib/types.gen";
import type { Run } from "@/lib/workspace";

import styles from "./history.module.css";

type TemplateSummary = components["schemas"]["TemplateSummary"];
type Search = { template?: string; status?: string; before?: string };

const when = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Bangkok" });

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const template = search.template && isTemplateId(search.template) ? search.template : "";
  const status = search.status === "succeeded" || search.status === "failed" ? search.status : "";

  const query = new URLSearchParams({ limit: "50" });
  if (template) query.set("templateId", template);
  if (status) query.set("status", status);
  if (search.before) query.set("before", search.before);
  const [page, templates] = await Promise.all([
    api<{ items: Run[]; next?: string | null }>(`/v1/runs?${query}`),
    api<TemplateSummary[]>("/v1/templates"),
  ]);
  const filters = new URLSearchParams({ ...(template && { template }), ...(status && { status }) });

  return (
    <section className={styles.page}>
      <h1>ประวัติ Render</h1>
      <p className={styles.sub}>
        ทุก render และ preview พร้อม provenance สำหรับ reproduce และ debug ·{" "}
        <Link href="/settings?tab=retention">ตั้งนโยบายเก็บประวัติ</Link>
      </p>

      <form className={styles.filters} method="get">
        <label>
          รายงาน
          <select name="template" defaultValue={template}>
            <option value="">ทั้งหมด</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.id})
              </option>
            ))}
          </select>
        </label>
        <label>
          สถานะ
          <select name="status" defaultValue={status}>
            <option value="">ทั้งหมด</option>
            <option value="succeeded">สำเร็จ</option>
            <option value="failed">ล้มเหลว</option>
          </select>
        </label>
        <button type="submit">กรอง</button>
      </form>

      {page.items.length === 0 ? (
        <p className={styles.muted}>ไม่มี run ตามเงื่อนไขนี้</p>
      ) : (
        <div className={styles.runs}>
          <div className={styles.head}>
            <span>เวลา</span>
            <span>รายงาน</span>
            <span>เวอร์ชัน</span>
            <span>สถานะ</span>
            <span>ผู้เรียก</span>
            <span>หน้า · ms</span>
          </div>
          {page.items.map((run) => (
            <details key={run.id} className={styles.run}>
              <summary>
                <span>{when(run.createdAt)}</span>
                <span>{run.templateId}</span>
                <span>{run.kind === "preview" ? `preview r${run.draftRevision ?? "?"}` : `v${run.version ?? "?"}`}</span>
                <span className={run.status === "succeeded" ? styles.ok : styles.failed}>
                  {run.status === "succeeded" ? "สำเร็จ" : `ล้มเหลว ${run.errorCode ?? ""}`}
                </span>
                <span>
                  {run.caller.name ?? run.caller.id} <small>({run.caller.type})</small>
                </span>
                <span>
                  {run.pages ?? "–"} · {run.durationMs ?? "–"}
                </span>
              </summary>
              <RunDetails run={run} />
            </details>
          ))}
        </div>
      )}
      <nav className={styles.pager}>
        {search.before && <Link href={`/history?${filters}`}>« หน้าแรก</Link>}
        {page.next && <Link href={`/history?${new URLSearchParams({ ...Object.fromEntries(filters), before: page.next })}`}>หน้าถัดไป »</Link>}
      </nav>

    </section>
  );
}
