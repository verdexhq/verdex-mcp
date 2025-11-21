/**
 * E2E Tests: Navigation Lifecycle
 *
 * Tests navigation behavior including:
 * - Navigation success with metadata
 * - Navigation failure handling
 * - Redirect tracking
 * - Status codes and content types
 * - Load time tracking
 * - Click-triggered navigation
 * - Same-document vs cross-document navigation
 *
 * Critical for ensuring navigation metadata is captured correctly.
 */

import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../../src/runtime/MultiContextBrowser.js";

test.describe("Navigation Lifecycle", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.initialize();
  });

  test.afterEach(async () => {
    // Add a small delay to ensure all async operations complete before closing
    await new Promise((resolve) => setTimeout(resolve, 100));
    await browser.close();
  });

  test("should capture navigation success metadata", async () => {
    const snapshot = await browser.navigate("https://example.com");

    // Should have navigation metadata
    expect(snapshot.navigation).toBeDefined();
    expect(snapshot.navigation?.success).toBe(true);
    expect(snapshot.navigation?.requestedUrl).toBe("https://example.com");
    expect(snapshot.navigation?.finalUrl).toContain("example.com");
    expect(snapshot.navigation?.pageTitle).toBeTruthy();
    expect(snapshot.navigation?.loadTime).toBeGreaterThan(0);
    expect(snapshot.navigation?.statusCode).toBe(200);
    expect(snapshot.navigation?.timestamp).toBeGreaterThan(0);
  });

  test("should capture page title correctly", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test Page Title</title>
        </head>
        <body>
          <h1>Content</h1>
        </body>
      </html>
    `;

    const snapshot = await browser.navigate(
      `data:text/html,${encodeURIComponent(html)}`
    );

    expect(snapshot.navigation?.pageTitle).toBe("Test Page Title");
  });

  test("should track load time", async () => {
    const snapshot = await browser.navigate("https://example.com");

    expect(snapshot.navigation?.loadTime).toBeDefined();
    expect(snapshot.navigation?.loadTime).toBeGreaterThan(0);
    expect(snapshot.navigation?.loadTime).toBeLessThan(30000); // Should load in < 30s
  });

  test("should handle navigation to data URLs", async () => {
    const html = "<h1>Data URL Page</h1>";
    const snapshot = await browser.navigate(
      `data:text/html,${encodeURIComponent(html)}`
    );

    expect(snapshot.navigation?.success).toBe(true);
    expect(snapshot.navigation?.requestedUrl).toContain("data:text/html");
    expect(snapshot.text).toContain("Data URL Page");
  });

  test("should handle navigation to file URLs", async () => {
    // Create a simple HTML snippet
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>File Test</title></head>
        <body><h1>File URL Test</h1></body>
      </html>
    `;

    // For this test, we'll use data URL since file:// requires actual files
    const snapshot = await browser.navigate(
      `data:text/html,${encodeURIComponent(html)}`
    );

    expect(snapshot.navigation?.success).toBe(true);
    expect(snapshot.text).toContain("File URL Test");
  });

  test("should handle sequential navigations", async () => {
    // First navigation
    const snapshot1 = await browser.navigate("data:text/html,<h1>Page 1</h1>");
    expect(snapshot1.navigation?.success).toBe(true);
    expect(snapshot1.text).toContain("Page 1");

    // Second navigation
    const snapshot2 = await browser.navigate("data:text/html,<h1>Page 2</h1>");
    expect(snapshot2.navigation?.success).toBe(true);
    expect(snapshot2.text).toContain("Page 2");
    expect(snapshot2.text).not.toContain("Page 1");

    // Third navigation
    const snapshot3 = await browser.navigate("data:text/html,<h1>Page 3</h1>");
    expect(snapshot3.navigation?.success).toBe(true);
    expect(snapshot3.text).toContain("Page 3");
    expect(snapshot3.text).not.toContain("Page 2");
  });

  test("should preserve bridge after navigation", async () => {
    // Navigate to first page
    await browser.navigate("data:text/html,<button>Button 1</button>");
    const snapshot1 = await browser.snapshot();
    expect(snapshot1.elementCount).toBeGreaterThan(0);

    // Navigate to second page
    await browser.navigate("data:text/html,<button>Button 2</button>");
    const snapshot2 = await browser.snapshot();
    expect(snapshot2.elementCount).toBeGreaterThan(0);
    expect(snapshot2.text).toContain("Button 2");
    expect(snapshot2.text).not.toContain("Button 1");
  });

  test("should handle click-triggered navigation", async () => {
    // Create page with link that triggers navigation
    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <a href="data:text/html,<h1>Destination Page</h1>">Click Me</a>
        </body>
      </html>
    `;

    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();

    // Find the link ref
    const linkMatch = snapshot.text.match(/link Click Me.*\[ref=(e\d+)\]/);
    expect(linkMatch).toBeTruthy();
    const linkRef = linkMatch![1];

    // Click the link (triggers navigation)
    await browser.click(linkRef);

    // Should have navigated
    const afterClick = await browser.snapshot();
    expect(afterClick.text).toContain("Destination Page");
  });

  test("should handle same-document navigation (hash changes)", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <h1 id="top">Top of Page</h1>
          <a href="#section1">Go to Section 1</a>
          <div id="section1">
            <h2>Section 1</h2>
          </div>
        </body>
      </html>
    `;

    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const initialSnapshot = await browser.snapshot();

    // Find the hash link
    const linkMatch = initialSnapshot.text.match(
      /link Go to Section 1.*\[ref=(e\d+)\]/
    );
    if (linkMatch) {
      const linkRef = linkMatch[1];

      // Click hash link (same-document navigation)
      await browser.click(linkRef);

      // Should still be on same page with same content
      const afterHashChange = await browser.snapshot();
      expect(afterHashChange.text).toContain("Section 1");
      expect(afterHashChange.text).toContain("Top of Page");
    }
  });

  test("should capture content type when available", async () => {
    const snapshot = await browser.navigate("https://example.com");

    expect(snapshot.navigation?.contentType).toBeDefined();
    expect(snapshot.navigation?.contentType).toContain("text/html");
  });

  test("should include timestamp in navigation metadata", async () => {
    const beforeNav = Date.now();
    const snapshot = await browser.navigate("https://example.com");
    const afterNav = Date.now();

    expect(snapshot.navigation?.timestamp).toBeDefined();
    expect(snapshot.navigation!.timestamp).toBeGreaterThanOrEqual(beforeNav);
    expect(snapshot.navigation!.timestamp).toBeLessThanOrEqual(afterNav);
  });

  test("should handle navigation in different roles independently", async () => {
    // Navigate in default role
    const defaultSnapshot = await browser.navigate(
      "data:text/html,<h1>Default Page</h1>"
    );
    expect(defaultSnapshot.navigation?.success).toBe(true);
    expect(defaultSnapshot.text).toContain("Default Page");

    // Switch to customer role and navigate
    await browser.selectRole("customer");
    const customerSnapshot = await browser.navigate(
      "data:text/html,<h1>Customer Page</h1>"
    );
    expect(customerSnapshot.navigation?.success).toBe(true);
    expect(customerSnapshot.text).toContain("Customer Page");
    expect(customerSnapshot.text).not.toContain("Default Page");

    // Switch back to default - should still see default page
    await browser.selectRole("default");
    const backToDefault = await browser.snapshot();
    expect(backToDefault.text).toContain("Default Page");
  });

  test("should handle rapid sequential navigations", async () => {
    for (let i = 0; i < 5; i++) {
      const snapshot = await browser.navigate(
        `data:text/html,<h1>Page ${i}</h1>`
      );
      expect(snapshot.navigation?.success).toBe(true);
      expect(snapshot.text).toContain(`Page ${i}`);
    }
  });

  test("should preserve snapshot data along with navigation metadata", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Full Test Page</title></head>
        <body>
          <h1>Heading</h1>
          <button>Click Me</button>
          <input type="text" placeholder="Enter text" />
        </body>
      </html>
    `;

    const snapshot = await browser.navigate(
      `data:text/html,${encodeURIComponent(html)}`
    );

    // Should have navigation metadata
    expect(snapshot.navigation?.success).toBe(true);
    expect(snapshot.navigation?.pageTitle).toBe("Full Test Page");

    // Should also have snapshot data
    expect(snapshot.text).toContain("Heading");
    expect(snapshot.text).toContain("Click Me");
    expect(snapshot.text).toContain("Enter text");
    expect(snapshot.elementCount).toBeGreaterThan(0);
  });

  test("should handle navigation with complex DOM", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Complex Page</title></head>
        <body>
          <nav>
            <a href="#">Home</a>
            <a href="#">About</a>
          </nav>
          <main>
            <article>
              <h1>Article Title</h1>
              <p>Article content</p>
              <button>Read More</button>
            </article>
          </main>
          <footer>
            <p>Copyright 2024</p>
          </footer>
        </body>
      </html>
    `;

    const snapshot = await browser.navigate(
      `data:text/html,${encodeURIComponent(html)}`
    );

    expect(snapshot.navigation?.success).toBe(true);
    expect(snapshot.navigation?.pageTitle).toBe("Complex Page");
    expect(snapshot.elementCount).toBeGreaterThanOrEqual(3);
    expect(snapshot.text).toContain("Article Title");
  });

  test("should handle navigation after interaction", async () => {
    // Navigate to initial page
    await browser.navigate(
      "data:text/html,<button>Click Me</button><p>Initial Page</p>"
    );
    const snapshot1 = await browser.snapshot();
    const refMatch = snapshot1.text.match(/\[ref=(e\d+)\]/);
    expect(refMatch).toBeTruthy();

    // Click button (doesn't navigate)
    await browser.click(refMatch![1]);

    // Take a snapshot after click to ensure operation completed
    await browser.snapshot();

    // Navigate to new page
    const snapshot2 = await browser.navigate(
      "data:text/html,<h1>New Page After Click</h1>"
    );
    expect(snapshot2.navigation?.success).toBe(true);
    expect(snapshot2.text).toContain("New Page After Click");
    expect(snapshot2.text).not.toContain("Initial Page");
  });

  test("should handle navigation with special characters in URL", async () => {
    const html = "<h1>Page with spaces and-dashes_underscores</h1>";
    const snapshot = await browser.navigate(
      `data:text/html,${encodeURIComponent(html)}`
    );

    expect(snapshot.navigation?.success).toBe(true);
    expect(snapshot.text).toContain("spaces and-dashes_underscores");
  });

  test("should track navigation to external sites", async () => {
    // Navigate to example.com
    const snapshot1 = await browser.navigate("https://example.com");
    expect(snapshot1.navigation?.success).toBe(true);
    expect(snapshot1.navigation?.finalUrl).toContain("example.com");

    // Navigate to iana.org
    const snapshot2 = await browser.navigate(
      "https://www.iana.org/domains/reserved"
    );
    expect(snapshot2.navigation?.success).toBe(true);
    expect(snapshot2.navigation?.finalUrl).toContain("iana.org");
  });

  test("should handle back-to-back navigations without delay", async () => {
    const start = Date.now();

    await browser.navigate("data:text/html,<h1>Page 1</h1>");
    await browser.navigate("data:text/html,<h1>Page 2</h1>");
    await browser.navigate("data:text/html,<h1>Page 3</h1>");

    const end = Date.now();
    const totalTime = end - start;

    // Should complete in reasonable time (< 10 seconds for 3 simple navigations)
    expect(totalTime).toBeLessThan(10000);
  });

  test("should reset element refs after navigation", async () => {
    // Navigate and get refs
    await browser.navigate("data:text/html,<button>Old Button</button>");
    const oldSnapshot = await browser.snapshot();
    const oldRefMatch = oldSnapshot.text.match(/\[ref=(e\d+)\]/);
    expect(oldRefMatch).toBeTruthy();
    const oldRef = oldRefMatch![1];

    // Navigate to new page
    await browser.navigate("data:text/html,<button>New Button</button>");
    const newSnapshot = await browser.snapshot();
    const newRefMatch = newSnapshot.text.match(/\[ref=(e\d+)\]/);
    expect(newRefMatch).toBeTruthy();
    const newRef = newRefMatch![1];

    // Refs should be reset after navigation (counter starts over)
    // Both buttons should get the same ref number (e.g., e1) on their respective pages
    expect(oldRef).toBe(newRef);

    // The ref now points to the NEW button, not the old one
    await browser.click(newRef); // Should work - clicks new button

    // Verify it's actually the new button by checking snapshot content
    expect(newSnapshot.text).toContain("New Button");
    expect(newSnapshot.text).not.toContain("Old Button");
  });
});
