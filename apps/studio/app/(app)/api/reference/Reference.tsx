"use client";

import { ApiReferenceReact } from "@scalar/api-reference-react";
import "@scalar/api-reference-react/style.css";

/**
 * Scalar renders the contract. The browser never calls the api itself (route.ts), so every way to send a
 * request from the page is off, and so is anything that talks to Scalar's servers; fonts come from Studio
 * instead of a CDN (the stack may have no internet).
 */
export function Reference({ content }: { content: string }) {
  return (
    <ApiReferenceReact
      configuration={{
        content,
        hideTestRequestButton: true,
        hideClientButton: true,
        withDefaultFonts: false,
        showDeveloperTools: "never",
        telemetry: false,
        agent: { disabled: true }, // "Ask AI" would send the contract to Scalar's cloud
        mcp: { disabled: true },
      }}
    />
  );
}
