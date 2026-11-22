import Link from "next/link";

import { apiRaw } from "@/lib/api";

import { Reference } from "./Reference";
import styles from "../api.module.css";

/** Every operation of the contract with its examples (v1.12), from the one file the api serves. */
export default async function ApiReferencePage() {
  const content = await (await apiRaw("/v1/openapi.yaml")).text();
  return (
    <section className={styles.reference}>
      <p className={styles.sub}>
        <Link href="/api">‹ API</Link> · อ่านอย่างเดียว ไม่มีปุ่มลองยิงจากหน้านี้ ใช้ curl จากปุ่ม สำหรับนักพัฒนา ในหน้าออกเอกสาร
      </p>
      <Reference content={content} />
    </section>
  );
}
