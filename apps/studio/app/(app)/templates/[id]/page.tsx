import { notFound } from "next/navigation";

import { Workspace } from "@/components/Workspace";
import { api, ApiProblem } from "@/lib/api";
import { FORM_FILE } from "@/lib/form-layout";
import { draftPath, isTemplateId } from "@/lib/result";
import type { components } from "@/lib/types.gen";
import type { Draft, IssueSource } from "@/lib/workspace";

type TemplateSummary = components["schemas"]["TemplateSummary"];
type VersionFiles = { files: { name: string; content: string }[] };

/** The published version's form inputs (SPEC-studio v1.4: the form always uses the published version). */
async function issueSource(id: string, version: number): Promise<IssueSource | null> {
  const { files } = await api<VersionFiles>(`/v1/templates/${id}/versions/${version}`);
  const byName = new Map(files.map((f) => [f.name, f.content]));
  const reportJson = byName.get("report.json");
  if (!reportJson) return null;
  try {
    const data = (JSON.parse(reportJson) as { data?: { schema?: string; samples?: string[] } }).data ?? {};
    const schemaJson = data.schema ? byName.get(data.schema) : undefined;
    if (!schemaJson) return null;
    return {
      version,
      reportJson,
      schemaJson,
      sampleJson: data.samples?.[0] ? byName.get(data.samples[0]) : undefined,
      formJson: byName.get(FORM_FILE),
    };
  } catch {
    return null; // a published version always parses; anything else falls back to the code view
  }
}

/** The data schema's file name from the draft's report.json. */
function schemaFile(draft: Draft): string {
  try {
    const report = draft.files.find((f) => f.name === "report.json")?.content ?? "{}";
    return (JSON.parse(report) as { data?: { schema?: string } }).data?.schema ?? "data.schema.json";
  } catch {
    return "data.schema.json";
  }
}

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { id } = await params;
  if (!isTemplateId(id)) notFound();
  let template: TemplateSummary, draft: Draft;
  try {
    [template, draft] = await Promise.all([
      api<TemplateSummary>(`/v1/templates/${id}`),
      api<Draft>(draftPath(id)),
    ]);
  } catch (error) {
    if (error instanceof ApiProblem && error.status === 404) notFound();
    throw error;
  }
  // today in Thailand, computed once here so server and browser render the same params box
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
  const archived = Boolean(template.archivedAt);
  const canIssue = template.publishedVersion !== null && !archived;
  const mode = (await searchParams).mode;
  const issue = canIssue && mode === "issue" ? await issueSource(id, template.publishedVersion!) : null;
  // a new key when the archive state or the mode flips: the editors are made read-only (or editable) from scratch
  return (
    <Workspace
      key={`${archived}-${Boolean(issue)}`}
      draft={draft}
      name={template.name}
      today={today}
      archived={archived}
      canIssue={canIssue}
      issue={issue}
      tags={template.tags}
      // v1.6: the form builder lives in the code view; an old ?mode=form link opens the data schema there
      openFile={mode === "form" ? schemaFile(draft) : undefined}
    />
  );
}
