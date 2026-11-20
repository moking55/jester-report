// Installing Studio as an app (SPEC-studio.md v1.10): the manifest's colours come from the theme in use.

import type { MetadataRoute } from "next";

const HEX = /^#[0-9a-fA-F]{6}$/;
// the default theme's values (styles/tokens.css), when the theme has none or the api cannot be reached
const BAR = "#edf3f9";
const BACKGROUND = "#f2f6fa";

/** The web app manifest for a theme's tokens. */
export function manifestFor(tokens: Record<string, unknown> | null | undefined): MetadataRoute.Manifest {
  const color = (name: string, fallback: string) => {
    const v = tokens?.[`color.${name}`];
    return typeof v === "string" && HEX.test(v) ? v : fallback;
  };
  return {
    name: "Jester Studio",
    short_name: "Jester",
    description: "ออกแบบและออกเอกสารด้วย Jester",
    lang: "th",
    start_url: "/",
    scope: "/",
    display: "standalone",
    theme_color: color("surfaceAlt", BAR),
    background_color: color("background", BACKGROUND),
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
