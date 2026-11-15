"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  ["/", "รายงาน"],
  ["/history", "ประวัติ Render"],
] as const;

/** The caption bar's main links; the current section is marked for screen readers and styling. */
export function NavLinks() {
  const path = usePathname();
  const current = path.startsWith("/history") ? "/history" : "/";
  return (
    <>
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={href === current ? "page" : undefined}>
          {label}
        </Link>
      ))}
      <span aria-disabled="true">ตั้งค่า</span>
    </>
  );
}
