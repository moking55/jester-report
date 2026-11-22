"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import styles from "@/app/(app)/catalog.module.css";

import { TagChip } from "./TagChip";

export const STATUSES = [
  ["", "ทุกสถานะ"],
  ["published", "Publish แล้ว"],
  ["draft", "ยังไม่ publish"],
  ["changed", "แก้หลัง publish"],
] as const;

type TagOption = { tag: string; color: string; count: number };
type Props = { q: string; status: string; archived: boolean; tags: string[]; options: TagOption[] };

/** Search, status, archived and tags in the URL (?q=&status=&archived=1&tag=a&tag=b); the page filters the list it
 *  already has. Several tags narrow the list: a report needs all of them. */
export function CatalogFilters({ q, status, archived, tags, options }: Props) {
  const router = useRouter();
  const path = usePathname();
  const [text, setText] = useState(q);
  // the choices show at once; the page follows the URL a moment later (the page remounts this when the URL's choices change)
  const [stat, setStat] = useState(status);
  const [arch, setArch] = useState(archived);
  const [picked, setPicked] = useState(tags);
  const go = (next: Partial<Omit<Props, "options">>) => {
    const v = { q, status, archived, tags: picked, ...next };
    const params = new URLSearchParams();
    if (v.q.trim()) params.set("q", v.q.trim());
    if (v.status) params.set("status", v.status);
    if (v.archived) params.set("archived", "1");
    for (const tag of v.tags) params.append("tag", tag);
    const s = params.toString();
    router.replace(s ? `${path}?${s}` : path, { scroll: false });
  };
  // the search follows the typing after a short pause
  useEffect(() => {
    if (text.trim() === q) return;
    const t = setTimeout(() => go({ q: text }), 250);
    return () => clearTimeout(t);
  });

  const toggle = (tag: string) => {
    const next = picked.includes(tag) ? picked.filter((t) => t !== tag) : [...picked, tag];
    setPicked(next);
    go({ tags: next });
  };

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
      {options.length > 0 && (
        <div className={styles.tagBar} role="group" aria-label="กรองด้วย tag (ต้องมีครบทุกอันที่เลือก)">
          <span className={styles.tagLabel}>tag</span>
          {options.map((o) => (
            <button
              key={o.tag}
              type="button"
              className={`${styles.tagToggle} ${picked.includes(o.tag) ? styles.tagOn : ""}`}
              aria-pressed={picked.includes(o.tag)}
              title={`${o.count} รายงาน`}
              onClick={() => toggle(o.tag)}
            >
              <TagChip tag={o.tag} color={o.color} />
            </button>
          ))}
          {picked.length > 0 && (
            <button
              type="button"
              className={styles.tagClear}
              onClick={() => {
                setPicked([]);
                go({ tags: [] });
              }}
            >
              ล้าง tag
            </button>
          )}
        </div>
      )}
    </div>
  );
}
