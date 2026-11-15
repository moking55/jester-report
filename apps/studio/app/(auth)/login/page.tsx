import { redirect } from "next/navigation";

import { AuthForm } from "@/components/AuthForm";
import { login } from "@/lib/actions/auth";
import { setupRequired } from "@/lib/current";

import styles from "../auth.module.css";

export default async function LoginPage() {
  if (await setupRequired()) redirect("/setup");
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        {/* eslint-disable-next-line @next/next/no-img-element -- see app/(app)/layout.tsx */}
        <img src="/jester-logo.webp" alt="Jester Reports" className={styles.logo} width={240} height={73} />
        <h1 className={styles.brand}>Studio</h1>
        <p className={styles.lead}>เข้าสู่ระบบเพื่อจัดการรายงาน</p>
        <AuthForm
          action={login}
          submit="เข้าสู่ระบบ"
          fields={[
            { name: "username", label: "ชื่อผู้ใช้", autoComplete: "username" },
            { name: "password", label: "รหัสผ่าน", type: "password", autoComplete: "current-password" },
          ]}
        />
      </section>
    </main>
  );
}
