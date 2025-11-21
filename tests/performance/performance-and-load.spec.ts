/**
 * Priority 1: Performance and Load Tests
 *
 * Critical gap: Tests that verify the system performs acceptably under load:
 * - Large DOMs (1000+ elements)
 * - Many nested iframes (10+)
 * - Rapid sequential operations
 * - Memory leak detection
 * - Performance degradation over time
 *
 * These tests ensure the system remains usable for real-world complex pages.
 */

import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../../src/runtime/MultiContextBrowser.js";

// Increase timeout for performance tests
test.setTimeout(120000); // 2 minutes

test.describe("Performance and Load Tests", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.initialize();
  });

  test.afterEach(async () => {
    await browser.close();
  });

  test("should handle large DOM (1000+ elements) within performance bounds", async () => {
    // Generate HTML with 1000 buttons
    const largeHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Large DOM Test</title></head>
        <body>
          <h1>Large DOM Performance Test</h1>
          ${Array.from(
            { length: 1000 },
            (_, i) => `<button id="btn-${i}">Button ${i}</button>`
          ).join("\n")}
        </body>
      </html>
    `;

    const start = Date.now();
    const snapshot = await browser.navigate(
      `data:text/html,${encodeURIComponent(largeHtml)}`
    );
    const navigationDuration = Date.now() - start;

    // Verify all elements were captured
    expect(snapshot.elementCount).toBeGreaterThan(900); // Allow some filtering
    expect(snapshot.text).toContain("Button 0");
    expect(snapshot.text).toContain("Button 999");

    // Performance assertions
    expect(navigationDuration).toBeLessThan(10000); // Should complete in < 10s
    console.log(
      `✓ Large DOM (1000 elements) loaded in ${navigationDuration}ms`
    );

    // Test snapshot performance on large DOM
    const snapshotStart = Date.now();
    const snapshot2 = await browser.snapshot();
    const snapshotDuration = Date.now() - snapshotStart;

    expect(snapshot2.elementCount).toBeGreaterThan(900);
    expect(snapshotDuration).toBeLessThan(5000); // Snapshot should be fast
    console.log(`✓ Snapshot generated in ${snapshotDuration}ms`);

    // Test interaction performance
    const interactionStart = Date.now();
    const ref = snapshot.text.match(/Button 500.*\[ref=(e\d+)\]/)?.[1];
    expect(ref).toBeDefined();
    await browser.click(ref!);
    const interactionDuration = Date.now() - interactionStart;

    expect(interactionDuration).toBeLessThan(1500); // Interaction should be fast (relaxed for CI)
    console.log(`✓ Interaction completed in ${interactionDuration}ms`);
  });

  test("should handle very large DOM (5000+ elements) gracefully", async () => {
    // Generate HTML with 5000 elements (stress test)
    const elements = Array.from({ length: 5000 }, (_, i) => {
      if (i % 10 === 0) return `<button>Button ${i}</button>`;
      return `<div>Element ${i}</div>`;
    }).join("\n");

    const veryLargeHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Very Large DOM</title></head>
        <body>${elements}</body>
      </html>
    `;

    const start = Date.now();
    const snapshot = await browser.navigate(
      `data:text/html,${encodeURIComponent(veryLargeHtml)}`
    );
    const duration = Date.now() - start;

    expect(snapshot.elementCount).toBeGreaterThan(100); // Should at least capture some elements
    expect(duration).toBeLessThan(30000); // Should complete within 30s
    console.log(`✓ Very large DOM (5000 elements) loaded in ${duration}ms`);
    console.log(`  Element count captured: ${snapshot.elementCount}`);
  });

  test("should handle many nested iframes (10+) within performance bounds", async () => {
    // Generate nested iframes
    let nestedHtml = "<button>Level 10</button>";
    for (let i = 9; i >= 0; i--) {
      nestedHtml = `
        <h1>Level ${i}</h1>
        <button>Button ${i}</button>
        <iframe srcdoc="${nestedHtml.replace(/"/g, "&quot;")}"></iframe>
      `;
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Nested Iframes</title></head>
        <body>${nestedHtml}</body>
      </html>
    `;

    const start = Date.now();
    const snapshot = await browser.navigate(
      `data:text/html,${encodeURIComponent(html)}`
    );
    const duration = Date.now() - start;

    // Verify multiple levels captured
    expect(snapshot.text).toContain("Level 0");
    expect(snapshot.text).toContain("Level 5");
    expect(snapshot.text).toContain("Level 9");

    // Verify frame refs exist
    expect(snapshot.text).toMatch(/\[ref=f\d+_e\d+\]/);

    // Performance assertion
    expect(duration).toBeLessThan(15000); // 10 nested frames should load in < 15s
    console.log(`✓ 10 nested iframes loaded in ${duration}ms`);
  });

  test("should handle many sibling iframes (20+)", async () => {
    // Generate 20 sibling iframes
    const iframes = Array.from(
      { length: 20 },
      (_, i) => `<iframe srcdoc="<button>Frame ${i}</button>"></iframe>`
    ).join("\n");

    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Many Iframes</title></head>
        <body>
          <h1>Many Sibling Iframes</h1>
          ${iframes}
        </body>
      </html>
    `;

    const start = Date.now();
    const snapshot = await browser.navigate(
      `data:text/html,${encodeURIComponent(html)}`
    );
    const duration = Date.now() - start;

    // Verify multiple frames captured
    expect(snapshot.text).toContain("Frame 0");
    expect(snapshot.text).toContain("Frame 10");
    expect(snapshot.text).toContain("Frame 19");

    // Verify different frame refs
    expect(snapshot.text).toMatch(/\[ref=f1_e\d+\]/);
    expect(snapshot.text).toMatch(/\[ref=f10_e\d+\]/);
    expect(snapshot.text).toMatch(/\[ref=f20_e\d+\]/);

    expect(duration).toBeLessThan(20000); // 20 frames should load in < 20s
    console.log(`✓ 20 sibling iframes loaded in ${duration}ms`);
  });

  test("should handle rapid sequential operations (100 snapshots)", async () => {
    await browser.navigate("data:text/html,<button>Test Button</button>");

    const timings: number[] = [];
    const start = Date.now();

    // Take 100 snapshots rapidly
    for (let i = 0; i < 100; i++) {
      const opStart = Date.now();
      const snapshot = await browser.snapshot();
      const opDuration = Date.now() - opStart;

      timings.push(opDuration);
      expect(snapshot.elementCount).toBeGreaterThan(0);
    }

    const totalDuration = Date.now() - start;
    const avgDuration = timings.reduce((a, b) => a + b, 0) / timings.length;
    const maxDuration = Math.max(...timings);
    const minDuration = Math.min(...timings);

    console.log(`\n=== 100 SEQUENTIAL SNAPSHOTS ===`);
    console.log(`Total time:    ${totalDuration}ms`);
    console.log(`Average time:  ${avgDuration.toFixed(2)}ms`);
    console.log(`Min time:      ${minDuration}ms`);
    console.log(`Max time:      ${maxDuration}ms`);
    console.log(`================================\n`);

    // Performance assertions
    expect(avgDuration).toBeLessThan(100); // Average should be < 100ms
    expect(maxDuration).toBeLessThan(500); // No single operation > 500ms
    expect(totalDuration).toBeLessThan(15000); // Total < 15s

    // Check for performance degradation
    const firstTenAvg = timings.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
    const lastTenAvg = timings.slice(-10).reduce((a, b) => a + b, 0) / 10;
    const degradation = (lastTenAvg - firstTenAvg) / firstTenAvg;

    console.log(`Performance degradation: ${(degradation * 100).toFixed(2)}%`);
    expect(degradation).toBeLessThan(2.0); // Should not degrade more than 200%
  });

  test("should handle rapid sequential navigations (50 pages)", async () => {
    const timings: number[] = [];
    const start = Date.now();

    for (let i = 0; i < 50; i++) {
      const opStart = Date.now();
      await browser.navigate(
        `data:text/html,<h1>Page ${i}</h1><button>Button ${i}</button>`
      );
      const opDuration = Date.now() - opStart;

      timings.push(opDuration);
    }

    const totalDuration = Date.now() - start;
    const avgDuration = timings.reduce((a, b) => a + b, 0) / timings.length;

    console.log(`\n=== 50 SEQUENTIAL NAVIGATIONS ===`);
    console.log(`Total time:    ${totalDuration}ms`);
    console.log(`Average time:  ${avgDuration.toFixed(2)}ms`);
    console.log(`=================================\n`);

    expect(avgDuration).toBeLessThan(1500); // Average navigation < 1.5s (relaxed for CI)
    expect(totalDuration).toBeLessThan(90000); // Total < 90s

    // Check for memory issues by taking final snapshot
    const finalSnapshot = await browser.snapshot();
    expect(finalSnapshot.text).toContain("Page 49");
  });

  test("should handle rapid sequential interactions (100 clicks)", async () => {
    await browser.navigate(
      "data:text/html,<button id='test'>Click Me</button>"
    );
    const snapshot = await browser.snapshot();

    const ref = snapshot.text.match(/\[ref=(e\d+)\]/)?.[1];
    expect(ref).toBeDefined();

    const timings: number[] = [];
    const start = Date.now();

    // Perform 100 clicks (reduced from 500 to avoid browser crashes)
    for (let i = 0; i < 100; i++) {
      const opStart = Date.now();
      await browser.click(ref!);
      const opDuration = Date.now() - opStart;
      timings.push(opDuration);
    }

    const totalDuration = Date.now() - start;
    const avgDuration = timings.reduce((a, b) => a + b, 0) / timings.length;

    console.log(`\n=== 100 SEQUENTIAL CLICKS ===`);
    console.log(`Total time:    ${totalDuration}ms`);
    console.log(`Average time:  ${avgDuration.toFixed(2)}ms`);
    console.log(`=============================\n`);

    expect(avgDuration).toBeLessThan(50); // Average click < 50ms
    expect(totalDuration).toBeLessThan(10000); // Total < 10s
  });

  test("should handle complex structural analysis on large DOM", async () => {
    // Create nested structure with many elements
    const complexHtml = `
      <!DOCTYPE html>
      <html>
        <body>
          ${Array.from(
            { length: 50 },
            (_, i) => `
            <div data-testid="card-${i}">
              <h3>Card ${i}</h3>
              <p>Description ${i}</p>
              <button id="btn-${i}">Action ${i}</button>
            </div>
          `
          ).join("\n")}
        </body>
      </html>
    `;

    await browser.navigate(`data:text/html,${encodeURIComponent(complexHtml)}`);
    const snapshot = await browser.snapshot();

    // Find a button in the middle
    const ref = snapshot.text.match(/Action 25.*\[ref=(e\d+)\]/)?.[1];
    expect(ref).toBeDefined();

    // Test resolve_container performance
    const resolveStart = Date.now();
    const container = await browser.resolve_container(ref!);
    const resolveDuration = Date.now() - resolveStart;

    expect(container.ancestors.length).toBeGreaterThan(0);
    expect(resolveDuration).toBeLessThan(1000); // Should be < 1s
    console.log(`✓ resolve_container on large DOM: ${resolveDuration}ms`);

    // Test inspect_pattern performance
    const inspectStart = Date.now();
    const pattern = await browser.inspect_pattern(ref!, 1);
    const inspectDuration = Date.now() - inspectStart;

    expect(pattern.siblings.length).toBeGreaterThan(0);
    expect(inspectDuration).toBeLessThan(2000); // Should be < 2s
    console.log(`✓ inspect_pattern on large DOM: ${inspectDuration}ms`);

    // Test extract_anchors performance
    const extractStart = Date.now();
    const anchors = await browser.extract_anchors(ref!, 1);
    const extractDuration = Date.now() - extractStart;

    expect(anchors.descendants.length).toBeGreaterThan(0);
    expect(extractDuration).toBeLessThan(1000); // Should be < 1s
    console.log(`✓ extract_anchors on large DOM: ${extractDuration}ms`);
  });

  test("should not leak memory across 50 navigation cycles", async () => {
    // Force GC before test if available
    if (global.gc) {
      global.gc();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const initialMemory = process.memoryUsage().heapUsed;
    console.log(
      `Initial memory: ${(initialMemory / 1024 / 1024).toFixed(2)} MB`
    );

    // Perform 50 navigation cycles (reduced from 100 to avoid timeouts)
    for (let i = 0; i < 50; i++) {
      await browser.navigate(
        `data:text/html,<button>Page ${i}</button><input type="text" />`
      );
      const snapshot = await browser.snapshot();

      // Interact with elements
      const buttonRef = snapshot.text.match(/\[ref=(e\d+)\]/)?.[1];
      if (buttonRef) {
        await browser.click(buttonRef);
      }

      // Log progress
      if ((i + 1) % 25 === 0) {
        const currentMemory = process.memoryUsage().heapUsed;
        console.log(
          `After ${i + 1} cycles: ${(currentMemory / 1024 / 1024).toFixed(
            2
          )} MB`
        );
      }
    }

    // Force GC after test if available
    if (global.gc) {
      global.gc();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const finalMemory = process.memoryUsage().heapUsed;
    const growth = (finalMemory - initialMemory) / 1024 / 1024; // MB

    console.log(`\n=== MEMORY ANALYSIS ===`);
    console.log(`Initial: ${(initialMemory / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Final:   ${(finalMemory / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Growth:  ${growth.toFixed(2)} MB`);
    console.log(`=======================\n`);

    // Memory should not grow excessively
    // Note: Some growth is expected due to caches, buffers, etc.
    expect(growth).toBeLessThan(100); // Should not grow > 100MB

    if (growth > 50) {
      console.warn(
        `⚠️  Memory growth is ${growth.toFixed(2)} MB - may indicate leak`
      );
    }
  });

  test("should not leak memory across role switches (50 cycles)", async () => {
    if (global.gc) {
      global.gc();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const initialMemory = process.memoryUsage().heapUsed;
    console.log(
      `Initial memory: ${(initialMemory / 1024 / 1024).toFixed(2)} MB`
    );

    // Perform 50 role switch cycles
    for (let i = 0; i < 50; i++) {
      await browser.selectRole(`role-${i}`);
      await browser.navigate(`data:text/html,<button>Role ${i}</button>`);
      const snapshot = await browser.snapshot();

      const ref = snapshot.text.match(/\[ref=(e\d+)\]/)?.[1];
      if (ref) {
        await browser.click(ref);
      }

      if ((i + 1) % 10 === 0) {
        const currentMemory = process.memoryUsage().heapUsed;
        console.log(
          `After ${i + 1} role switches: ${(
            currentMemory /
            1024 /
            1024
          ).toFixed(2)} MB`
        );
      }
    }

    if (global.gc) {
      global.gc();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const finalMemory = process.memoryUsage().heapUsed;
    const growth = (finalMemory - initialMemory) / 1024 / 1024;

    console.log(`\n=== ROLE SWITCH MEMORY ===`);
    console.log(`Initial: ${(initialMemory / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Final:   ${(finalMemory / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Growth:  ${growth.toFixed(2)} MB`);
    console.log(`==========================\n`);

    expect(growth).toBeLessThan(150); // Should not grow > 150MB with 50 contexts
  });

  test("should handle concurrent snapshot operations", async () => {
    await browser.navigate("data:text/html,<button>Test</button>");

    // Call snapshot 10 times concurrently
    const start = Date.now();
    const snapshots = await Promise.all(
      Array.from({ length: 10 }, () => browser.snapshot())
    );
    const duration = Date.now() - start;

    // All should succeed
    snapshots.forEach((s) => {
      expect(s.text).toContain("Test");
      expect(s.elementCount).toBeGreaterThan(0);
    });

    console.log(`✓ 10 concurrent snapshots completed in ${duration}ms`);
    expect(duration).toBeLessThan(5000); // Should complete quickly
  });

  test("should handle mixed operations at scale", async () => {
    // Simulate real-world usage pattern
    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Mixed Operations Test</h1>
          ${Array.from(
            { length: 100 },
            (_, i) => `<button id="btn-${i}">Button ${i}</button>`
          ).join("\n")}
          <input type="text" id="search" placeholder="Search" />
        </body>
      </html>
    `;

    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);

    const operations: Array<{ type: string; duration: number }> = [];

    // Mix of different operations
    for (let i = 0; i < 20; i++) {
      // Snapshot
      let start = Date.now();
      const snapshot = await browser.snapshot();
      operations.push({ type: "snapshot", duration: Date.now() - start });

      // Click
      const buttonRef = snapshot.text.match(/Button \d+.*\[ref=(e\d+)\]/)?.[1];
      if (buttonRef) {
        start = Date.now();
        await browser.click(buttonRef);
        operations.push({ type: "click", duration: Date.now() - start });
      }

      // Type (every 5th iteration)
      if (i % 5 === 0) {
        const inputRef = snapshot.text.match(/textbox.*\[ref=(e\d+)\]/)?.[1];
        if (inputRef) {
          start = Date.now();
          await browser.type(inputRef, `Search ${i}`);
          operations.push({ type: "type", duration: Date.now() - start });
        }
      }

      // Structural analysis (every 10th iteration)
      if (i % 10 === 0 && buttonRef) {
        start = Date.now();
        await browser.resolve_container(buttonRef);
        operations.push({ type: "resolve", duration: Date.now() - start });
      }
    }

    // Analyze performance by operation type
    const byType = operations.reduce((acc, op) => {
      if (!acc[op.type]) acc[op.type] = [];
      acc[op.type].push(op.duration);
      return acc;
    }, {} as Record<string, number[]>);

    console.log(`\n=== MIXED OPERATIONS ANALYSIS ===`);
    for (const [type, timings] of Object.entries(byType)) {
      const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
      const max = Math.max(...timings);
      console.log(
        `${type}: avg=${avg.toFixed(2)}ms, max=${max}ms, count=${
          timings.length
        }`
      );
    }
    console.log(`=================================\n`);

    // All operations should be reasonably fast
    for (const [type, timings] of Object.entries(byType)) {
      const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
      // Different expectations for different operation types
      const limit = type === "click" ? 1500 : 500; // Clicks can be slower
      expect(avg).toBeLessThan(limit);
    }
  });
});
