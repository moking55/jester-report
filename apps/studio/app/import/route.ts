// Template zip upload. A Route Handler, not a Server Action: actions cap the body at 1 MB and a zip may be
// 25 MB. `overwrite=1` replaces the draft of `templateId`; Studio reads its current revision here, so the
// user is not asked for one.
import { api, apiRaw, ApiProblem } from "@/lib/api";
import { isTemplateId, sameOrigin } from "@/lib/result";
import type { components } from "@/lib/types.gen";

type TemplateSummary = components["schemas"]["TemplateSummary"];

const problem = (status: number, code: string, detail: string) =>
  Response.json({ type: "about:blank", title: code, status, code, detail, retryable: false }, { status });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return problem(403, "FORBIDDEN", "not from Studio");
  const form = await request.formData();
  const file = form.get("file");
  const templateId = String(form.get("templateId") ?? "");
  const overwrite = form.get("overwrite") === "1";
  if (!(file instanceof File)) return problem(422, "INPUT_INVALID", "choose a .zip file");
  if (templateId && !isTemplateId(templateId)) return problem(422, "INPUT_INVALID", "invalid template id");
  if (overwrite && !templateId) return problem(422, "INPUT_INVALID", "overwrite needs the template id");
  const upload = new FormData();
  upload.set("file", file, file.name);
  if (templateId) upload.set("templateId", templateId);
  try {
    const ifMatch = overwrite
      ? (await api<TemplateSummary>(`/v1/templates/${templateId}`)).draftRevision
      : undefined;
    const response = await apiRaw("/v1/templates/import", { method: "POST", form: upload, ifMatch });
    return Response.json(await response.json(), { status: response.status });
  } catch (error) {
    if (!(error instanceof ApiProblem)) throw error;
    return Response.json(error.problem, { status: error.status });
  }
}
