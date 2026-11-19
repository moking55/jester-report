"use server";

import { ASSET_NAME } from "@/lib/asset-name";
import { api } from "@/lib/api";
import { attempt, draftPath } from "@/lib/result";
import type { Draft, PreparedData, Result, Run, ValidationResult } from "@/lib/workspace";

export async function loadDraft(templateId: string): Promise<Result<Draft>> {
  return attempt(() => api<Draft>(draftPath(templateId)));
}

export async function validateDraft(templateId: string): Promise<Result<ValidationResult>> {
  return attempt(() => api<ValidationResult>(`${draftPath(templateId)}/validate`, { method: "POST" }));
}

/** data-prep alone on the saved draft with its sample data: the view model the template receives. */
export async function prepareDraft(templateId: string, params: Record<string, unknown>): Promise<Result<PreparedData>> {
  return attempt(() => api<PreparedData>(`${draftPath(templateId)}/prepared`, { method: "POST", body: { params } }));
}

/** The newest run of this template (a Preview records one), for the Provenance tab. */
export async function latestRun(templateId: string): Promise<Result<Run | null>> {
  draftPath(templateId); // checks the id
  return attempt(async () => {
    const page = await api<{ items: Run[] }>(`/v1/runs?templateId=${templateId}&limit=1`);
    return page.items[0] ?? null;
  });
}

/** Deletes a text file (report.json and template.html cannot go: the api answers 409). */
export async function deleteFile(templateId: string, name: string, revision: number): Promise<Result<{ revision: number }>> {
  return attempt(() => api<{ revision: number }>(draftPath(templateId, name), { method: "DELETE", ifMatch: revision }));
}


export async function deleteAsset(templateId: string, name: string, revision: number): Promise<Result<{ revision: number }>> {
  if (!ASSET_NAME.test(name)) throw new Error("invalid asset name");
  return attempt(() =>
    api<{ revision: number }>(`${draftPath(templateId)}/assets/${name}`, { method: "DELETE", ifMatch: revision }),
  );
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
