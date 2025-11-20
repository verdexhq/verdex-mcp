import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../src/runtime/MultiContextBrowser";

test.describe("Phase 6 Prerequisites", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.initialize();
  });

  test.afterEach(async () => {
    await browser.close();
  });

  test("PREREQUISITE: refIndex exists after snapshot", async () => {
    const html = `
      <button>Main Button</button>
      <iframe srcdoc="<button>Child Button</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    await browser.snapshot();

    const context = await (browser as any)._roleContexts.get("default");
    const refIndex = context.refIndex;

    expect(refIndex).toBeDefined();
    expect(refIndex).toBeInstanceOf(Map);
    expect(refIndex.size).toBeGreaterThan(0);
    console.log(`✓ RefIndex exists with ${refIndex.size} entries`);
  });

  test("PREREQUISITE: refIndex has correct structure", async () => {
    const html = `
      <button id="main">Main</button>
      <iframe srcdoc="<button id='child'>Child</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();

    const context = await (browser as any)._roleContexts.get("default");
    const refIndex = context.refIndex;

    // Get a main frame ref
    const mainRef = snapshot.text.match(/Main.*\[ref=(e\d+)\]/)?.[1];
    expect(mainRef).toBeDefined();

    const mainEntry = refIndex.get(mainRef!);
    expect(mainEntry).toBeDefined();
    expect(mainEntry).toHaveProperty("frameId");
    expect(mainEntry).toHaveProperty("localRef");
    expect(mainEntry.frameId).toBe(context.mainFrameId);
    expect(mainEntry.localRef).toBe(mainRef);
    console.log(`✓ Main ref structure: ${JSON.stringify(mainEntry)}`);

    // Get a child frame ref
    const childRef = snapshot.text.match(/Child.*\[ref=(f\d+_e\d+)\]/)?.[1];
    expect(childRef).toBeDefined();

    const childEntry = refIndex.get(childRef!);
    expect(childEntry).toBeDefined();
    expect(childEntry).toHaveProperty("frameId");
    expect(childEntry).toHaveProperty("localRef");
    expect(childEntry.frameId).not.toBe(context.mainFrameId);
    expect(childEntry.localRef).toMatch(/^e\d+$/);
    console.log(`✓ Child ref structure: ${JSON.stringify(childEntry)}`);
  });

  test("PREREQUISITE: refIndex persists after snapshot", async () => {
    const html = `
      <button>Main</button>
      <iframe srcdoc="<button>Child</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();

    const context = await (browser as any)._roleContexts.get("default");
    const refIndexBefore = context.refIndex;
    const sizeBefore = refIndexBefore.size;

    // Simulate some time passing
    await new Promise((resolve) => setTimeout(resolve, 100));

    // RefIndex should still be there
    const refIndexAfter = context.refIndex;
    expect(refIndexAfter).toBe(refIndexBefore); // Same object
    expect(refIndexAfter.size).toBe(sizeBefore);
    console.log("✓ RefIndex persists on context");
  });

  test("PREREQUISITE: new snapshot replaces refIndex", async () => {
    const html1 = `<button>Page 1</button>`;
    const html2 = `<button>Page 2</button><button>Page 2 Extra</button>`;

    await browser.navigate(`data:text/html,${encodeURIComponent(html1)}`);
    await browser.snapshot();

    const context = await (browser as any)._roleContexts.get("default");
    const refIndex1 = context.refIndex;
    const size1 = refIndex1.size;

    await browser.navigate(`data:text/html,${encodeURIComponent(html2)}`);
    await browser.snapshot();

    const refIndex2 = context.refIndex;
    const size2 = refIndex2.size;

    // New snapshot should create new refIndex
    expect(size2).toBeGreaterThan(size1);
    console.log(`✓ RefIndex updated: ${size1} → ${size2} entries`);
  });
});
