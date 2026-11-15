// Asset upload for the workspace. A Route Handler, not a Server Action: actions cap the body at 1 MB by
// default and fonts are bigger. The browser posts here (Studio's own origin); this forwards to the api.
import { apiRaw, ApiProblem } from "@/lib/api";
import { isTemplateId, sameOrigin } from "@/lib/result";

const problem = (status: number, code: string, detail: string) =>
  Response.json({ type: "about:blank", title: code, status, code, detail, retryable: false }, { status });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!sameOrigin(request)) return problem(403, "FORBIDDEN", "not from Studio");
  if (!isTemplateId(id)) return problem(404, "NOT_FOUND", "no such template");
  const form = await request.formData();
  const file = form.get("file");
  const revision = Number(form.get("revision"));
  if (!(file instanceof File) || !Number.isInteger(revision)) return problem(422, "INPUT_INVALID", "file and revision");
  const upload = new FormData();
  upload.set("file", file, file.name);
  try {
    const response = await apiRaw(`/v1/templates/${id}/draft/assets`, { method: "POST", form: upload, ifMatch: revision });
    return Response.json(await response.json(), { status: response.status });
  } catch (error) {
    if (!(error instanceof ApiProblem)) throw error;
    return Response.json(error.problem, { status: error.status });
  }
}
