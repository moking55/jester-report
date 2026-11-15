"use server";

import { api } from "@/lib/api";
import { attempt, draftPath } from "@/lib/result";
import type { Draft, Result, ValidationResult } from "@/lib/workspace";

export async function loadDraft(templateId: string): Promise<Result<Draft>> {
  return attempt(() => api<Draft>(draftPath(templateId)));
}

export async function validateDraft(templateId: string): Promise<Result<ValidationResult>> {
  return attempt(() => api<ValidationResult>(`${draftPath(templateId)}/validate`, { method: "POST" }));
}

/** Saves one file at the revision the tab last saw; a newer revision on the server answers 412. */
export async function saveFile(
  templateId: string,
  name: string,
  content: string,
  revision: number,
): Promise<Result<{ revision: number }>> {
  return attempt(() =>
    api<{ revision: number }>(draftPath(templateId, name), { method: "PUT", text: content, ifMatch: revision }),
  );
}
