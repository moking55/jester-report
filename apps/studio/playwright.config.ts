import { defineConfig } from "@playwright/test";

// Runs against a deployed compose stack: STUDIO_E2E_URL=http://host:3000 npx playwright test
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1, // the flows share one fresh stack (first-run setup happens once)
  use: { baseURL: process.env.STUDIO_E2E_URL, trace: "retain-on-failure" },
});
