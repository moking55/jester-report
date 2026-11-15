import { apiRaw } from "@/lib/api";

// The api's OpenAPI contract as a download; the browser never calls the api itself.
export async function GET() {
  const response = await apiRaw("/v1/openapi.yaml");
  return new Response(response.body, {
    headers: {
      "Content-Type": "application/yaml; charset=utf-8",
      "Content-Disposition": 'attachment; filename="jester-openapi.yaml"',
    },
  });
}
