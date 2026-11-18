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

/** One line of the params the caller sent: `quoteId: Q-1 · docDate: 2026-11-14`. */
export function paramsLine(params: Record<string, unknown>): string {
  return Object.entries(params)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" · ");
}
