import Link from "next/link";

import { api } from "@/lib/api";
import { isRunId, issuer, paramTitles, paramsLine } from "@/lib/documents";
import { isTemplateId } from "@/lib/result";
import type { components } from "@/lib/types.gen";

import styles from "../history/history.module.css";
import own from "./documents.module.css";

type TemplateSummary = components["schemas"]["TemplateSummary"];
type DocumentSummary = components["schemas"]["DocumentSummary"];
type RunRetention = components["schemas"]["RunRetention"];
type Search = { template?: string; q?: string; before?: string };
type VersionFiles = { files: { name: string; content: string }[] };

/** Parameter titles of every (template, version) on this page; a version that cannot be read shows keys. */
async function titlesFor(items: DocumentSummary[]): Promise<Map<string, Record<string, string>>> {
  const keys = [...new Set(items.map((d) => `${d.templateId}/${d.version}`))];
  const pairs = await Promise.all(
    keys.map(async (key) => {
      try {
        const { files } = await api<VersionFiles>(`/v1/templates/${key.replace("/", "/versions/")}`);
        return [key, paramTitles(files.find((f) => f.name === "report.json")?.content)] as const;
      } catch {
        return [key, {}] as const;
      }
    }),
  );
  return new Map(pairs);
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const template = search.template && isTemplateId(search.template) ? search.template : "";
  const q = (search.q ?? "").trim().slice(0, 100);
  const before = search.before && isRunId(search.before) ? search.before : "";

  const query = new URLSearchParams({ limit: "50" });
  if (template) query.set("templateId", template);
  if (q) query.set("q", q);
  if (before) query.set("before", before);
  const [page, templates, retention] = await Promise.all([
    api<{ items: DocumentSummary[]; next: string | null }>(`/v1/documents?${query}`),
    api<TemplateSummary[]>("/v1/templates"),
    api<RunRetention>("/v1/runs/retention"),
  ]);
  const filters = new URLSearchParams({ ...(template && { template }), ...(q && { q }) });
  const titles = await titlesFor(page.items);

  return (
    <section className={styles.page}>
      <h1>เอกสารที่ออก</h1>
      <p className={styles.sub}>
        PDF ทุกใบที่ออกจาก version ที่ publish แล้ว ทั้งจากฟอร์มและผ่าน API ·{" "}
        {retention.days == null ? "เก็บตลอด" : `ลบเมื่อเก่ากว่า ${retention.days} วัน`} ·{" "}
        <Link href="/settings?tab=retention">ตั้งนโยบายเก็บ</Link>
      </p>

      <form className={styles.filters} method="get" role="search">
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
        <label className={own.search}>
          ค้นหา
          <input
            type="search"
            name="q"
            defaultValue={q}
            maxLength={100}
            placeholder="เลขเอกสาร ชื่อลูกค้า หรือค่าใดก็ได้ที่กรอก"
          />
        </label>
        <button type="submit">ค้นหา</button>
      </form>

      {page.items.length === 0 ? (
        <p className={styles.muted}>
          {q
            ? `ไม่พบเอกสารที่ตรงกับ “${q}”`
            : "ยังไม่มีเอกสาร — ออกจากปุ่ม ออกเอกสาร หรือผ่าน API แล้วจะขึ้นที่นี่"}
        </p>
      ) : (
        <div className={styles.runs}>
          <div className={`${styles.head} ${own.row}`}>
            <span>เวลา</span>
            <span>รายงาน</span>
            <span>ผู้ออก</span>
            <span>ค่าที่กรอก</span>
            <span>ชื่อไฟล์</span>
            <span />
          </div>
          {page.items.map((doc) => (
            <div key={doc.runId} className={own.row}>
              <span>{when(doc.createdAt)}</span>
              <span>
                {doc.templateId} <small>v{doc.version ?? "?"}</small>
              </span>
              <span>{issuer(doc.caller)}</span>
              <span className={own.params}>{paramsLine(doc.params as Record<string, unknown>, titles.get(`${doc.templateId}/${doc.version}`))}</span>
              <span className={own.params}>{doc.filename}</span>
              <span>
                <a href={`/documents/${doc.runId}`} download>
                  ดาวน์โหลด
                </a>
              </span>
            </div>
          ))}
        </div>
      )}
      <nav className={styles.pager}>
        {before && <Link href={`/documents?${filters}`}>« หน้าแรก</Link>}
        {page.next && (
          <Link href={`/documents?${new URLSearchParams({ ...Object.fromEntries(filters), before: page.next })}`}>
            หน้าถัดไป »
          </Link>
        )}
      </nav>
    </section>
  );
}
