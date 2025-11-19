import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../../src/runtime/MultiContextBrowser";

test.describe("CDP API Validation", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.initialize();
  });

  test.afterEach(async () => {
    await browser.close();
  });

  test("Test 1: createIsolatedWorld works with child frame IDs", async () => {
    const html = `<iframe id="test" srcdoc="<button>Child</button>"></iframe>`;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);

    const context = await (browser as any).ensureCurrentRoleContext();
    const cdp = context.cdpSession;

    // Get child frame ID
    const { frameTree } = await cdp.send("Page.getFrameTree");
    const childFrameId = frameTree.childFrames[0].frame.id;

    // GATE: Can we create isolated world in child frame?
    const result = await cdp.send("Page.createIsolatedWorld", {
      frameId: childFrameId,
      worldName: "test-world",
      grantUniveralAccess: false,
    });

    expect(result.executionContextId).toBeGreaterThan(0);
    console.log("✓ createIsolatedWorld works with child frames");
  });

  test("Test 2: DOM.describeNode returns frameId for iframe elements", async () => {
    const html = `<iframe id="test" srcdoc="<button>Child</button>"></iframe>`;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);

    const context = await (browser as any).ensureCurrentRoleContext();
    const page = context.page;
    const cdp = context.cdpSession;

    // Use CDP DOM methods to get the iframe element
    // First, get the document
    const { root } = await cdp.send("DOM.getDocument", { depth: -1 });

    // Query for the iframe element
    const { nodeId } = await cdp.send("DOM.querySelector", {
      nodeId: root.nodeId,
      selector: "iframe#test",
    });

    // Now describe the node with pierce: true to get frame information
    const { node } = await cdp.send("DOM.describeNode", {
      nodeId: nodeId,
      pierce: true,
    });

    // Debug: Log what CDP actually returns
    console.log("DOM.describeNode result for iframe:");
    console.log("  node.frameId:", node.frameId);
    console.log("  node.contentDocument:", node.contentDocument);
    if (node.contentDocument) {
      console.log(
        "  node.contentDocument.frameId:",
        node.contentDocument.frameId
      );
    }

    // GATE: Can we get the child frameId using either approach?
    const childFrameId = node.frameId || node.contentDocument?.frameId;
    expect(childFrameId).toBeDefined();
    expect(typeof childFrameId).toBe("string");

    // This resolves the CDP ambiguity
    if (node.frameId && !node.contentDocument?.frameId) {
      console.log("✓ Chrome populates node.frameId (primary approach works)");
    } else if (!node.frameId && node.contentDocument?.frameId) {
      console.log(
        "✓ Chrome populates node.contentDocument.frameId (fallback needed)"
      );
    } else if (node.frameId && node.contentDocument?.frameId) {
      console.log("✓ Chrome populates BOTH (either approach works)");
    }
  });

  test("Test 3: executionContextCreated fires with frameId", async () => {
    const html = `<iframe id="test" srcdoc="<button>Child</button>"></iframe>`;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);

    const context = await (browser as any).ensureCurrentRoleContext();
    const cdp = context.cdpSession;

    // Get child frame ID
    const { frameTree } = await cdp.send("Page.getFrameTree");
    const childFrameId = frameTree.childFrames[0].frame.id;

    // Listen for executionContextCreated
    let contextCreated = false;
    let receivedFrameId: string | undefined;

    const listener = (evt: any) => {
      const ctx = evt.context;
      if (ctx.auxData?.frameId === childFrameId) {
        contextCreated = true;
        receivedFrameId = ctx.auxData.frameId;
      }
    };

    cdp.on("Runtime.executionContextCreated", listener);

    // Create isolated world in child frame
    await cdp.send("Page.createIsolatedWorld", {
      frameId: childFrameId,
      worldName: "test-world-2",
      grantUniveralAccess: false,
    });

    // Wait a bit for event
    await new Promise((resolve) => setTimeout(resolve, 100));

    // GATE: Did the event fire with frameId?
    expect(contextCreated).toBe(true);
    expect(receivedFrameId).toBe(childFrameId);
    console.log("✓ executionContextCreated fires with correct frameId");

    cdp.off("Runtime.executionContextCreated", listener);
  });
});
