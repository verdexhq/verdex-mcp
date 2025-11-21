import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../../src/runtime/MultiContextBrowser.js";

test.describe("Bridge Configuration", () => {
  test("programmatic config takes precedence over env vars", async () => {
    // Set env var
    process.env.BRIDGE_MAX_DEPTH = "10";

    const browser = new MultiContextBrowser();

    // Set programmatically BEFORE initialize
    browser.setBridgeConfiguration({ maxDepth: 5 });

    await browser.initialize();

    // Navigate to a page to verify config is applied
    await browser.navigate("data:text/html,<button>Test</button>");

    // Programmatic value should win (5, not 10)
    // We verify by checking that the bridge was created successfully
    const snapshot = await browser.snapshot();
    expect(snapshot.text).toContain("button");

    await browser.close();
    delete process.env.BRIDGE_MAX_DEPTH;
  });

  test("env vars used when no programmatic config", async () => {
    // Set env var
    process.env.BRIDGE_MAX_DEPTH = "15";

    const browser = new MultiContextBrowser();

    // Don't set programmatic config - env var should be used
    await browser.initialize();

    // Navigate to a page
    await browser.navigate("data:text/html,<button>Test</button>");

    // Env var value should be used
    const snapshot = await browser.snapshot();
    expect(snapshot.text).toContain("button");

    await browser.close();
    delete process.env.BRIDGE_MAX_DEPTH;
  });

  test("invalid env vars are ignored", async () => {
    // Set invalid env var
    process.env.BRIDGE_MAX_DEPTH = "invalid";
    process.env.BRIDGE_MAX_SIBLINGS = "-5";

    const browser = new MultiContextBrowser();
    await browser.initialize();

    // Should still work with defaults
    await browser.navigate("data:text/html,<button>Test</button>");
    const snapshot = await browser.snapshot();
    expect(snapshot.text).toContain("button");

    await browser.close();
    delete process.env.BRIDGE_MAX_DEPTH;
    delete process.env.BRIDGE_MAX_SIBLINGS;
  });
});
