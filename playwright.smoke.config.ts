import { defineConfig, devices } from "@playwright/test";

const webPort = 4176;

/**
 * Browser smoke against the production build. The Operations API is replaced by an in-memory double that
 * answers through page.route, so this suite never needs PHP, a database or network access.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /dashboard-smoke\.spec\.ts/,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? "line" : "list",
  use: { baseURL: `http://127.0.0.1:${webPort}`, trace: "retain-on-failure", ...devices["Desktop Chrome"] },
  webServer: {
    command: `pnpm exec vite preview --host 127.0.0.1 --port ${webPort} --strictPort`,
    url: `http://127.0.0.1:${webPort}/`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
