import { redirect } from "next/navigation";

import { AuthForm } from "@/components/AuthForm";
import { completeSetup } from "@/lib/actions/auth";
import { setupRequired } from "@/lib/current";

import styles from "../auth.module.css";

export default async function SetupPage() {
  if (!(await setupRequired())) redirect("/login");
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <h1 className={styles.brand}>ตั้งค่า Jester ครั้งแรก</h1>
        <p className={styles.lead}>
          ใส่ setup token จาก log ของ api (<code>docker compose logs api</code>) แล้วสร้างบัญชีแรก
        </p>
        <AuthForm
          action={completeSetup}
          submit="สร้างบัญชีและเริ่มใช้งาน"
          fields={[
            { name: "setupToken", label: "Setup token", autoComplete: "off" },
            { name: "username", label: "ชื่อผู้ใช้", autoComplete: "username", hint: "3–40 ตัว: a–z, 0–9, . _ -" },
            {
              name: "password",
              label: "รหัสผ่าน",
              type: "password",
              autoComplete: "new-password",
              hint: "อย่างน้อย 12 ตัวอักษร",
            },
            { name: "confirm", label: "ยืนยันรหัสผ่าน", type: "password", autoComplete: "new-password" },
          ]}
        />
      </section>
    </main>
  );
}
