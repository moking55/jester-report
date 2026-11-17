"use server";

import { api } from "@/lib/api";
import { attempt, draftPath } from "@/lib/result";
import type { Snapshot } from "@/lib/diff";
import type { Result, Version } from "@/lib/workspace";

const templatePath = (templateId: string) => draftPath(templateId).replace(/\/draft$/, ""); // checks the id

export async function listVersions(templateId: string): Promise<Result<Version[]>> {
  return attempt(() => api<Version[]>(`${templatePath(templateId)}/versions`));
}

/** Freezes the saved draft at `revision` into a new version; the api refuses a draft that does not validate. */
export async function publishDraft(templateId: string, revision: number, note: string): Promise<Result<Version>> {
  const body = note.trim() ? { note: note.trim().slice(0, 500) } : {};
  return attempt(() => api<Version>(`${templatePath(templateId)}/versions`, { method: "POST", body, ifMatch: revision }));
}

/** Rollback or forward: what `"published"` renders from now on. */
export async function setPublished(templateId: string, version: number): Promise<Result<unknown>> {
  return attempt(() => api(`${templatePath(templateId)}/published`, { method: "PUT", body: { version } }));
}

/** Replaces the draft with a copy of a version (the draft's own changes are gone). */
export async function resetDraft(templateId: string, version: number, revision: number): Promise<Result<{ revision: number }>> {
  return attempt(() =>
    api<{ revision: number }>(`${draftPath(templateId)}/reset`, { method: "POST", body: { version }, ifMatch: revision }),
  );
}

/** A published version with its files and assets, for comparing before a rollback or reset. */
export async function getVersion(templateId: string, version: number): Promise<Result<Snapshot>> {
  if (!Number.isInteger(version) || version < 1) throw new Error("invalid version");
  return attempt(() => api<Snapshot>(`${templatePath(templateId)}/versions/${version}`));
}
