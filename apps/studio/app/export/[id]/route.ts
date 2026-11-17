// Template zip download (?version=draft|N). A Route Handler that forwards the api's bytes with the session;
// the browser never calls the api.
import { apiRaw, ApiProblem } from "@/lib/api";
import { isTemplateId } from "@/lib/result";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const version = new URL(request.url).searchParams.get("version") ?? "draft";
  if (!isTemplateId(id) || !/^(draft|[1-9][0-9]*)$/.test(version)) {
    return Response.json({ code: "NOT_FOUND", status: 404, detail: "no such template" }, { status: 404 });
  }
  try {
    const response = await apiRaw(`/v1/templates/${id}/export?version=${version}`);
    return new Response(response.body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": response.headers.get("content-disposition") ?? `attachment; filename="${id}.zip"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (!(error instanceof ApiProblem)) throw error;
    return Response.json(error.problem, { status: error.status });
  }
}
