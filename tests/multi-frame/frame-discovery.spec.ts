import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../../src/runtime/MultiContextBrowser";

test.describe("Frame Discovery", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.initialize();
  });

  test.afterEach(async () => {
    await browser.close();
  });

  test("discovers and injects all frames after navigation", async () => {
    const html = `
      <button>Main</button>
      <iframe id="f1" srcdoc="<button>Frame 1</button>"></iframe>
      <iframe id="f2" srcdoc="<button>Frame 2</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);

    const context = await (browser as any)._roleContexts.get("default");
    const cdp = context.cdpSession;

    // GATE: All frames should have bridges
    const { frameTree } = await cdp.send("Page.getFrameTree");

    // Main frame - check state exists and context is ready
    const mainState = context.bridgeInjector.getFrameState(
      cdp,
      frameTree.frame.id
    );
    expect(mainState).toBeDefined();
    expect(mainState.contextId).toBeGreaterThan(0);
    expect(mainState.contextReadyPromise.isDone()).toBe(true);

    // Child frames - verify bridges work by calling snapshot
    for (const child of frameTree.childFrames) {
      const childState = context.bridgeInjector.getFrameState(
        cdp,
        child.frame.id
      );
      expect(childState).toBeDefined();
      expect(childState.contextId).toBeGreaterThan(0);
      expect(childState.contextReadyPromise.isDone()).toBe(true);

      // Verify bridge actually works by calling a method
      const snapshot = await context.bridgeInjector.callBridgeMethod(
        cdp,
        "snapshot",
        [],
        child.frame.id
      );
      expect(snapshot.text).toBeTruthy();
      console.log(`✓ Frame ${child.frame.id} has working bridge`);
    }
  });

  test("handles nested iframes", async () => {
    const html = `
      <iframe srcdoc="
        <button>Level 1</button>
        <iframe srcdoc='<button>Level 2</button>'></iframe>
      "></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);

    const context = await (browser as any)._roleContexts.get("default");
    const cdp = context.cdpSession;

    // GATE: Nested frames should have bridges
    const { frameTree } = await cdp.send("Page.getFrameTree");
    const level1 = frameTree.childFrames[0];

    // Check level 1 - verify bridge works
    const level1State = context.bridgeInjector.getFrameState(
      cdp,
      level1.frame.id
    );
    expect(level1State).toBeDefined();
    expect(level1State.contextId).toBeGreaterThan(0);

    const level1Snapshot = await context.bridgeInjector.callBridgeMethod(
      cdp,
      "snapshot",
      [],
      level1.frame.id
    );
    expect(level1Snapshot.text).toContain("Level 1");

    // Check level 2
    if (level1.childFrames?.length > 0) {
      const level2 = level1.childFrames[0];
      const level2State = context.bridgeInjector.getFrameState(
        cdp,
        level2.frame.id
      );
      expect(level2State).toBeDefined();
      expect(level2State.contextId).toBeGreaterThan(0);

      const level2Snapshot = await context.bridgeInjector.callBridgeMethod(
        cdp,
        "snapshot",
        [],
        level2.frame.id
      );
      expect(level2Snapshot.text).toContain("Level 2");
      console.log("✓ Nested frames have working bridges");
    }
  });
});
