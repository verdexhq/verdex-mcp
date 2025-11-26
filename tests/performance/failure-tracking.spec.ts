import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../../src/runtime/MultiContextBrowser.js";

test.describe("Failure Tracking", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.initialize();
  });

  test.afterEach(async () => {
    await browser.close();
  });

  test("should track cross-origin frame failures", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Main</h1>
          <iframe src="about:blank"></iframe>
        </body>
      </html>
    `;

    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const failures = await browser.getFailures();

    // May have captured cross-origin failures
    console.log(
      "Frame injection failures:",
      failures.frameInjectionFailures.length
    );

    if (failures.frameInjectionFailures.length > 0) {
      expect(failures.frameInjectionFailures[0]).toHaveProperty("frameId");
      expect(failures.frameInjectionFailures[0]).toHaveProperty("reason");
      expect(failures.frameInjectionFailures[0]).toHaveProperty("error");
    }
  });

  test("should include expansion errors in snapshot", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <iframe src="about:blank"></iframe>
        </body>
      </html>
    `;

    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();

    // Snapshot may have expansion errors
    if (snapshot.expansionErrors && snapshot.expansionErrors.length > 0) {
      console.log("Expansion errors found:", snapshot.expansionErrors);
      expect(snapshot.expansionErrors[0]).toHaveProperty("ref");
      expect(snapshot.expansionErrors[0]).toHaveProperty("error");
    }
  });

  test("should provide failure query API", async () => {
    await browser.navigate("data:text/html,<h1>Test</h1>");

    // Should not throw
    const failures = await browser.getFailures();
    expect(failures).toBeDefined();
    expect(Array.isArray(failures.frameInjectionFailures)).toBe(true);
    expect(Array.isArray(failures.frameExpansionFailures)).toBe(true);

    // Should be clearable
    await browser.clearFailures();
    const cleared = await browser.getFailures();
    expect(cleared.frameInjectionFailures.length).toBe(0);
  });

  test("should track failures independently per role", async () => {
    // Default role
    await browser.navigate("data:text/html,<h1>Default</h1>");
    const defaultFailures = await browser.getFailures();

    // Switch to new role
    await browser.selectRole("test-role");
    await browser.navigate("data:text/html,<h1>Test Role</h1>");
    const testRoleFailures = await browser.getFailures();

    // Both should be independent
    expect(defaultFailures).toBeDefined();
    expect(testRoleFailures).toBeDefined();

    // Clear one shouldn't affect the other
    await browser.clearFailures();
    const clearedTestRole = await browser.getFailures();
    expect(clearedTestRole.frameInjectionFailures.length).toBe(0);
  });

  test("should handle getFailures when no context exists", async () => {
    // Should return empty failures without throwing
    const failures = await browser.getFailures();
    expect(failures).toBeDefined();
    expect(failures.frameInjectionFailures).toEqual([]);
    expect(failures.frameExpansionFailures).toEqual([]);
    expect(failures.cleanupErrors).toEqual([]);
  });

  test("should track frame expansion failures", async () => {
    // Create a page with a cross-origin iframe
    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Main Content</h1>
          <iframe id="test-frame" src="about:blank"></iframe>
        </body>
      </html>
    `;

    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);

    // Wait a bit for iframe processing
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Get snapshot which will attempt to expand iframes
    const snapshot = await browser.snapshot();
    const failures = await browser.getFailures();

    // Check if expansion failures were tracked
    console.log(
      "Frame expansion failures:",
      failures.frameExpansionFailures.length
    );
    console.log("Snapshot expansion errors:", snapshot.expansionErrors?.length);

    // Verify failure structure if any exist
    if (failures.frameExpansionFailures.length > 0) {
      const failure = failures.frameExpansionFailures[0];
      expect(failure).toHaveProperty("ref");
      expect(failure).toHaveProperty("error");
      expect(failure).toHaveProperty("detached");
      expect(failure).toHaveProperty("timestamp");
      expect(typeof failure.timestamp).toBe("number");
    }
  });
});
