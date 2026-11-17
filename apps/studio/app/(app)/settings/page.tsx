import Link from "next/link";

import { ApiKeysPanel } from "@/components/ApiKeysPanel";
import { PasswordForm } from "@/components/PasswordForm";
import { RetentionPanel } from "@/components/RetentionPanel";
import { ThemeEditor } from "@/components/ThemeEditor";
import { UsersPanel } from "@/components/UsersPanel";
import styles from "@/components/Settings.module.css";
import { api } from "@/lib/api";
import { requireUser } from "@/lib/current";
import type { Theme } from "@/lib/theme";
import type { components } from "@/lib/types.gen";

type User = components["schemas"]["User"];
type ApiKey = components["schemas"]["ApiKey"];
type Retention = components["schemas"]["RunRetention"];
type Search = { tab?: string; previewDays?: string; retention?: string };

const TABS = [
  ["users", "ผู้ใช้"],
  ["keys", "API key"],
  ["password", "รหัสผ่าน"],
  ["themes", "Theme"],
  ["retention", "ประวัติ Render"],
] as const;
type Tab = (typeof TABS)[number][0];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const tab: Tab = TABS.find(([t]) => t === search.tab)?.[0] ?? "users";
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
      {tab === "themes" && <Themes />}
      {tab === "retention" && <Retention previewDays={search.previewDays} notice={search.retention} />}
    </section>
  );
}

async function Themes() {
  const [themes, fallback] = await Promise.all([api<Theme[]>("/v1/themes"), api<Theme>("/v1/themes/default")]);
  return <ThemeEditor themes={themes} defaultId={fallback.id} />;
}

async function Retention({ previewDays, notice }: { previewDays?: string; notice?: string }) {
  const asked = Number(previewDays);
  const days = Number.isInteger(asked) && asked >= 1 && asked <= 36500 ? asked : null;
  const retention = await api<Retention>(`/v1/runs/retention${days ? `?previewDays=${days}` : ""}`);
  return <RetentionPanel retention={retention} previewDays={days} notice={notice} />;
}
