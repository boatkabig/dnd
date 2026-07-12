import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke suite for the DnDSolo monolith (src/components/DnDSolo.tsx).
 * Purpose: catch "renders but does nothing" regressions across the upcoming
 * refactor — every assertion in e2e/ checks user-visible rendered output,
 * never internal component state. See e2e/dnd-solo.spec.ts.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Allow pointing at a pre-installed browser (e.g. a sandbox where the pinned
    // Playwright browser build differs from what's baked in). CI leaves PW_CHROME
    // unset and uses Playwright's own managed browsers.
    ...(process.env.PW_CHROME ? { launchOptions: { executablePath: process.env.PW_CHROME } } : {}),
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    // Next dev's first compile (many routes + a 6k-line component) can be slow.
    timeout: 180_000,
  },
});
