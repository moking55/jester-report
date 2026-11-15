import Link from "next/link";

import { ApiKeysPanel } from "@/components/ApiKeysPanel";
import { PasswordForm } from "@/components/PasswordForm";
import { UsersPanel } from "@/components/UsersPanel";
import styles from "@/components/Settings.module.css";
import { api } from "@/lib/api";
import { requireUser } from "@/lib/current";
import type { components } from "@/lib/types.gen";

type User = components["schemas"]["User"];
type ApiKey = components["schemas"]["ApiKey"];

const TABS = [
  ["users", "ผู้ใช้"],
  ["keys", "API key"],
  ["password", "รหัสผ่าน"],
] as const;
type Tab = (typeof TABS)[number][0];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const asked = (await searchParams).tab;
  const tab: Tab = TABS.find(([t]) => t === asked)?.[0] ?? "users";
  const me = await requireUser();
  return (
    <section className={styles.page}>
      <h1>ตั้งค่า</h1>
      <nav className={styles.tabs} aria-label="ส่วนของการตั้งค่า">
        {TABS.map(([t, label]) => (
          <Link key={t} href={`/settings?tab=${t}`} aria-current={t === tab ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>
      {tab === "users" && <UsersPanel users={await api<User[]>("/v1/users")} me={me.id} />}
      {tab === "keys" && <ApiKeysPanel keys={await api<ApiKey[]>("/v1/api-keys")} />}
      {tab === "password" && <PasswordForm />}
    </section>
  );
}
