import Link from "next/link";

import { CreateTemplate } from "@/components/CreateTemplate";
import { api } from "@/lib/api";
import type { components } from "@/lib/types.gen";

import styles from "./catalog.module.css";

type TemplateSummary = components["schemas"]["TemplateSummary"];

const when = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

export default async function CatalogPage() {
  const templates = await api<TemplateSummary[]>("/v1/templates");
  return (
    <section className={styles.page}>
      <h1>รายงาน</h1>
      <CreateTemplate />
      {templates.length === 0 ? (
        <p className={styles.empty}>ยังไม่มีรายงาน สร้างจาก starter ด้านบนได้เลย</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ชื่อ</th>
              <th>id</th>
              <th>Published</th>
              <th>Draft</th>
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
                <td>{t.publishedVersion === null ? "—" : `v${t.publishedVersion}`}</td>
                <td>
                  r{t.draftRevision}
                  {t.draftChangedSincePublish && <span className={styles.changed}> แก้หลัง publish</span>}
                </td>
                <td>{when(t.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
