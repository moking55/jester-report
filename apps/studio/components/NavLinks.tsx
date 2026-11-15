"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  ["/", "รายงาน"],
  ["/history", "ประวัติ Render"],
  ["/settings", "ตั้งค่า"],
] as const;

/** The caption bar's main links; the current section is marked for screen readers and styling. */
export function NavLinks() {
  const path = usePathname();
  const current = LINKS.find(([href]) => href !== "/" && path.startsWith(href))?.[0] ?? "/";
  return (
    <>
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={href === current ? "page" : undefined}>
          {label}
        </Link>
      ))}
    </>
  );
}
