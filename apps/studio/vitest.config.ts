import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/empty.ts", import.meta.url)), // Next enforces it, not Vitest
    },
  },
  test: { environment: "jsdom", include: ["tests/**/*.test.{ts,tsx}"] },
});
