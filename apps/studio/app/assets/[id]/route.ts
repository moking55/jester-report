// Assets of the workspace draft. Upload: a Route Handler, not a Server Action, because actions cap the
// body at 1 MB by default and fonts are bigger. Read (GET ?name=): the image preview; the browser never
// calls the api, so this forwards with the session.
import { apiRaw, ApiProblem } from "@/lib/api";
import { isTemplateId, sameOrigin } from "@/lib/result";

const ASSET_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.(png|jpe?g|svg|ttf|otf)$/;

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

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const name = new URL(request.url).searchParams.get("name") ?? "";
  if (!isTemplateId(id) || !ASSET_NAME.test(name)) return problem(404, "NOT_FOUND", "no such asset");
  try {
    const response = await apiRaw(`/v1/templates/${id}/draft/assets/${name}`);
    return new Response(response.body, {
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "application/octet-stream",
        // an SVG opened on its own must not run script on Studio's origin
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (!(error instanceof ApiProblem)) throw error;
    return Response.json(error.problem, { status: error.status });
  }
}
