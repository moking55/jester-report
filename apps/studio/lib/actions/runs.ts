"use server";

import { redirect } from "next/navigation";

import { api } from "@/lib/api";
import { attempt } from "@/lib/result";

/** Keep runs for N days (form field `days`), or for ever when the field is empty. Reached only after the
 *  history page showed how many runs N days would delete. */
export async function setRetention(form: FormData): Promise<void> {
  const raw = String(form.get("days") ?? "").trim();
  const days = raw === "" ? null : Number(raw);
  if (days !== null && !(Number.isInteger(days) && days >= 1 && days <= 36500)) redirect("/history?retention=invalid");
  const result = await attempt(() => api("/v1/runs/retention", { method: "PUT", body: { days } }));
  redirect(result.ok ? "/history?retention=saved" : "/history?retention=failed");
}
