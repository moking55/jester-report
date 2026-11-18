// The curl example of a /v1/render request: the API page and the issue form's developer dialog.

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
