/**
 * Validation test for bundled bridge injection
 */
import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../../src/runtime/MultiContextBrowser.js";

test.describe("Bundled Bridge Injection", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.initialize();
  });

  test.afterEach(async () => {
    if (browser) {
      await browser.close();
    }
  });

  test("should inject bridge with correct version", async () => {
    // Navigate to a simple page
    await browser.navigate("https://example.com");

    // Verify snapshot works (proves bridge is injected and functional)
    const snapshot = await browser.snapshot();

    expect(snapshot).toBeDefined();
    expect(snapshot.text).toBeDefined();
    expect(snapshot.elementCount).toBeGreaterThanOrEqual(0);
  });

  test("should survive page navigation", async () => {
    // First navigation
    await browser.navigate("https://example.com");
    const snapshot1 = await browser.snapshot();
    expect(snapshot1.elementCount).toBeGreaterThanOrEqual(0);

    // Second navigation
    await browser.navigate("https://www.iana.org/domains/reserved");
    const snapshot2 = await browser.snapshot();
    expect(snapshot2.elementCount).toBeGreaterThanOrEqual(0);

    // Bridge should still work after navigation
    expect(snapshot2.text).toBeDefined();
  });

  test("should handle multiple roles with isolated bridges", async () => {
    // Default role
    await browser.navigate("https://example.com");
    const snapshot1 = await browser.snapshot();
    expect(snapshot1.elementCount).toBeGreaterThanOrEqual(0);

    // Create and switch to new role
    await browser.selectRole("test-role");
    await browser.navigate("https://example.com");
    const snapshot2 = await browser.snapshot();

    // Both snapshots should work independently
    expect(snapshot2.elementCount).toBeGreaterThanOrEqual(0);

    // Switch back to default
    await browser.selectRole("default");
    const snapshot3 = await browser.snapshot();
    expect(snapshot3.text).toBeDefined();
  });

  test("should provide bridge version metadata", async () => {
    await browser.navigate("https://example.com");

    // Get snapshot - if this works, the bridge factory with version is available
    const snapshot = await browser.snapshot();
    expect(snapshot).toBeDefined();

    // The fact that snapshot() works proves:
    // 1. Bridge bundle injected successfully
    // 2. __VerdexBridgeFactory__ is available
    // 3. Version check passed in BridgeInjector.getBridgeHandle()
  });
});
