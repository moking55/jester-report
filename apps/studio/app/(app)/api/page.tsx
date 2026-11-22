import Link from "next/link";

import { api } from "@/lib/api";
import { curlExample } from "@/lib/render";
import type { components } from "@/lib/types.gen";

import styles from "./api.module.css";

type TemplateSummary = components["schemas"]["TemplateSummary"];

const ERRORS = [
  ["401", "ไม่มี API key หรือ key ถูกยกเลิกแล้ว"],
  ["404", "ไม่พบรายงาน หรือรายงานยังไม่เคย publish"],
  ["413", "body ใหญ่เกินกำหนด"],
  ["422", "params หรือ data ไม่ผ่านการตรวจ รายละเอียดอยู่ใน problems"],
  ["502 / 504", "สร้าง PDF ไม่สำเร็จ หรือใช้เวลานานเกินไป"],
  ["503", "ระบบสร้าง PDF ยังไม่พร้อม ลองใหม่ภายหลัง"],
] as const;

/** For whoever connects another system: how to call /v1/render, which reports can be rendered, the contract. */
export default async function ApiPage() {
  const templates = await api<TemplateSummary[]>("/v1/templates");
  const published = templates.filter((t) => t.publishedVersion !== null);
  const example = published[0]?.id ?? "quotation";
  return (
    <section className={styles.page}>
      <h1>API</h1>
      <p className={styles.sub}>
        ให้ระบบอื่นสร้าง PDF จากรายงานที่ publish แล้ว ผ่าน HTTP ·{" "}
        <a href="/api/openapi.yaml" download>
          ดาวน์โหลด OpenAPI contract
        </a>
      </p>

      <h2>1. สร้าง API key</h2>
      <p>
        สร้าง key ที่ <Link href="/settings?tab=keys">ตั้งค่า › API keys</Link> key แสดงครั้งเดียวตอนสร้าง เก็บไว้ในระบบที่จะเรียก
        แล้วส่งทุกครั้งใน header <code>Authorization: Bearer jrk_…</code>
      </p>

      <h2>2. เรียก Render</h2>
      <p>
        <code>POST /v1/render</code> ส่ง JSON ที่บอกรายงาน, <code>params</code> และ <code>data</code> ได้ PDF กลับมา{" "}
        <code>version</code> เป็น <code>&quot;published&quot;</code> (เวอร์ชันที่ publish อยู่ตอนเรียก) หรือเลขเวอร์ชัน
        เลขเวอร์ชันที่ใช้จริงอยู่ใน header <code>Jester-Template-Version</code>
      </p>
      <pre className={styles.code}>
        {curlExample(`{"template":{"id":"${example}","version":"published"},"params":{},"data":{}}`)}
      </pre>
      <p className={styles.hint}>
        ตั้ง <code>JESTER_API</code> เป็น URL ของ api และ <code>JESTER_API_KEY</code> เป็น key ส่วน params และ data ของแต่ละรายงาน
        ดูได้จากปุ่ม สำหรับนักพัฒนา ในหน้าออกเอกสาร ซึ่งสร้างคำสั่ง curl, JavaScript และ Python พร้อมข้อมูลตัวอย่างให้
        · <Link href="/api/reference">API docs ฉบับเต็ม</Link>
      </p>

      <h2>3. เมื่อผิดพลาด</h2>
      <p>
        ได้ JSON แบบ problem: <code>code</code> บอกชนิดปัญหา, <code>detail</code> บอกรายละเอียด, <code>problems</code>{" "}
        บอกจุดที่ผิดใน params หรือ data, <code>retryable</code> บอกว่าลองใหม่ได้ไหม และ <code>runId</code> ใช้ค้นใน{" "}
        <Link href="/history">ประวัติ Render</Link>
      </p>
      <table className={styles.table}>
        <tbody>
          {ERRORS.map(([status, meaning]) => (
            <tr key={status}>
              <th>{status}</th>
              <td>{meaning}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>รายงานที่เรียกได้</h2>
      {published.length === 0 ? (
        <p className={styles.hint}>ยังไม่มีรายงานที่ publish — เปิดรายงานแล้วกด Publish ก่อน</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>template.id</th>
              <th>ชื่อ</th>
              <th>เวอร์ชันที่ publish</th>
            </tr>
          </thead>
          <tbody>
            {published.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link href={`/templates/${t.id}`}>
                    <code>{t.id}</code>
                  </Link>
                </td>
                <td>{t.name}</td>
                <td>v{t.publishedVersion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
