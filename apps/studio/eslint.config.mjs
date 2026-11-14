import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// SPEC-studio.md: client state is useImmer only; the API client and the session never reach the browser.
const STATE_LIBRARIES = ["zustand", "jotai", "redux", "@reduxjs/toolkit", "react-redux", "@tanstack/react-query", "swr", "recoil", "mobx", "valtio"];
const stateRule = STATE_LIBRARIES.map((name) => ({ name, message: "Client state uses useImmer only (SPEC-studio.md)." }));

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  { rules: { "no-restricted-imports": ["error", { paths: stateRule }] } },
  {
    files: ["components/**/*.{ts,tsx}"], // Client Components live here
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: stateRule,
          patterns: [
            { group: ["@/lib/api", "@/lib/session", "**/lib/api", "**/lib/session"], message: "Server-only: call a Server Action instead." },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "lib/types.gen.ts"]),
]);
