"use server";

import { refresh } from "next/cache";

import { api } from "@/lib/api";
import { problemMessage } from "@/lib/messages";
import { attempt, isTemplateId } from "@/lib/result";
import { isRunId } from "@/lib/documents";
import { isTagColor, normalizeTags } from "@/lib/tags";
import type { components } from "@/lib/types.gen";

export type TagUse = components["schemas"]["TagUse"];
/** What the tag dialogs get back: the tags as the api stored them, or why not. */
export type TagResult = { ok: true; tags: string[] } | { ok: false; error: string };

/** Tags in use with their colour, for autocomplete and the filter; empty when the api cannot be reached. */
export async function listTagUse(): Promise<TagUse[]> {
  const result = await attempt(() => api<TagUse[]>("/v1/tags"));
  return result.ok ? result.data : [];
}

async function save(path: string, tags: string[]): Promise<TagResult> {
  const checked = normalizeTags(tags); // the same rules as the api; saves a round trip and names the tag
  if (!checked.ok) return { ok: false, error: checked.error };
  const result = await attempt(() => api<{ tags: string[] }>(path, { method: "PUT", body: { tags: checked.tags } }));
  if (!result.ok) return { ok: false, error: problemMessage(result.problem) };
  refresh();
  return { ok: true, tags: result.data.tags };
}

export async function setTemplateTags(templateId: string, tags: string[]): Promise<TagResult> {
  if (!isTemplateId(templateId)) return { ok: false, error: "id ของรายงานไม่ถูกต้อง" };
  return save(`/v1/templates/${templateId}/tags`, tags);
}

export async function setDocumentTags(runId: string, tags: string[]): Promise<TagResult> {
  if (!isRunId(runId)) return { ok: false, error: "รหัสเอกสารไม่ถูกต้อง" };
  return save(`/v1/documents/${runId}/tags`, tags);
}

/** The colour belongs to the tag name, so every chip of that name changes with it. */
export async function setTagColor(tag: string, color: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isTagColor(color)) return { ok: false, error: "สีไม่ถูกต้อง" };
  const result = await attempt(() => api("/v1/tag-colors", { method: "PUT", body: { tag, color } }));
  if (!result.ok) return { ok: false, error: problemMessage(result.problem) };
  refresh();
  return { ok: true };
}
