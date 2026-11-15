import type { Metadata } from "next";
import type { ReactNode } from "react";

import { activeTheme } from "@/lib/current";
import { themeCss } from "@/lib/theme";

import "@/styles/tokens.css";

export const metadata: Metadata = { title: "Jester Studio" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { theme } = await activeTheme();
  // the glass look belongs to the built-in classic only
  const look = theme?.id === "classic" ? "aero" : undefined;
  return (
    <html lang="th" data-look={look}>
      <head>
        {/* themeCss keeps only values that passed the token rules, so nothing here can escape the element */}
        <style id="jester-theme" dangerouslySetInnerHTML={{ __html: themeCss(theme?.tokens) }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
