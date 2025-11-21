import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../../src/runtime/MultiContextBrowser";

test.describe("Frame Resolution", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.initialize();
  });

  test.afterEach(async () => {
    await browser.close();
  });

  test("resolves iframe ref to child frameId", async () => {
    const html = `
      <button>Main</button>
      <iframe id="test" srcdoc="<button>Child</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();

    console.log("Snapshot:", snapshot.text);

    // Get iframe ref
    const iframeRef = snapshot.text.match(/iframe.*\[ref=(e\d+)\]/)?.[1];
    expect(iframeRef).toBeDefined();
    console.log(`Iframe ref: ${iframeRef}`);

    const context = await (browser as any)._roleContexts.get("default");
    const cdp = context.cdpSession;

    // GATE: Should resolve to child frame ID
    const frameInfo = await (browser as any).resolveFrameFromRef(
      context,
      context.mainFrameId,
      iframeRef
    );

    expect(frameInfo).toBeDefined();
    expect(frameInfo.frameId).toBeTruthy();
    expect(frameInfo.frameId).not.toBe(context.mainFrameId);
    console.log(`✓ Resolved to child frameId: ${frameInfo.frameId}`);

    // Verify it's actually the child frame
    const { frameTree } = await cdp.send("Page.getFrameTree");
    const childFrameId = frameTree.childFrames[0].frame.id;
    expect(frameInfo.frameId).toBe(childFrameId);
  });

  test("returns null for non-iframe elements", async () => {
    const html = `<button id="test">Not an iframe</button>`;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();

    const buttonRef = snapshot.text.match(/Not an iframe.*\[ref=(e\d+)\]/)?.[1];
    expect(buttonRef).toBeDefined();

    const context = await (browser as any)._roleContexts.get("default");

    // GATE: Should return null for non-iframe
    const frameInfo = await (browser as any).resolveFrameFromRef(
      context,
      context.mainFrameId,
      buttonRef
    );

    expect(frameInfo).toBeNull();
    console.log("✓ Non-iframe returns null");
  });

  test("resolves empty iframe (about:blank)", async () => {
    // Test that even empty iframes can be resolved to frameIds
    const html = `
      <button>Main</button>
      <iframe src="about:blank"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);

    const snapshot = await browser.snapshot();
    const iframeRef = snapshot.text.match(/iframe.*\[ref=(e\d+)\]/)?.[1];
    expect(iframeRef).toBeDefined();

    const context = await (browser as any)._roleContexts.get("default");

    // GATE: Should resolve even empty iframes
    const frameInfo = await (browser as any).resolveFrameFromRef(
      context,
      context.mainFrameId,
      iframeRef!
    );

    expect(frameInfo).toBeDefined();
    expect(frameInfo?.frameId).toBeTruthy();
    expect(frameInfo?.frameId).not.toBe(context.mainFrameId);
    console.log("✓ Empty iframe resolved successfully");
  });
});
