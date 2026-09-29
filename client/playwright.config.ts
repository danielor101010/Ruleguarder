import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests against a running stack (nginx client + server + db). Non-LLM rules only.
 * Base URL: E2E_BASE_URL, else http://localhost:$CLIENT_PORT (default 8080).
 */
export default defineConfig({
  testDir: "./e2e",
  // Tests share one database; run them one at a time
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${process.env.CLIENT_PORT ?? "8080"}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
