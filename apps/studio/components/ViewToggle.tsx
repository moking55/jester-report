"use client";

import { useTransition } from "react";

import styles from "@/app/(app)/catalog.module.css";
import { chooseCatalogView } from "@/lib/actions/templates";

const ICONS = {
  table: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 3h12M2 6.5h12M2 10h12M2 13.5h12" />
    </svg>
  ),
  cards: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  ),
};

export function ViewToggle({ view }: { view: "table" | "cards" }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className={styles.toggle} role="group" aria-label="มุมมอง">
      {(["table", "cards"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          aria-label={v === "table" ? "มุมมองตาราง" : "มุมมองการ์ด"}
          title={v === "table" ? "มุมมองตาราง" : "มุมมองการ์ด"}
          disabled={pending}
          onClick={() => view !== v && startTransition(() => chooseCatalogView(v))}
        >
          {ICONS[v]}
        </button>
      ))}
    </div>
  );
}
