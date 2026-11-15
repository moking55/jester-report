import Link from "next/link";

import { RunDetails } from "@/components/RunDetails";
import { setRetention } from "@/lib/actions/runs";
import { api } from "@/lib/api";
import { isTemplateId } from "@/lib/result";
import type { components } from "@/lib/types.gen";
import type { Run } from "@/lib/workspace";

import styles from "./history.module.css";

type Retention = components["schemas"]["RunRetention"];
type TemplateSummary = components["schemas"]["TemplateSummary"];
type Search = { template?: string; status?: string; before?: string; previewDays?: string; retention?: string };

const when = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Bangkok" });

const NOTICE: Record<string, string> = {
  saved: "บันทึกนโยบายเก็บแล้ว",
  failed: "บันทึกนโยบายไม่สำเร็จ กรุณาลองใหม่",
  invalid: "จำนวนวันต้องเป็นเลขเต็ม 1–36500",
};

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const template = search.template && isTemplateId(search.template) ? search.template : "";
  const status = search.status === "succeeded" || search.status === "failed" ? search.status : "";
  const asked = Number(search.previewDays);
  const previewDays = Number.isInteger(asked) && asked >= 1 && asked <= 36500 ? asked : null;

  const query = new URLSearchParams({ limit: "50" });
  if (template) query.set("templateId", template);
  if (status) query.set("status", status);
  if (search.before) query.set("before", search.before);
  const [page, templates, retention] = await Promise.all([
    api<{ items: Run[]; next?: string | null }>(`/v1/runs?${query}`),
    api<TemplateSummary[]>("/v1/templates"),
    api<Retention>(`/v1/runs/retention${previewDays ? `?previewDays=${previewDays}` : ""}`),
  ]);
  const filters = new URLSearchParams({ ...(template && { template }), ...(status && { status }) });

  return (
    <section className={styles.page}>
      <h1>ประวัติ Render</h1>
      <p className={styles.sub}>ทุก render และ preview พร้อม provenance สำหรับ reproduce และ debug</p>

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

      <section className={styles.retention} aria-label="นโยบายเก็บ">
        <h2>นโยบายเก็บประวัติ</h2>
        {search.retention && NOTICE[search.retention] && <p role="status">{NOTICE[search.retention]}</p>}
        <p>
          ตอนนี้:{" "}
          <b>{retention.days === null ? "เก็บตลอด (ค่าเริ่มต้น)" : `เก็บ ${retention.days} วัน`}</b>
          {retention.setBy && (
            <small className={styles.muted}>
              {" "}
              ตั้งโดย {retention.setBy}
              {retention.setAt ? ` เมื่อ ${when(retention.setAt)}` : ""}
            </small>
          )}
        </p>
        {previewDays === null ? (
          <form method="get" className={styles.filters}>
            <label>
              เก็บไว้กี่วัน
              <input name="previewDays" type="number" min={1} max={36500} required />
            </label>
            <button type="submit">ดูก่อนว่าจะลบกี่รายการ</button>
          </form>
        ) : (
          <div className={styles.confirm}>
            <p>
              ถ้าเก็บ {previewDays} วัน จะลบ run ที่เก่ากว่านั้น <b>{retention.wouldDelete ?? 0} รายการ</b> ทันที และลบต่อไปเรื่อย ๆ
              (ลบแล้วกู้คืนไม่ได้)
            </p>
            <form action={setRetention}>
              <input type="hidden" name="days" value={previewDays} />
              <button type="submit" className={styles.danger}>
                ยืนยัน เก็บ {previewDays} วัน
              </button>{" "}
              <Link href="/history">ยกเลิก</Link>
            </form>
          </div>
        )}
        {retention.days !== null && (
          <form action={setRetention}>
            <input type="hidden" name="days" value="" />
            <button type="submit">กลับไปเก็บตลอด</button>
          </form>
        )}
      </section>
    </section>
  );
}
