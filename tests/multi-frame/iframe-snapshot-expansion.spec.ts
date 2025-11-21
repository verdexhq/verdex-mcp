import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../../src/runtime/MultiContextBrowser";

test.describe("Iframe Snapshot Expansion", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.initialize();
  });

  test.afterEach(async () => {
    await browser.close();
  });

  test("expands single iframe content in snapshot", async () => {
    const html = `
      <button>Main Button</button>
      <iframe srcdoc="<button>Child Button</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();

    console.log("\n=== EXPANDED SNAPSHOT ===");
    console.log(snapshot.text);
    console.log("=========================\n");

    // GATE 1: Should contain both main and child content
    expect(snapshot.text).toContain("Main Button");
    expect(snapshot.text).toContain("Child Button");
    console.log("✓ Contains both main and child content");

    // GATE 2: Child button should have frame-qualified ref
    expect(snapshot.text).toMatch(/Child Button.*\[ref=f1_e\d+\]/);
    console.log("✓ Child refs are frame-qualified (f1_eN)");

    // GATE 3: Should have iframe with children indicator (colon)
    expect(snapshot.text).toMatch(/iframe.*\[ref=e\d+\]:/);
    console.log("✓ Iframe has children indicator (:)");

    // GATE 4: Child content should be indented
    const childButtonLine = snapshot.text
      .split("\n")
      .find((l) => l.includes("Child Button"));
    expect(childButtonLine).toMatch(/^\s+/); // Starts with whitespace
    console.log("✓ Child content is indented");
  });

  test("handles empty iframe gracefully", async () => {
    const html = `
      <button>Main</button>
      <iframe src="about:blank"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();

    console.log("\n=== EMPTY IFRAME ===");
    console.log(snapshot.text);
    console.log("====================\n");

    // Should handle gracefully - either expand empty or show unavailable
    expect(snapshot.text).toContain("Main");
    expect(snapshot.text).toMatch(/iframe.*\[ref=e\d+\]/);
    console.log("✓ Empty iframe handled gracefully");
  });

  test("handles multiple sibling iframes", async () => {
    const html = `
      <button>Main</button>
      <iframe srcdoc="<button>Frame 1</button>"></iframe>
      <iframe srcdoc="<button>Frame 2</button>"></iframe>
      <iframe srcdoc="<button>Frame 3</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();

    console.log("\n=== MULTIPLE IFRAMES ===");
    console.log(snapshot.text);
    console.log("========================\n");

    // GATE: Should contain all frame content
    expect(snapshot.text).toContain("Main");
    expect(snapshot.text).toContain("Frame 1");
    expect(snapshot.text).toContain("Frame 2");
    expect(snapshot.text).toContain("Frame 3");
    console.log("✓ Contains all frame content");

    // GATE: Should have distinct frame prefixes (f1, f2, f3)
    expect(snapshot.text).toMatch(/Frame 1.*\[ref=f1_e\d+\]/);
    expect(snapshot.text).toMatch(/Frame 2.*\[ref=f2_e\d+\]/);
    expect(snapshot.text).toMatch(/Frame 3.*\[ref=f3_e\d+\]/);
    console.log("✓ Each frame has distinct prefix (f1, f2, f3)");
  });

  test("handles nested iframes recursively", async () => {
    const html = `
      <button>Main</button>
      <iframe srcdoc="
        <button>Level 1</button>
        <iframe srcdoc='<button>Level 2</button>'></iframe>
      "></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();

    console.log("\n=== NESTED IFRAMES ===");
    console.log(snapshot.text);
    console.log("======================\n");

    // GATE: Should contain all levels
    expect(snapshot.text).toContain("Main");
    expect(snapshot.text).toContain("Level 1");
    expect(snapshot.text).toContain("Level 2");
    console.log("✓ Contains all nesting levels");

    // GATE: Should have nested frame prefixes (f1 for level 1, f2 for level 2)
    expect(snapshot.text).toMatch(/Level 1.*\[ref=f1_e\d+\]/);
    expect(snapshot.text).toMatch(/Level 2.*\[ref=f2_e\d+\]/);
    console.log("✓ Nested frames have correct prefixes");

    // GATE: Level 2 should be more indented than Level 1
    const level1Line = snapshot.text
      .split("\n")
      .find((l) => l.includes("Level 1"));
    const level2Line = snapshot.text
      .split("\n")
      .find((l) => l.includes("Level 2"));
    const level1Indent = level1Line?.match(/^(\s*)/)?.[1].length || 0;
    const level2Indent = level2Line?.match(/^(\s*)/)?.[1].length || 0;
    expect(level2Indent).toBeGreaterThan(level1Indent);
    console.log(
      `✓ Indentation: Level 1 (${level1Indent}) < Level 2 (${level2Indent})`
    );
  });

  test("builds correct refIndex for frame-qualified refs", async () => {
    const html = `
      <button id="main-btn">Main Button</button>
      <iframe srcdoc="<button id='child-btn'>Child Button</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();

    const context = await (browser as any)._roleContexts.get("default");
    const refIndex = context.refIndex;

    console.log("\n=== REF INDEX ===");
    console.log("Entries:", refIndex.size);
    for (const [ref, entry] of refIndex.entries()) {
      console.log(
        `  ${ref} -> frameId: ${entry.frameId}, localRef: ${entry.localRef}`
      );
    }
    console.log("=================\n");

    // GATE: refIndex should exist
    expect(refIndex).toBeDefined();
    expect(refIndex.size).toBeGreaterThan(0);
    console.log(`✓ RefIndex has ${refIndex.size} entries`);

    // GATE: Main frame refs should map to main frameId
    const mainButtonRef = snapshot.text.match(
      /Main Button.*\[ref=(e\d+)\]/
    )?.[1];
    if (mainButtonRef) {
      const entry = refIndex.get(mainButtonRef);
      expect(entry).toBeDefined();
      expect(entry?.frameId).toBe(context.mainFrameId);
      expect(entry?.localRef).toBe(mainButtonRef);
      console.log(`✓ Main ref ${mainButtonRef} maps to main frame`);
    }

    // GATE: Child frame refs should map to child frameId
    const childButtonRef = snapshot.text.match(
      /Child Button.*\[ref=(f1_e\d+)\]/
    )?.[1];
    if (childButtonRef) {
      const entry = refIndex.get(childButtonRef);
      expect(entry).toBeDefined();
      expect(entry?.frameId).not.toBe(context.mainFrameId);
      expect(entry?.localRef).toMatch(/^e\d+$/); // Local ref without prefix
      console.log(
        `✓ Child ref ${childButtonRef} maps to child frame (local: ${entry?.localRef})`
      );
    }
  });
});
