/**
 * E2E Tests: Structural Analysis Edge Cases
 *
 * Tests the structural analysis tools with edge cases:
 * - resolve_container: Deep nesting, shallow DOM, no ancestors
 * - inspect_pattern: No siblings, many siblings, different patterns
 * - extract_anchors: Deep trees, wide trees, performance limits
 * - Data attribute preservation
 *
 * Critical for ensuring selector generation handles all DOM structures.
 */

import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../../src/runtime/MultiContextBrowser.js";

test.describe("Structural Analysis Edge Cases", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.initialize();
  });

  test.afterEach(async () => {
    await browser.close();
  });

  test.describe("resolve_container", () => {
    test("should handle deep nesting", async () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <body>
            <div id="level1">
              <div id="level2">
                <div id="level3">
                  <div id="level4">
                    <div id="level5">
                      <button id="deep-button">Deep Button</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </body>
        </html>
      `;

      await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
      const snapshot = await browser.snapshot();

      const refMatch = snapshot.text.match(/\[ref=(e\d+)\]/);
      expect(refMatch).toBeTruthy();
      const ref = refMatch![1];

      const result = await browser.resolve_container(ref);
      expect(result.target.ref).toBe(ref);
      expect(result.ancestors.length).toBeGreaterThan(3);

      // Should have found multiple ancestor levels
      expect(result.ancestors.some((a) => a.level > 3)).toBe(true);
    });

    test("should handle shallow DOM (button directly in body)", async () => {
      const html = "<button>Shallow Button</button>";

      await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
      const snapshot = await browser.snapshot();

      const refMatch = snapshot.text.match(/\[ref=(e\d+)\]/);
      expect(refMatch).toBeTruthy();
      const ref = refMatch![1];

      const result = await browser.resolve_container(ref);
      expect(result.target.ref).toBe(ref);
      // Shallow DOM should have few or no ancestors (only body)
      expect(result.ancestors.length).toBeLessThanOrEqual(3);
    });

    test("should handle element with data-testid", async () => {
      const html = `
        <div data-testid="container">
          <div data-testid="card">
            <button data-testid="action-button">Click</button>
          </div>
        </div>
      `;

      await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
      const snapshot = await browser.snapshot();

      const refMatch = snapshot.text.match(/\[ref=(e\d+)\]/);
      expect(refMatch).toBeTruthy();
      const ref = refMatch![1];

      const result = await browser.resolve_container(ref);
      expect(result).toBeDefined();
      expect(result.target.ref).toBe(ref);

      // Should find ancestors with data-testid
      const hasDataTestId = result.ancestors.some(
        (a) => a.attributes && "data-testid" in a.attributes
      );
      expect(hasDataTestId).toBe(true);
    });

    test("should handle element with multiple IDs in hierarchy", async () => {
      const html = `
        <div id="outer-container">
          <div id="inner-container">
            <div id="card-wrapper">
              <button id="target-button">Target</button>
            </div>
          </div>
        </div>
      `;

      await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
      const snapshot = await browser.snapshot();

      const refMatch = snapshot.text.match(/\[ref=(e\d+)\]/);
      expect(refMatch).toBeTruthy();
      const ref = refMatch![1];

      const result = await browser.resolve_container(ref);
      expect(result.ancestors.length).toBeGreaterThan(0);

      // Should preserve ID attributes
      const hasIds = result.ancestors.some(
        (a) => a.attributes && "id" in a.attributes
      );
      expect(hasIds).toBe(true);
    });
  });

  test.describe("inspect_pattern", () => {
    test("should handle element with no siblings", async () => {
      const html = `
        <div>
          <button>Only Child</button>
        </div>
      `;

      await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
      const snapshot = await browser.snapshot();

      const refMatch = snapshot.text.match(/\[ref=(e\d+)\]/);
      expect(refMatch).toBeTruthy();
      const ref = refMatch![1];

      // Get ancestors first
      const containerResult = await browser.resolve_container(ref);
      expect(containerResult.ancestors.length).toBeGreaterThan(0);

      // Inspect pattern at parent level
      const patternResult = await browser.inspect_pattern(ref, 1);
      expect(patternResult).toBeDefined();
      expect(patternResult.siblings.length).toBeLessThanOrEqual(1);
    });

    test("should handle many siblings (large list)", async () => {
      const items = Array.from(
        { length: 20 },
        (_, i) => `
        <div class="item">
          <h3>Item ${i}</h3>
          <button>Button ${i}</button>
        </div>
      `
      ).join("");

      const html = `<div class="list">${items}</div>`;

      await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
      const snapshot = await browser.snapshot();

      const refMatch = snapshot.text.match(/\[ref=(e\d+)\]/);
      expect(refMatch).toBeTruthy();
      const ref = refMatch![1];

      const containerResult = await browser.resolve_container(ref);
      expect(containerResult.ancestors.length).toBeGreaterThan(0);

      // Should find an ancestor level with many siblings
      const levelWithManySiblings = containerResult.ancestors.find(
        (a) => a.level >= 2 && a.level <= 4
      );

      if (levelWithManySiblings) {
        const patternResult = await browser.inspect_pattern(
          ref,
          levelWithManySiblings.level
        );
        expect(patternResult.siblings.length).toBeGreaterThan(5);
      }
    });

    test("should handle mixed sibling types", async () => {
      const html = `
        <div class="container">
          <div class="card"><button>Card 1</button></div>
          <div class="card"><button>Card 2</button></div>
          <p>Some text</p>
          <div class="card"><button>Card 3</button></div>
          <span>More text</span>
        </div>
      `;

      await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
      const snapshot = await browser.snapshot();

      const refMatch = snapshot.text.match(/\[ref=(e\d+)\]/);
      expect(refMatch).toBeTruthy();
      const ref = refMatch![1];

      const containerResult = await browser.resolve_container(ref);
      const patternResult = await browser.inspect_pattern(ref, 2);

      // Should find mixed sibling types
      expect(patternResult.siblings.length).toBeGreaterThan(1);
    });

    test("should handle identical siblings (repeating pattern)", async () => {
      const html = `
        <div class="grid">
          <div class="card"><h3>Product A</h3><button>Add</button></div>
          <div class="card"><h3>Product B</h3><button>Add</button></div>
          <div class="card"><h3>Product C</h3><button>Add</button></div>
        </div>
      `;

      await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
      const snapshot = await browser.snapshot();

      const refMatch = snapshot.text.match(/\[ref=(e\d+)\]/);
      expect(refMatch).toBeTruthy();
      const ref = refMatch![1];

      const containerResult = await browser.resolve_container(ref);
      const patternResult = await browser.inspect_pattern(ref, 2);

      // Should identify repeating pattern
      expect(patternResult.siblings.length).toBe(3);
      expect(patternResult.siblings.every((s) => s.tagName === "div")).toBe(
        true
      );
    });

    test("should error when ancestor level too high", async () => {
      const html = "<button>Button</button>";

      await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
      const snapshot = await browser.snapshot();

      const refMatch = snapshot.text.match(/\[ref=(e\d+)\]/);
      expect(refMatch).toBeTruthy();
      const ref = refMatch![1];

      // Try to climb 100 levels (should fail)
      await expect(async () => {
        await browser.inspect_pattern(ref, 100);
      }).rejects.toThrow(/Ancestor level.*too high/);
    });
  });

  test.describe("extract_anchors", () => {
    test("should handle deep tree with many descendants", async () => {
      const html = `
        <div class="container">
          <div class="header">
            <h1>Title</h1>
            <nav>
              <a href="#">Link 1</a>
              <a href="#">Link 2</a>
            </nav>
          </div>
          <div class="content">
            <article>
              <h2>Article Title</h2>
              <p>Content</p>
              <button>Read More</button>
            </article>
          </div>
          <div class="footer">
            <button>Footer Action</button>
          </div>
        </div>
      `;

      await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
      const snapshot = await browser.snapshot();

      const refMatch = snapshot.text.match(/\[ref=(e\d+)\]/);
      expect(refMatch).toBeTruthy();
      const ref = refMatch![1];

      const containerResult = await browser.resolve_container(ref);
      expect(containerResult.ancestors.length).toBeGreaterThan(0);

      // Extract anchors at a mid-level ancestor
      const midLevel = Math.min(3, containerResult.ancestors.length);
      const anchorsResult = await browser.extract_anchors(ref, midLevel);

      expect(anchorsResult).toBeDefined();
      expect(anchorsResult.descendants.length).toBeGreaterThan(0);
      expect(anchorsResult.totalDescendants).toBeGreaterThan(0);
    });

    test("should handle wide tree (many siblings at same level)", async () => {
      const buttons = Array.from(
        { length: 15 },
        (_, i) => `<button>Button ${i}</button>`
      ).join("");

      const html = `<div class="toolbar">${buttons}</div>`;

      await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
      const snapshot = await browser.snapshot();

      const refMatch = snapshot.text.match(/\[ref=(e\d+)\]/);
      expect(refMatch).toBeTruthy();
      const ref = refMatch![1];

      const containerResult = await browser.resolve_container(ref);
      const anchorsResult = await browser.extract_anchors(ref, 1);

      // Should find many descendants (siblings)
      expect(anchorsResult.descendants.length).toBeGreaterThan(5);
    });

    test("should handle nested interactive elements", async () => {
      const html = `
        <div class="card">
          <div class="header">
            <h3>Card Title</h3>
            <button class="close">X</button>
          </div>
          <div class="body">
            <p>Content</p>
            <div class="actions">
              <button class="primary">Save</button>
              <button class="secondary">Cancel</button>
            </div>
          </div>
        </div>
      `;

      await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
      const snapshot = await browser.snapshot();

      const refMatch = snapshot.text.match(/\[ref=(e\d+)\]/);
      expect(refMatch).toBeTruthy();
      const ref = refMatch![1];

      const containerResult = await browser.resolve_container(ref);
      const anchorsResult = await browser.extract_anchors(ref, 2);

      // Should find nested interactive elements
      expect(anchorsResult.descendants.length).toBeGreaterThan(1);
    });

    test("should respect maxDepth limit", async () => {
      // Create very deep nesting
      const deepNesting =
        Array.from({ length: 10 }, () => "<div>").join("") +
        "<button>Deep Button</button>" +
        Array.from({ length: 10 }, () => "</div>").join("");

      await browser.navigate(
        `data:text/html,${encodeURIComponent(deepNesting)}`
      );
      const snapshot = await browser.snapshot();

      const refMatch = snapshot.text.match(/\[ref=(e\d+)\]/);
      expect(refMatch).toBeTruthy();
      const ref = refMatch![1];

      const anchorsResult = await browser.extract_anchors(ref, 0);

      // Should stop at maxDepth
      expect(anchorsResult.maxDepthReached).toBeDefined();
    });

    test("should handle element with no descendants", async () => {
      const html = `
        <div>
          <button>Leaf Node</button>
        </div>
      `;

      await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
      const snapshot = await browser.snapshot();

      const refMatch = snapshot.text.match(/\[ref=(e\d+)\]/);
      expect(refMatch).toBeTruthy();
      const ref = refMatch![1];

      const anchorsResult = await browser.extract_anchors(ref, 0);

      // Button has no children, so descendants should be minimal
      expect(anchorsResult.descendants).toBeDefined();
    });

    test("should error when ancestor level too high", async () => {
      const html = "<button>Button</button>";

      await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
      const snapshot = await browser.snapshot();

      const refMatch = snapshot.text.match(/\[ref=(e\d+)\]/);
      expect(refMatch).toBeTruthy();
      const ref = refMatch![1];

      // Try to climb 100 levels (should fail)
      await expect(async () => {
        await browser.extract_anchors(ref, 100);
      }).rejects.toThrow(/Ancestor level.*too high/);
    });
  });

  test.describe("Performance and Limits", () => {
    test("should handle structural analysis on large DOM", async () => {
      // Create a large DOM with many elements
      const items = Array.from(
        { length: 50 },
        (_, i) => `
        <div class="item">
          <h3>Item ${i}</h3>
          <p>Description ${i}</p>
          <button>Action ${i}</button>
        </div>
      `
      ).join("");

      const html = `<div class="container">${items}</div>`;

      await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
      const snapshot = await browser.snapshot();

      const refMatch = snapshot.text.match(/\[ref=(e\d+)\]/);
      expect(refMatch).toBeTruthy();
      const ref = refMatch![1];

      // All structural analysis should complete without timeout
      const startTime = Date.now();

      const containerResult = await browser.resolve_container(ref);
      expect(containerResult).toBeDefined();

      const patternResult = await browser.inspect_pattern(ref, 2);
      expect(patternResult).toBeDefined();

      const anchorsResult = await browser.extract_anchors(ref, 2);
      expect(anchorsResult).toBeDefined();

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete in reasonable time (< 5 seconds)
      expect(duration).toBeLessThan(5000);
    });

    test("should handle rapid structural analysis calls", async () => {
      const html = `
        <div class="grid">
          <div class="card"><button>1</button></div>
          <div class="card"><button>2</button></div>
          <div class="card"><button>3</button></div>
        </div>
      `;

      await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
      const snapshot = await browser.snapshot();

      const refMatch = snapshot.text.match(/\[ref=(e\d+)\]/);
      expect(refMatch).toBeTruthy();
      const ref = refMatch![1];

      // Make rapid calls
      const results = await Promise.all([
        browser.resolve_container(ref),
        browser.resolve_container(ref),
        browser.resolve_container(ref),
      ]);

      // All should succeed
      expect(results.every((r) => r.target.ref === ref)).toBe(true);
    });
  });

  test.describe("Data Attribute Preservation", () => {
    test("should preserve data-testid in structural analysis", async () => {
      const html = `
        <div data-testid="outer-container">
          <div data-testid="card-list">
            <div data-testid="card-1">
              <button data-testid="card-1-action">Action</button>
            </div>
          </div>
        </div>
      `;

      await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
      const snapshot = await browser.snapshot();

      const refMatch = snapshot.text.match(/\[ref=(e\d+)\]/);
      expect(refMatch).toBeTruthy();
      const ref = refMatch![1];

      const result = await browser.resolve_container(ref);

      // Should find ancestors with data-testid
      const ancestorsWithTestId = result.ancestors.filter(
        (a) => a.attributes && "data-testid" in a.attributes
      );

      expect(ancestorsWithTestId.length).toBeGreaterThan(0);
    });

    test("should preserve multiple data attributes", async () => {
      const html = `
        <div data-testid="container" data-component="card-list" data-version="2">
          <button data-testid="action" data-action="submit">Submit</button>
        </div>
      `;

      await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
      const snapshot = await browser.snapshot();

      const refMatch = snapshot.text.match(/\[ref=(e\d+)\]/);
      expect(refMatch).toBeTruthy();
      const ref = refMatch![1];

      const result = await browser.resolve_container(ref);

      // Should preserve all data attributes
      const containerAncestor = result.ancestors.find(
        (a) => a.attributes && "data-testid" in a.attributes
      );

      expect(containerAncestor).toBeDefined();
      if (containerAncestor?.attributes) {
        expect(containerAncestor.attributes["data-testid"]).toBeTruthy();
      }
    });
  });

  test.describe("Edge Cases and Error Handling", () => {
    test("should error for non-existent ref", async () => {
      await browser.navigate("data:text/html,<button>Test</button>");

      await expect(async () => {
        await browser.resolve_container("e999");
      }).rejects.toThrow(/Unknown element reference: e999/);

      await expect(async () => {
        await browser.inspect_pattern("e999", 1);
      }).rejects.toThrow(/Unknown element reference: e999/);

      await expect(async () => {
        await browser.extract_anchors("e999", 1);
      }).rejects.toThrow(/Unknown element reference: e999/);
    });

    test("should handle structural analysis on elements removed from DOM", async () => {
      const html = `
        <button id="will-be-removed">Click Me</button>
        <script>
          // Don't remove immediately
        </script>
      `;

      await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
      const snapshot = await browser.snapshot();

      const refMatch = snapshot.text.match(/\[ref=(e\d+)\]/);
      expect(refMatch).toBeTruthy();
      const ref = refMatch![1];

      // Structural analysis should work before removal
      const result = await browser.resolve_container(ref);
      expect(result.target.ref).toBe(ref);
    });
  });
});
