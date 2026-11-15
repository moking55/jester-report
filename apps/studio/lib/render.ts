// The /v1/render request built from the dialog's text boxes. Shared by the Route Handler and the curl example.
// The JSON is assembled from the user's own text, never JSON.parse + stringify: that would turn
// 12345678901234567.89 into a binary float, and the api keeps JSON numbers as exact decimals.

export type RenderForm = { templateId: string; version: string; params: string; data: string; filename: string };

const isJson = (text: string) => {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
};

export function renderBody(form: RenderForm): { body: string } | { error: string } {
  const version = form.version === "published" ? '"published"' : /^[1-9]\d{0,8}$/.test(form.version) ? form.version : null;
  if (!version) return { error: "เลือก version ให้ถูกต้อง" };
  const params = form.params.trim() || "{}";
  if (!isJson(params) || !params.startsWith("{")) return { error: 'params ต้องเป็น JSON object เช่น {"quoteId": "Q-1"}' };
  const data = form.data.trim();
  if (!data || !isJson(data)) return { error: "data ต้องเป็น JSON ที่ถูกต้อง" };
  const filename = form.filename.trim() ? `,"filename":${JSON.stringify(form.filename.trim())}` : "";
  const template = `{"id":${JSON.stringify(form.templateId)},"version":${version}}`;
  return { body: `{"template":${template},"params":${params},"data":${data}${filename}}` };
}

/** What another system would run. The key is a placeholder: Studio never shows a real secret here. */
export function curlExample(body: string): string {
  const quoted = `'${body.replace(/'/g, `'\\''`)}'`; // safe inside single quotes in sh/bash
  return [
    'curl -X POST "$JESTER_API/v1/render" \\',
    '  -H "Authorization: Bearer jrk_…" \\',
    '  -H "Content-Type: application/json" \\',
    `  -d ${quoted} \\`,
    "  -o report.pdf",
  ].join("\n");
}
