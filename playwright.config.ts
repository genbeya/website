import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env["PORT"] ?? 4321);

/**
 * End-to-end tests against the built site (npm run build first), served the way Cloudflare
 * Pages serves it, with the headers of dist/_headers — so the Content-Security-Policy applies.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
  },
  projects: [
    // Everything on a desktop; on a phone, the tests tagged @mobile (both) or @phone (phones only).
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      grepInvert: /@phone/,
    },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 375, height: 812 } }, grep: /@mobile|@phone/ },
  ],
  webServer: {
    command: `node scripts/serve.ts --port ${port}`,
    url: `http://localhost:${port}/`,
    reuseExistingServer: !process.env["CI"],
  },
});
