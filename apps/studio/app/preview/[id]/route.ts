// The PDF for the workspace's <iframe>: a form POST (target = the iframe) so the browser never calls the api.
// Errors come back as a small Thai page, since whatever this returns is shown inside the iframe.
import { apiRaw, ApiProblem } from "@/lib/api";
import { problemMessage } from "@/lib/messages";
import { parseParams } from "@/lib/params";
import { isTemplateId, sameOrigin } from "@/lib/result";
import { errorPage as page } from "@/lib/error-page";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!sameOrigin(request)) return page(403, "คำขอนี้ไม่ได้มาจาก Studio");
  if (!isTemplateId(id)) return page(404, "ไม่พบรายงานนี้");
  const parsed = parseParams(String((await request.formData()).get("params") ?? ""));
  if ("error" in parsed) return page(400, parsed.error);
  try {
    const pdf = await apiRaw(`/v1/templates/${id}/draft/preview`, { method: "POST", body: { params: parsed.params } });
    return new Response(pdf.body, {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline", "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (!(error instanceof ApiProblem)) throw error;
    if (error.status === 401) return page(401, "session หมดอายุ กรุณาโหลดหน้าใหม่แล้วเข้าสู่ระบบอีกครั้ง");
    return page(error.status, problemMessage(error.problem), error.problem.problems);
  }
}
