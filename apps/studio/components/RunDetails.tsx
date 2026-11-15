import type { Run } from "@/lib/workspace";

import { JsonTree } from "./JsonTree";
import styles from "./JsonTree.module.css";

/** Provenance of the newest run: what produced the PDF (hashes only; params and data are never stored). */
export function RunDetails({ run }: { run: Run | null }) {
  if (!run) return <p className={styles.leaf}>ยังไม่มี run ของรายงานนี้ กด Preview เพื่อสร้าง</p>;
  const summary = {
    run: run.id,
    kind: run.kind,
    status: run.status,
    errorCode: run.errorCode ?? null,
    draftRevision: run.draftRevision ?? null,
    pages: run.pages ?? null,
    durationMs: run.durationMs ?? null,
    createdAt: run.createdAt,
  };
  return (
    <div>
      <JsonTree name="run" value={summary} />
      <JsonTree name="provenance" value={run.provenance ?? {}} />
      {run.problems?.length ? <JsonTree name="problems" value={run.problems} /> : null}
    </div>
  );
}
