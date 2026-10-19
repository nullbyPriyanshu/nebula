import { defineConfig, devices } from "@playwright/test";

// Runs against the production build (`pnpm build` first), served with the real
// security headers. Google sign-in and Drive are faked in e2e/fake-google.ts.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:4173",
    // The service worker would answer some requests itself; tests want the network.
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
  webServer: {
    command: "node scripts/serve.mjs",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
  },
});
