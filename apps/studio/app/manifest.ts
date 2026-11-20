import type { MetadataRoute } from "next";

import { activeTheme } from "@/lib/current";
import { manifestFor } from "@/lib/pwa";

// the theme in use decides the colours, so the manifest is made per request
export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { theme } = await activeTheme();
  return manifestFor(theme?.tokens);
}
