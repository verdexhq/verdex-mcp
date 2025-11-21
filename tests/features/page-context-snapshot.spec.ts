/**
 * Tests for pageContext in snapshots
 * Validates that snapshots include current URL and title
 */
import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../../src/runtime/MultiContextBrowser";

test.describe("Page Context in Snapshots", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.initialize();
  });

  test.afterEach(async () => {
    await browser.close();
  });

  test("snapshot should include pageContext with URL and title", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Test Page</title></head>
        <body><h1>Content</h1></body>
      </html>
    `;

    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();

    expect(snapshot.pageContext).toBeDefined();
    expect(snapshot.pageContext?.url).toContain("data:text/html");
    expect(snapshot.pageContext?.title).toBe("Test Page");
  });

  test.skip("pageContext should reflect pushState SPA navigation", async () => {
    // TODO: This test accesses browser internals - needs refactoring to use public API
    // Use real URL since pushState doesn't work on data: URLs (security restriction)
    await browser.navigate("https://example.com");

    const initialSnapshot = await browser.snapshot();
    const initialUrl = initialSnapshot.pageContext?.url;
    expect(initialUrl).toBe("https://example.com/");

    // Inject pushState navigation
    const context = await (browser as any).ensureCurrentRoleContext();
    await context.page.evaluate(() => {
      history.pushState({}, "", "/spa-route");
    });

    // Verify pageContext reflects the SPA navigation
    const snapshot = await browser.snapshot();
    expect(snapshot.pageContext?.url).toBe("https://example.com/spa-route");
  });

  test("navigate should include both navigation and pageContext", async () => {
    const html = `<!DOCTYPE html>
    <html>
      <head><title>Nav Test</title></head>
      <body><h1>Test</h1></body>
    </html>`;

    const snapshot = await browser.navigate(
      `data:text/html,${encodeURIComponent(html)}`
    );

    // Should have navigation metadata
    expect(snapshot.navigation).toBeDefined();
    expect(snapshot.navigation?.pageTitle).toBe("Nav Test");

    // Should also have pageContext
    expect(snapshot.pageContext).toBeDefined();
    expect(snapshot.pageContext?.title).toBe("Nav Test");

    // Both should match
    expect(snapshot.pageContext?.title).toBe(snapshot.navigation?.pageTitle);
  });

  test("pageContext should track dynamic title changes", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Original</title></head>
        <body>
          <button onclick="document.title = 'Changed'">Change Title</button>
        </body>
      </html>
    `;

    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);

    let snapshot = await browser.snapshot();
    expect(snapshot.pageContext?.title).toBe("Original");

    // Click button to change title
    const buttonSnapshot = await browser.snapshot();
    const buttonMatch = buttonSnapshot.text.match(/\[ref=(e\d+)\]/);
    const buttonRef = buttonMatch![1];
    await browser.click(buttonRef);

    // Wait for title change
    await new Promise((resolve) => setTimeout(resolve, 100));

    snapshot = await browser.snapshot();
    expect(snapshot.pageContext?.title).toBe("Changed");
  });

  test("standalone snapshot should show pageContext without navigation metadata", async () => {
    const html = `<!DOCTYPE html>
    <html>
      <head><title>Standalone</title></head>
      <body><h1>Test</h1></body>
    </html>`;

    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);

    // Take a standalone snapshot
    const snapshot = await browser.snapshot();

    // Should have pageContext
    expect(snapshot.pageContext).toBeDefined();
    expect(snapshot.pageContext?.title).toBe("Standalone");

    // Should NOT have navigation metadata (we called snapshot(), not navigate())
    expect(snapshot.navigation).toBeUndefined();
  });

  test("pageContext should work with real URLs", async () => {
    const snapshot = await browser.navigate("https://example.com");

    expect(snapshot.pageContext).toBeDefined();
    expect(snapshot.pageContext?.url).toBe("https://example.com/");
    expect(snapshot.pageContext?.title).toBeTruthy();
    expect(typeof snapshot.pageContext?.title).toBe("string");
  });
});
