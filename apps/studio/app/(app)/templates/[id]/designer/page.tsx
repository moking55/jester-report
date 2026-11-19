import { notFound } from "next/navigation";

import { DesignerPage } from "@/components/designer/DesignerPage";
import { api, ApiProblem } from "@/lib/api";
import { defaultParams } from "@/lib/params";
import { draftPath, isTemplateId } from "@/lib/result";
import type { components } from "@/lib/types.gen";
import type { Draft } from "@/lib/workspace";

type TemplateSummary = components["schemas"]["TemplateSummary"];

/** Document Designer (SPEC-studio v1.7): template.html of the saved draft, edited on an A4 paper. */
export default async function DesignerRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isTemplateId(id)) notFound();
  let template: TemplateSummary, draft: Draft;
  try {
    [template, draft] = await Promise.all([api<TemplateSummary>(`/v1/templates/${id}`), api<Draft>(draftPath(id))]);
  } catch (error) {
    if (error instanceof ApiProblem && error.status === 404) notFound();
    throw error;
  }
  const files = Object.fromEntries(draft.files.map((f) => [f.name, f.content]));
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
  return (
    <DesignerPage
      templateId={id}
      name={template.name}
      revision={draft.revision}
      files={files}
      assets={draft.assets.map((a) => a.name)}
      archived={Boolean(template.archivedAt)}
      params={defaultParams(files["report.json"], today)}
    />
  );
}
