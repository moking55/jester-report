"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import styles from "@/app/(app)/catalog.module.css";

export const STATUSES = [
  ["", "ทุกสถานะ"],
  ["published", "Publish แล้ว"],
  ["draft", "ยังไม่ publish"],
  ["changed", "แก้หลัง publish"],
] as const;

type Props = { q: string; status: string; archived: boolean };

/** Search, status and archived in the URL (?q=&status=&archived=1); the page filters the list it already has. */
export function CatalogFilters({ q, status, archived }: Props) {
  const router = useRouter();
  const path = usePathname();
  const [text, setText] = useState(q);
  // the choices show at once; the page follows the URL a moment later (the page remounts this when the URL's choices change)
  const [stat, setStat] = useState(status);
  const [arch, setArch] = useState(archived);
  const go = (next: Partial<Props>) => {
    const v = { q, status, archived, ...next };
    const params = new URLSearchParams();
    if (v.q.trim()) params.set("q", v.q.trim());
    if (v.status) params.set("status", v.status);
    if (v.archived) params.set("archived", "1");
    const s = params.toString();
    router.replace(s ? `${path}?${s}` : path, { scroll: false });
  };
  // the search follows the typing after a short pause
  useEffect(() => {
    if (text.trim() === q) return;
    const t = setTimeout(() => go({ q: text }), 250);
    return () => clearTimeout(t);
  });

  return (
    <div className={styles.filters} role="search" aria-label="กรองรายงาน">
      <input
        type="search"
        className={styles.search}
        aria-label="ค้นหาชื่อหรือ id"
        placeholder="ค้นหาชื่อหรือ id"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <select
        aria-label="สถานะ"
        value={stat}
        onChange={(e) => {
          setStat(e.target.value);
          go({ status: e.target.value });
        }}
      >
        {STATUSES.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={arch}
          onChange={(e) => {
            setArch(e.target.checked);
            go({ archived: e.target.checked });
          }}
        />
        แสดงที่ archive
      </label>
    </div>
  );
}
