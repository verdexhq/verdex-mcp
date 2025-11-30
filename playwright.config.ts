import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for Verdex MCP tests
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: ["**/*.spec.ts"],

  // Maximum time one test can run for
  timeout: 30 * 1000,

  // Run tests in files in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry only in CI for environmental issues (not to mask bugs)
  retries: process.env.CI ? 1 : 0,

  // Reporter to use
  reporter: "html",

  // Shared settings for all the projects below
  use: {
    // Base URL for file:// protocol tests
    baseURL: "file://" + process.cwd(),

    // Run browsers in headless mode (no UI)
    headless: true,

    // Collect trace when retrying the failed test
    trace: "on-first-retry",

    // Screenshot on failure
    screenshot: "only-on-failure",
  },

  // Configure projects for major browsers
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
