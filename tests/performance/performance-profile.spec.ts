/**
 * Performance profiling test to identify bottlenecks
 */
import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../../src/runtime/MultiContextBrowser.js";

test.describe("Performance Profiling", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.initialize();
  });

  test.afterEach(async () => {
    await browser.close();
  });

  test("profile single navigation cycle", async () => {
    const timings: Record<string, number> = {};

    // Time navigation
    const navStart = Date.now();
    await browser.navigate(`data:text/html,<button>Test Button</button>`);
    timings.navigate = Date.now() - navStart;

    // Time snapshot
    const snapStart = Date.now();
    const snapshot = await browser.snapshot();
    timings.snapshot = Date.now() - snapStart;

    // Time click
    const clickStart = Date.now();
    const refMatch = snapshot.text.match(/\[ref=(e\d+)\]/);
    expect(refMatch).toBeTruthy();
    await browser.click(refMatch![1]);
    timings.click = Date.now() - clickStart;

    // Time another snapshot
    const snap2Start = Date.now();
    await browser.snapshot();
    timings.snapshot2 = Date.now() - snap2Start;

    console.log("\n=== TIMING BREAKDOWN ===");
    console.log(`Navigate:       ${timings.navigate}ms`);
    console.log(`Snapshot:       ${timings.snapshot}ms`);
    console.log(`Click:          ${timings.click}ms`);
    console.log(`Snapshot (2):   ${timings.snapshot2}ms`);
    console.log(
      `TOTAL:          ${Object.values(timings).reduce((a, b) => a + b, 0)}ms`
    );
    console.log("========================\n");
  });

  test("profile 5 navigation cycles (like failing test)", async () => {
    const allTimings: Array<Record<string, number>> = [];

    for (let i = 0; i < 5; i++) {
      const timings: Record<string, number> = {};

      const navStart = Date.now();
      await browser.navigate(
        `data:text/html,<button>Button ${i}</button><input type="text" />`
      );
      timings.navigate = Date.now() - navStart;

      const snapStart = Date.now();
      const snapshot = await browser.snapshot();
      timings.snapshot = Date.now() - snapStart;

      const buttonRef = snapshot.text.match(
        /button Button \d+.*\[ref=(e\d+)\]/
      )![1];
      const inputRef = snapshot.text.match(/textbox.*\[ref=(e\d+)\]/)![1];

      const clickStart = Date.now();
      await browser.click(buttonRef);
      timings.click = Date.now() - clickStart;

      const typeStart = Date.now();
      await browser.type(inputRef, `Text ${i}`);
      timings.type = Date.now() - typeStart;

      const resolveStart = Date.now();
      await browser.resolve_container(buttonRef);
      timings.resolve = Date.now() - resolveStart;

      const snap2Start = Date.now();
      await browser.snapshot();
      timings.snapshot2 = Date.now() - snap2Start;

      allTimings.push(timings);

      const iterTotal = Object.values(timings).reduce((a, b) => a + b, 0);
      console.log(`\nIteration ${i}: ${iterTotal}ms`);
    }

    // Calculate averages
    const avgTimings: Record<string, number> = {};
    const operations = Object.keys(allTimings[0]);

    for (const op of operations) {
      const sum = allTimings.reduce((acc, t) => acc + t[op], 0);
      avgTimings[op] = Math.round(sum / allTimings.length);
    }

    const avgTotal = Object.values(avgTimings).reduce((a, b) => a + b, 0);

    console.log("\n=== AVERAGE TIMING PER ITERATION ===");
    console.log(`Navigate:       ${avgTimings.navigate}ms`);
    console.log(`Snapshot:       ${avgTimings.snapshot}ms`);
    console.log(`Click:          ${avgTimings.click}ms`);
    console.log(`Type:           ${avgTimings.type}ms`);
    console.log(`Resolve:        ${avgTimings.resolve}ms`);
    console.log(`Snapshot (2):   ${avgTimings.snapshot2}ms`);
    console.log(`AVG PER ITER:   ${avgTotal}ms`);
    console.log(`TOTAL 5 ITERS:  ${avgTotal * 5}ms`);
    console.log("====================================\n");
  });
});
