import type { ReactNode } from "react";

import { NavLinks } from "@/components/NavLinks";
import { ThemePicker } from "@/components/ThemePicker";
import { VersionTag } from "@/components/VersionTag";
import { logout } from "@/lib/actions/auth";
import { activeTheme, requireUser } from "@/lib/current";
import { apiHealth } from "@/lib/version";

import styles from "./shell.module.css";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const [{ theme, themes }, status] = await Promise.all([activeTheme(), apiHealth()]);
  const engine = status?.components.engine;
  return (
    <div className={styles.window}>
      <header className={styles.caption}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a fixed 20 KB file; next/image adds nothing here */}
        <img src="/jester-logo.webp" alt="Jester Reports" className={styles.logo} width={112} height={34} />
        <b className={styles.product}>Studio</b>
        <nav className={styles.nav} aria-label="หลัก">
          <NavLinks />
        </nav>
        <span className={styles.spacer} />
        <ThemePicker themes={themes.map((t) => ({ id: t.id, name: t.name }))} current={theme?.id} />
        <span className={styles.user} title={user.username}>
          {user.username}
        </span>
        <form action={logout}>
          <button type="submit" className={styles.logout}>
            ออกจากระบบ
          </button>
        </form>
      </header>
      <main className={styles.body}>{children}</main>
      <footer className={styles.status}>
        <VersionTag api={status?.version} />
        <span>
          Engine {engine?.version ?? "?"} ·{" "}
          {engine?.status === "up" ? (
            <span className={styles.up}>● พร้อม</span>
          ) : (
            <span className={styles.down}>● ไม่พร้อม</span>
          )}
        </span>
        <span>API {status?.status ?? "ติดต่อไม่ได้"}</span>
        <span className={styles.spacer} />
        <span>theme {theme?.name ?? "fallback"}</span>
      </footer>
    </div>
  );
}
