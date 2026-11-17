import Link from "next/link";

import { setRetention } from "@/lib/actions/runs";
import { when } from "@/lib/format";
import type { components } from "@/lib/types.gen";

import styles from "./Settings.module.css";

type Retention = components["schemas"]["RunRetention"];

const NOTICE: Record<string, string> = {
  saved: "บันทึกนโยบายเก็บแล้ว",
  failed: "บันทึกนโยบายไม่สำเร็จ กรุณาลองใหม่",
  invalid: "จำนวนวันต้องเป็นเลขเต็ม 1–36500",
};

const HERE = "/settings?tab=retention";

/** How long render history is kept. A new limit is saved only after the page showed how many runs it deletes. */
export function RetentionPanel({
  retention,
  previewDays,
  notice,
}: {
  retention: Retention;
  previewDays: number | null;
  notice?: string;
}) {
  return (
    <div className={styles.panel}>
      {notice && NOTICE[notice] && <p role="status">{NOTICE[notice]}</p>}
      <p>
        ตอนนี้: <b>{retention.days === null ? "เก็บตลอด (ค่าเริ่มต้น)" : `เก็บ ${retention.days} วัน`}</b>
        {retention.setBy && (
          <small className={styles.muted}>
            {" "}
            ตั้งโดย {retention.setBy}
            {retention.setAt ? ` เมื่อ ${when(retention.setAt)}` : ""}
          </small>
        )}
      </p>
      {previewDays === null ? (
        <form method="get" className={styles.form}>
          <input type="hidden" name="tab" value="retention" />
          <label>
            เก็บไว้กี่วัน
            <input name="previewDays" type="number" min={1} max={36500} required />
          </label>
          <button type="submit">ดูก่อนว่าจะลบกี่รายการ</button>
        </form>
      ) : (
        <div className={styles.secret}>
          <p>
            ถ้าเก็บ {previewDays} วัน จะลบ run ที่เก่ากว่านั้น <b>{retention.wouldDelete ?? 0} รายการ</b> ทันที และลบต่อไปเรื่อย ๆ
            (ลบแล้วกู้คืนไม่ได้)
          </p>
          <form action={setRetention} className={styles.row}>
            <input type="hidden" name="days" value={previewDays} />
            <button type="submit" className={styles.danger}>
              ยืนยัน เก็บ {previewDays} วัน
            </button>
            <Link href={HERE}>ยกเลิก</Link>
          </form>
        </div>
      )}
      {retention.days !== null && (
        <form action={setRetention}>
          <input type="hidden" name="days" value="" />
          <button type="submit">กลับไปเก็บตลอด</button>
        </form>
      )}
    </div>
  );
}
