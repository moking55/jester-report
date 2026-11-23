import pkg from "@/package.json";

import { publicApi } from "@/lib/api";
import type { components } from "@/lib/types.gen";

export type Health = components["schemas"]["Health"];

/** This Studio's release: package.json, so it moves with the release commit and cannot drift from it. */
export const studioVersion: string = pkg.version;

/** GET /v1/health (no login needed); null when the api cannot be reached or says a dependency is down. */
export async function apiHealth(): Promise<Health | null> {
  try {
    return await publicApi<Health>("/v1/health");
  } catch {
    return null;
  }
}
