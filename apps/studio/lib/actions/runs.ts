"use server";

import { redirect } from "next/navigation";

import { api } from "@/lib/api";
import { attempt } from "@/lib/result";

/** Keep runs for N days (form field `days`), or for ever when the field is empty. Reached only after the
 *  settings page showed how many runs N days would delete. */
export async function setRetention(form: FormData): Promise<void> {
  const raw = String(form.get("days") ?? "").trim();
  const days = raw === "" ? null : Number(raw);
  if (days !== null && !(Number.isInteger(days) && days >= 1 && days <= 36500)) redirect("/settings?tab=retention&retention=invalid");
  const result = await attempt(() => api("/v1/runs/retention", { method: "PUT", body: { days } }));
  redirect(result.ok ? "/settings?tab=retention&retention=saved" : "/settings?tab=retention&retention=failed");
}
