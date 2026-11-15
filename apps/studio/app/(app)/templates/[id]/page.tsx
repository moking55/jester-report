import { notFound } from "next/navigation";

import { Workspace } from "@/components/Workspace";
import { api, ApiProblem } from "@/lib/api";
import { draftPath, isTemplateId } from "@/lib/result";
import type { components } from "@/lib/types.gen";
import type { Draft } from "@/lib/workspace";

type TemplateSummary = components["schemas"]["TemplateSummary"];

export default async function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
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
  return <Workspace draft={draft} name={template.name} />;
}
