// "ออก PDF" of the issue form: the form's fetch sends the /v1/render body it built (lib/form.ts), this forwards
// it with the session. Unlike /render/[id] (a form POST that answers with an HTML error page), problems come
// back as JSON so the form can show them at their fields.
import { apiRaw, ApiProblem } from "@/lib/api";
import { isTemplateId, sameOrigin } from "@/lib/result";

const problem = (status: number, code: string, detail: string) =>
  Response.json({ type: "about:blank", title: code, status, code, detail, retryable: false }, { status });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!sameOrigin(request)) return problem(403, "FORBIDDEN", "not from Studio");
  if (!isTemplateId(id)) return problem(404, "NOT_FOUND", "no such template");
  const body = await request.text();
  // checked, then forwarded as the same text: parsing and re-serialising would round big decimals
  let template: unknown;
  try {
    template = (JSON.parse(body) as { template?: unknown }).template;
  } catch {
    return problem(422, "INPUT_INVALID", "the form sent invalid JSON");
  }
  const t = template as { id?: unknown; version?: unknown } | undefined;
  if (t?.id !== id || t?.version !== "published") return problem(422, "INPUT_INVALID", "only the published version");
  try {
    // v1.14: the form's "ฟอร์มเปล่า" box; anything but exactly true is a normal render
    const blank = new URL(request.url).searchParams.get("allowEmpty") === "true";
    const pdf = await apiRaw(`/v1/render${blank ? "?allowEmpty=true" : ""}`, { method: "POST", json: body });
    const headers = new Headers({ "Content-Type": "application/pdf", "Cache-Control": "no-store" });
    for (const name of ["Content-Disposition", "Jester-Run-Id", "Jester-Template-Version"]) {
      const value = pdf.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(pdf.body, { headers });
  } catch (error) {
    if (!(error instanceof ApiProblem)) throw error;
    return Response.json(error.problem, { status: error.status });
  }
}
