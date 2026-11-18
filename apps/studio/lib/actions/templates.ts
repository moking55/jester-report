"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { api, ApiProblem } from "@/lib/api";
import { problemMessage } from "@/lib/messages";
import { VIEW_COOKIE } from "@/lib/session";
import type { FormState } from "./auth";

const STARTERS = ["blank", "quotation", "grouped-table", "master-detail"];

export async function createTemplate(_: FormState, form: FormData): Promise<FormState> {
  const values = {
    id: String(form.get("id") ?? "").trim(),
    name: String(form.get("name") ?? "").trim(),
    starter: String(form.get("starter") ?? "blank"),
  };
  if (!STARTERS.includes(values.starter)) values.starter = "blank";
  try {
    await api("/v1/templates", { method: "POST", body: values });
  } catch (error) {
    if (!(error instanceof ApiProblem)) throw error;
    if (error.status === 401) redirect("/login");
    const taken = error.status === 409 ? `มีรายงาน id "${values.id}" อยู่แล้ว` : null;
    return { error: taken ?? problemMessage(error.problem), values };
  }
  redirect(`/templates/${values.id}`);
}

/** The catalog's table or card view, remembered per browser like the theme. */
export async function chooseCatalogView(view: string): Promise<void> {
  if (view !== "table" && view !== "cards") return;
  (await cookies()).set(VIEW_COOKIE, view, {
    httpOnly: true,
    secure: process.env.JESTER_COOKIE_SECURE !== "false",
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
  refresh();
}

/** Archive or restore, then back to the page it came from (a redirect also works before hydration). */
export async function setArchived(templateId: string, archived: boolean, back: string): Promise<void> {
  try {
    await api(`/v1/templates/${templateId}/archived`, { method: "PUT", body: { archived } });
  } catch (error) {
    if (error instanceof ApiProblem && error.status === 401) redirect("/login");
    throw error;
  }
  redirect(back.startsWith("/") && !back.startsWith("//") ? back : "/");
}

/** Copy a template's draft (or one version) into a new template, then open the copy. */
export async function duplicateTemplate(_: FormState, form: FormData): Promise<FormState> {
  const source = String(form.get("source") ?? "");
  const ref = String(form.get("version") ?? "draft");
  const values = { id: String(form.get("id") ?? "").trim(), name: String(form.get("name") ?? "").trim() };
  const version = ref === "draft" ? "draft" : Number(ref);
  try {
    await api(`/v1/templates/${source}/duplicate`, { method: "POST", body: { ...values, version } });
  } catch (error) {
    if (!(error instanceof ApiProblem)) throw error;
    if (error.status === 401) redirect("/login");
    const taken = error.status === 409 ? `มีรายงาน id "${values.id}" อยู่แล้ว` : null;
    return { error: taken ?? problemMessage(error.problem), values };
  }
  redirect(`/templates/${values.id}`);
}
