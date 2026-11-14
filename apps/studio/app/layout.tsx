import type { Metadata } from "next";
import type { ReactNode } from "react";

import { publicApi } from "@/lib/api";
import { themeCss, type Theme } from "@/lib/theme";

import "@/styles/tokens.css";

export const metadata: Metadata = { title: "Jester Studio" };

async function defaultTheme(): Promise<Theme | null> {
  try {
    return await publicApi<Theme>("/v1/themes/default");
  } catch {
    return null; // api down: tokens.css fallback
  }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = await defaultTheme();
  return (
    <html lang="th">
      <head>
        {/* themeCss keeps only values that passed the token rules, so nothing here can escape the element */}
        <style id="jester-theme" dangerouslySetInnerHTML={{ __html: themeCss(theme?.tokens) }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
