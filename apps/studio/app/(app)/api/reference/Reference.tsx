"use client";

import { ApiReferenceReact } from "@scalar/api-reference-react";
import "@scalar/api-reference-react/style.css";

/**
 * Scalar renders the contract. The browser never calls the api itself (route.ts), so every way to send a
 * request from the page is off, and fonts come from Studio instead of a CDN (the stack may have no internet).
 */
export function Reference({ content }: { content: string }) {
  return (
    <ApiReferenceReact
      configuration={{
        content,
        hideTestRequestButton: true,
        hideClientButton: true,
        withDefaultFonts: false,
        hideDarkModeToggle: true,
        showDeveloperTools: "never",
        telemetry: false,
      }}
    />
  );
}
