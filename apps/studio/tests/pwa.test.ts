import { describe, expect, it } from "vitest";

import { manifestFor } from "@/lib/pwa";

describe("web app manifest", () => {
  it("is installable: name, standalone, start url and the three icons", () => {
    const m = manifestFor(null);
    expect(m).toMatchObject({ name: "Jester Studio", short_name: "Jester", display: "standalone", start_url: "/" });
    expect(m.icons?.map((i) => `${i.sizes} ${i.purpose}`)).toEqual(["192x192 any", "512x512 any", "512x512 maskable"]);
  });

  it("takes its colours from the theme, and the default ones otherwise", () => {
    expect(manifestFor({ "color.surfaceAlt": "#112233", "color.background": "#ffffff" })).toMatchObject({ theme_color: "#112233", background_color: "#ffffff" });
    expect(manifestFor({ "color.surfaceAlt": "red" })).toMatchObject({ theme_color: "#edf3f9", background_color: "#f2f6fa" });
  });
});
