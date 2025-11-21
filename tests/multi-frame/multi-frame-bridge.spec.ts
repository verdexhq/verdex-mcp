import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../../src/runtime/MultiContextBrowser.js";

test.describe("Multi-Frame Bridge", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.initialize();
  });

  test.afterEach(async () => {
    await browser.close();
  });

  test("can inject bridge into child frame", async () => {
    const html = `<iframe srcdoc="<button>Child Button</button>"></iframe>`;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);

    const context = await (browser as any)._roleContexts.get("default");
    const cdp = context.cdpSession;

    // Get child frame ID
    const { frameTree } = await cdp.send("Page.getFrameTree");
    const childFrameId = frameTree.childFrames[0].frame.id;

    // GATE: Lazy injection - bridge created on first access
    await context.bridgeInjector.ensureFrameState(cdp, childFrameId);

    // GATE: Second call should be instant (already injected)
    const start = Date.now();
    await context.bridgeInjector.ensureFrameState(cdp, childFrameId);
    expect(Date.now() - start).toBeLessThan(10); // Should be cached

    // GATE: Should be able to call methods on child frame bridge
    const snapshot = await context.bridgeInjector.callBridgeMethod(
      cdp,
      "snapshot",
      [],
      childFrameId
    );

    expect(snapshot.text).toBeTruthy();
    expect(snapshot.text).toContain("Child Button");
    console.log("✓ Child frame bridge works:", snapshot.text);
  });

  test("tracks multiple frame states", async () => {
    const html = `
      <iframe id="f1" srcdoc="<button>Frame 1</button>"></iframe>
      <iframe id="f2" srcdoc="<button>Frame 2</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);

    const context = await (browser as any)._roleContexts.get("default");
    const cdp = context.cdpSession;

    // Get frame IDs
    const { frameTree } = await cdp.send("Page.getFrameTree");
    const frame1Id = frameTree.childFrames[0].frame.id;
    const frame2Id = frameTree.childFrames[1].frame.id;

    // Inject into both frames
    await context.bridgeInjector.ensureFrameState(cdp, frame1Id);
    await context.bridgeInjector.ensureFrameState(cdp, frame2Id);

    // GATE: Should be able to call methods on both frames
    const snapshot1 = await context.bridgeInjector.callBridgeMethod(
      cdp,
      "snapshot",
      [],
      frame1Id
    );
    const snapshot2 = await context.bridgeInjector.callBridgeMethod(
      cdp,
      "snapshot",
      [],
      frame2Id
    );

    expect(snapshot1.text).toContain("Frame 1");
    expect(snapshot2.text).toContain("Frame 2");
    console.log("✓ Multiple frame states tracked");
  });

  test("lazy injection - second call is instant", async () => {
    const html = `<iframe srcdoc="<button>Test</button>"></iframe>`;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);

    const context = await (browser as any)._roleContexts.get("default");
    const cdp = context.cdpSession;

    const { frameTree } = await cdp.send("Page.getFrameTree");
    const childFrameId = frameTree.childFrames[0].frame.id;

    // First call - should inject and create state
    const firstCallStart = Date.now();
    await context.bridgeInjector.ensureFrameState(cdp, childFrameId);
    const firstCallDuration = Date.now() - firstCallStart;

    // Second call - should be instant (cached)
    const secondCallStart = Date.now();
    await context.bridgeInjector.ensureFrameState(cdp, childFrameId);
    const secondCallDuration = Date.now() - secondCallStart;

    console.log(
      `First call: ${firstCallDuration}ms, Second call: ${secondCallDuration}ms`
    );

    // GATE: Second call should be near-instant (cached)
    expect(secondCallDuration).toBeLessThan(10); // Should be cached and fast

    // GATE: Can still call methods after caching
    const snapshot = await context.bridgeInjector.callBridgeMethod(
      cdp,
      "snapshot",
      [],
      childFrameId
    );
    expect(snapshot.text).toContain("Test");
  });

  test("clears frame state on main frame navigation", async () => {
    // Navigate to first page
    await browser.navigate(`data:text/html,<button>Page 1</button>`);

    const context = await (browser as any)._roleContexts.get("default");
    const cdp = context.cdpSession;
    const mainFrameId = context.mainFrameId;

    // Inject bridge into main frame
    await context.bridgeInjector.ensureFrameState(cdp, mainFrameId);

    // Verify first page content
    let snapshot = await context.bridgeInjector.callBridgeMethod(
      cdp,
      "snapshot",
      [],
      mainFrameId
    );
    expect(snapshot.text).toContain("Page 1");

    // Navigate to second page (new document, execution context is destroyed)
    await browser.navigate(`data:text/html,<button>Page 2</button>`);

    // Frame ID stays the same, but execution context was destroyed and recreated
    // Our navigation listener should have cleared the frame state

    // Should need to inject again (state cleared on navigation)
    await context.bridgeInjector.ensureFrameState(cdp, mainFrameId);

    // Verify second page content
    snapshot = await context.bridgeInjector.callBridgeMethod(
      cdp,
      "snapshot",
      [],
      mainFrameId
    );
    expect(snapshot.text).toContain("Page 2");

    console.log("✓ Frame state properly cleared on navigation");
  });

  test("handles concurrent frame injection", async () => {
    const html = `
      <iframe id="f1" srcdoc="<button>Frame 1</button>"></iframe>
      <iframe id="f2" srcdoc="<button>Frame 2</button>"></iframe>
      <iframe id="f3" srcdoc="<button>Frame 3</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);

    const context = await (browser as any)._roleContexts.get("default");
    const cdp = context.cdpSession;

    const { frameTree } = await cdp.send("Page.getFrameTree");
    const frameIds = frameTree.childFrames.map((f: any) => f.frame.id);

    // Inject into all frames concurrently
    const injectionPromises = frameIds.map((frameId: string) =>
      context.bridgeInjector.ensureFrameState(cdp, frameId)
    );
    await Promise.all(injectionPromises);

    // Verify all frames have working bridges
    const snapshotPromises = frameIds.map((frameId: string, index: number) =>
      context.bridgeInjector
        .callBridgeMethod(cdp, "snapshot", [], frameId)
        .then((snapshot: any) => ({
          frameIndex: index + 1,
          text: snapshot.text,
        }))
    );

    const snapshots = await Promise.all(snapshotPromises);

    snapshots.forEach((snapshot, index) => {
      expect(snapshot.text).toContain(`Frame ${index + 1}`);
    });

    console.log("✓ Concurrent frame injection handled correctly");
  });
});
