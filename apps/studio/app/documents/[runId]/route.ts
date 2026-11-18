// Download a stored document again (SPEC-studio.md v1.5). Forwards the api's PDF with the session;
// the browser never calls the api.
import { apiRaw, ApiProblem } from "@/lib/api";
import { isRunId } from "@/lib/documents";

export async function GET(_: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  if (!isRunId(runId)) {
    return Response.json({ code: "NOT_FOUND", status: 404, detail: "document not found" }, { status: 404 });
  }
  try {
    const response = await apiRaw(`/v1/documents/${runId}`);
    return new Response(response.body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": response.headers.get("content-disposition") ?? `attachment; filename="${runId}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (!(error instanceof ApiProblem)) throw error;
    return Response.json(error.problem, { status: error.status });
  }
}
