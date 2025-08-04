import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

/**
 * Test configuration utility that manages access to environment variables
 * and throws errors when required variables are missing.
 */
export const testConfig = {
  // MARKETING SITE:
  marketingSiteUrl:
    process.env.TEST_MARKETING_SITE_URL ||
    "https://cs-fit-3dfd22a4.site-staging.joinzipper.com/",

  // CUSTOMER CREDENTIALS:
  customerLoginUrl:
    process.env.TEST_CUSTOMER_LOGIN_URL ||
    "https://cs-fit.staging01.joinzipper.com/",
  customerEmail: process.env.TEST_CUSTOMER_EMAIL || "kerry+cs@joinzipper.com",
  customerDashboardUrl:
    process.env.TEST_CUSTOMER_DASHBOARD_URL ||
    `https://cs-fit.staging01.joinzipper.com/dashboard-customer/${
      process.env.TEST_DEFAULT_CUSTOMER_ID || "457"
    }`,
  customerPassword:
    process.env.TEST_CUSTOMER_PASSWORD || "kerry+cs@joinzipper.com",
  defaultCustomerId: process.env.TEST_DEFAULT_CUSTOMER_ID || "457",

  // PROVIDER CREDENTIALS:
  providerLoginUrl:
    process.env.TEST_PROVIDER_LOGIN_URL ||
    "https://staging01.joinzipper.com/auth/login",
  providerEmail: process.env.TEST_PROVIDER_EMAIL || "chris+cs@joinzipper.com",
  providerPassword:
    process.env.TEST_PROVIDER_PASSWORD || "chris+cs@joinzipper.com",
  providerDashboardUrl:
    process.env.TEST_PROVIDER_DASHBOARD_URL ||
    "https://staging01.joinzipper.com/dashboard",
} as const;

export type TestConfig = typeof testConfig;

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

dotenv.config({ path: ".env", override: true }); // Load environment variables

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./src",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* No retries - tests must pass on first attempt */
  preserveOutput: "always",
  retries: 0,
  timeout: 60_000, // Reduced timeout to 60 seconds
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : 8, // Use 2 workers locally, 1 on CI
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "html",
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on",

    screenshot: "only-on-failure",

    video: "retain-on-failure",

    // Add navigation timeout
    navigationTimeout: 30_000,

    // Add action timeout
    actionTimeout: 10_000,
  },

  /* Configure projects for major browsers */
  projects: [
    // Customer Authentication Setup
    {
      name: "setup-customer",
      testMatch: "setup/customer-auth.setup.ts",
      use: {
        baseURL: testConfig.customerLoginUrl,
      },
    },

    // Customer Tests
    {
      name: "customer",
      use: {
        ...devices["Desktop Chrome"],
        storageState: ".auth/customer.json",
        baseURL: testConfig.customerDashboardUrl,
      },
      dependencies: ["setup-customer"],
    },

    // Provider Authentication Setup
    {
      name: "setup-provider",
      testMatch: "setup/provider-auth.setup.ts",
      use: {
        baseURL: testConfig.providerLoginUrl,
      },
    },

    // Provider Tests
    {
      name: "provider",
      use: {
        ...devices["Desktop Chrome"],
        storageState: ".auth/provider.json",
        baseURL: testConfig.providerDashboardUrl,
      },
      dependencies: ["setup-provider"],
    },

    // {
    //   name: "firefox",
    //   use: { ...devices["Desktop Firefox"] },
    // },

    // Disabled WebKit due to bus errors on macOS
    // {
    //   name: "webkit",
    //   use: { ...devices["Desktop Safari"] },
    // },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://127.0.0.1:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
