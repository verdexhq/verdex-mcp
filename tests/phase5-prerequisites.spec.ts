import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../src/runtime/MultiContextBrowser";

test.describe("Phase 5 Prerequisites", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.initialize();
  });

  test.afterEach(async () => {
    await browser.close();
  });

  test("PREREQUISITE: child frames have bridges after navigation", async () => {
    const html = `
      <button>Main</button>
      <iframe srcdoc="<button>Child</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);

    const context = await (browser as any)._roleContexts.get("default");
    const cdp = context.cdpSession;

    // Get frame tree
    const { frameTree } = await cdp.send("Page.getFrameTree");
    console.log(`Main frame: ${frameTree.frame.id}`);
    console.log(`Child frames: ${frameTree.childFrames?.length || 0}`);

    expect(frameTree.childFrames).toBeDefined();
    expect(frameTree.childFrames.length).toBeGreaterThan(0);

    // Check main frame has bridge (getBridgeHandle will ensure state AND create instance)
    const mainBridgeId = await context.bridgeInjector.getBridgeHandle(
      cdp,
      frameTree.frame.id
    );
    expect(mainBridgeId).toBeTruthy();
    console.log("✓ Main frame has bridge");

    // Check child frame has bridge (this will trigger lazy injection if needed)
    const childFrameId = frameTree.childFrames[0].frame.id;
    const childBridgeId = await context.bridgeInjector.getBridgeHandle(
      cdp,
      childFrameId
    );
    expect(childBridgeId).toBeTruthy();
    console.log(`✓ Child frame ${childFrameId} has bridge`);
  });

  test("PREREQUISITE: can snapshot child frame directly", async () => {
    const html = `
      <button>Main</button>
      <iframe srcdoc="<button>Child Button</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);

    const context = await (browser as any)._roleContexts.get("default");
    const cdp = context.cdpSession;

    // Get child frameId
    const { frameTree } = await cdp.send("Page.getFrameTree");
    const childFrameId = frameTree.childFrames[0].frame.id;

    // Try to snapshot the child frame directly
    const childSnapshot = await context.bridgeInjector.callBridgeMethod(
      cdp,
      "snapshot",
      [],
      childFrameId
    );

    console.log("\n=== CHILD FRAME SNAPSHOT ===");
    console.log(childSnapshot.text);
    console.log("============================\n");

    expect(childSnapshot.text).toBeTruthy();
    expect(childSnapshot.text).toContain("Child Button");
    console.log("✓ Can snapshot child frames directly");
  });

  test("PREREQUISITE: resolveFrameFromRef works end-to-end", async () => {
    const html = `
      <button>Main</button>
      <iframe srcdoc="<button>Child</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();

    // Get iframe ref from main snapshot
    const iframeRef = snapshot.text.match(/iframe.*\[ref=(e\d+)\]/)?.[1];
    expect(iframeRef).toBeDefined();
    console.log(`Found iframe ref: ${iframeRef}`);

    const context = await (browser as any)._roleContexts.get("default");

    // Resolve it
    const frameInfo = await (browser as any).resolveFrameFromRef(
      context,
      context.mainFrameId,
      iframeRef!
    );

    expect(frameInfo).toBeDefined();
    expect(frameInfo.frameId).toBeTruthy();
    console.log(`✓ Resolved to frameId: ${frameInfo.frameId}`);

    // Verify it's actually a child frame
    const { frameTree } = await context.cdpSession.send("Page.getFrameTree");
    const childFrameIds = frameTree.childFrames.map((c: any) => c.frame.id);
    expect(childFrameIds).toContain(frameInfo.frameId);
    console.log("✓ frameId is valid child frame");
  });
});
