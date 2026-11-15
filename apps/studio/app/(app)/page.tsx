import { cookies } from "next/headers";
import Link from "next/link";

import { CreateTemplate } from "@/components/CreateTemplate";
import { NewTemplateCard } from "@/components/NewTemplateCard";
import { ViewToggle } from "@/components/ViewToggle";
import { api } from "@/lib/api";
import { when } from "@/lib/format";
import { VIEW_COOKIE } from "@/lib/session";
import type { components } from "@/lib/types.gen";

import styles from "./catalog.module.css";

type TemplateSummary = components["schemas"]["TemplateSummary"];

/** The last render as a pill; everything comes with the catalog list, so no request per card. */
function LastRun({ run }: { run: TemplateSummary["lastRun"] }) {
  if (!run)
    return (
      <span className={`${styles.pill} ${styles.none}`}>ยังไม่เคย render</span>
    );
  return run.status === "succeeded" ? (
    <span className={`${styles.pill} ${styles.ok}`}>
      <span className={styles.dot} />
      Render ล่าสุดผ่าน · {run.pages ?? "?"} หน้า
    </span>
  ) : (
    <span className={`${styles.pill} ${styles.err}`}>
      <span className={styles.dot} />
      Render ล่าสุดล้มเหลว · {run.errorCode ?? "?"}
    </span>
  );
}

export default async function CatalogPage() {
  const templates = await api<TemplateSummary[]>("/v1/templates");
  const view =
    (await cookies()).get(VIEW_COOKIE)?.value === "cards" ? "cards" : "table";
  return (
    <section className={styles.page}>
      <div className={styles.heading}>
        <h1>รายงาน</h1>
        <ViewToggle view={view} />
      </div>
      <p className={styles.sub}>
        {templates.length} รายงาน · เปิดเพื่อแก้ template ดูตัวอย่าง PDF และ publish
      </p>
      {view === "table" ? (
        <Table templates={templates} />
      ) : (
        <Cards templates={templates} />
      )}
    </section>
  );
}

function Table({ templates }: { templates: TemplateSummary[] }) {
  return (
    <>
      <CreateTemplate />
      {templates.length === 0 ? (
        <p className={styles.sub}>ยังไม่มีรายงาน สร้างจาก starter ด้านบนได้เลย</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ชื่อ</th>
              <th>id</th>
              <th>Published</th>
              <th>Draft</th>
              <th>Render ล่าสุด</th>
              <th>แก้ล่าสุด</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link href={`/templates/${t.id}`}>{t.name}</Link>
                </td>
                <td>
                  <code>{t.id}</code>
                </td>
                <td>
                  {t.publishedVersion === null ? "—" : `v${t.publishedVersion}`}
                </td>
                <td>
                  r{t.draftRevision}
                  {t.draftChangedSincePublish && (
                    <span className={styles.changed}> แก้หลัง publish</span>
                  )}
                </td>
                <td>
                  <LastRun run={t.lastRun} />
                </td>
                <td>{when(t.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function Cards({ templates }: { templates: TemplateSummary[] }) {
  return (
    <div className={styles.grid}>
      {templates.map((t) => (
        <article key={t.id} className={styles.card}>
          <h3>
            <span className={styles.docIcon} aria-hidden="true" />
            {t.name}
          </h3>
          <div className={styles.meta}>
            <code>{t.id}</code>
            <span>
              {t.publishedVersion === null
                ? "ยังไม่ publish"
                : `v${t.publishedVersion}`}{" "}
              · {t.page?.size ?? "A4"}{" "}
              {t.page?.orientation === "landscape" ? "แนวนอน" : "แนวตั้ง"}
            </span>
          </div>
          <div className={styles.pills}>
            <LastRun run={t.lastRun} />
            {t.draftChangedSincePublish && (
              <span className={`${styles.pill} ${styles.warn}`}>
                <span className={styles.dot} />
                draft แก้หลัง publish
              </span>
            )}
          </div>
          <div className={styles.meta}>
            draft r{t.draftRevision} · แก้ล่าสุด {when(t.updatedAt)}
          </div>
          <div className={styles.row}>
            <Link href={`/templates/${t.id}`} className={styles.open}>
              เปิด
            </Link>
          </div>
        </article>
      ))}
      <NewTemplateCard empty={templates.length === 0} />
    </div>
  );
}
