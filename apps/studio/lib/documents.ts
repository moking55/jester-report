// Helpers for the documents page (SPEC-studio.md v1.5); pure, so Vitest covers them.
import type { components } from "./types.gen";

type DocumentSummary = components["schemas"]["DocumentSummary"];

/** Run ids are 12 hex digits of milliseconds plus 10 random ones; checked before going into a URL. */
export const isRunId = (value: string): boolean => /^[0-9a-f]{22}$/.test(value);

/** "API: erp" for an API key (its principal name is "api-key:erp"), the username for a person. */
export function issuer(caller: DocumentSummary["caller"]): string {
  if (caller.type === "api-key") return `API: ${(caller.name ?? caller.id).replace(/^api-key:/, "")}`;
  return caller.name ?? caller.id;
}

/** Parameter titles of one version's report.json (`{quoteId: "เลขที่ใบเสนอราคา"}`); none when it does not parse. */
export function paramTitles(reportJson: string | undefined): Record<string, string> {
  try {
    const parameters = (JSON.parse(reportJson ?? "") as { parameters?: Record<string, { title?: unknown }> }).parameters;
    return Object.fromEntries(
      Object.entries(parameters ?? {}).flatMap(([k, p]) => (typeof p?.title === "string" ? [[k, p.title]] : [])),
    );
  } catch {
    return {};
  }
}

/** One line of the params the caller sent, labelled by title where the version has one:
 *  `เลขที่ใบเสนอราคา: Q-1 · วันที่: 2026-11-14`. */
export function paramsLine(params: Record<string, unknown>, titles: Record<string, string> = {}): string {
  return Object.entries(params)
    .map(([k, v]) => `${titles[k] ?? k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" · ");
}
