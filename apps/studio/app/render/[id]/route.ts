// A real render of a published version from the Render dialog (form POST, target a new tab), with the
// signed-in session: the same /v1/render that other systems call with an API key.
import { apiRaw, ApiProblem } from "@/lib/api";
import { errorPage } from "@/lib/error-page";
import { problemMessage } from "@/lib/messages";
import { renderBody } from "@/lib/render";
import { isTemplateId, sameOrigin } from "@/lib/result";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!sameOrigin(request)) return errorPage(403, "คำขอนี้ไม่ได้มาจาก Studio");
  if (!isTemplateId(id)) return errorPage(404, "ไม่พบรายงานนี้");
  const form = await request.formData();
  const field = (name: string) => String(form.get(name) ?? "");
  const built = renderBody({
    templateId: id,
    version: field("version"),
    params: field("params"),
    data: field("data"),
    filename: field("filename"),
  });
  if ("error" in built) return errorPage(400, built.error);
  try {
    const pdf = await apiRaw("/v1/render", { method: "POST", json: built.body });
    const headers = new Headers({ "Content-Type": "application/pdf", "Cache-Control": "no-store" });
    for (const name of ["Content-Disposition", "Jester-Run-Id", "Jester-Template-Version"]) {
      const value = pdf.headers.get(name);
      if (value) headers.set(name, name === "Content-Disposition" ? value.replace(/^attachment/, "inline") : value);
    }
    return new Response(pdf.body, { headers });
  } catch (error) {
    if (!(error instanceof ApiProblem)) throw error;
    if (error.status === 401) return errorPage(401, "session หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง");
    return errorPage(error.status, problemMessage(error.problem), error.problem.problems);
  }
}
