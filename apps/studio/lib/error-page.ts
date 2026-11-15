import type { ValidationProblem } from "./workspace";

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A small Thai error page for Route Handlers whose answer is shown in an iframe or a new tab. */
export function errorPage(status: number, message: string, problems: ValidationProblem[] = []): Response {
  const items = problems
    .map((p) => `<li><code>${escape(p.code)}</code> ${escape(p.message)} ${escape(p.pointer ?? p.file ?? "")}</li>`)
    .join("");
  const html = `<!doctype html><meta charset="utf-8"><body style="font:14px/1.5 system-ui,sans-serif;padding:16px;color:#333">
<p style="color:#b42318;font-weight:600">${escape(message)}</p>${items ? `<ul>${items}</ul>` : ""}</body>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
