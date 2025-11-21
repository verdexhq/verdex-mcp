import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../../src/runtime/MultiContextBrowser.js";

test.describe("ObjectId Investigation", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.initialize();
  });

  test.afterEach(async () => {
    await browser.close();
  });

  test("INVESTIGATE: can we get element objectId from isolated world bridge?", async () => {
    const html = `<iframe id="test" srcdoc="<button>Child</button>"></iframe>`;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);

    // First, get a snapshot to see what refs exist
    const snapshot = await browser.snapshot();
    console.log("\n=== SNAPSHOT ===");
    console.log(snapshot.text);
    console.log("\n=== INVESTIGATION: Get objectId from Bridge ===");

    // Extract the actual iframe ref from the snapshot
    const iframeRef = snapshot.text.match(/iframe.*\[ref=(e\d+)\]/)?.[1];
    console.log("Found iframe ref:", iframeRef);
    expect(iframeRef).toBeDefined();

    const context = await (browser as any)._roleContexts.get("default");
    const bridgeObjectId = await context.bridgeInjector.getBridgeHandle(
      context.cdpSession,
      context.mainFrameId
    );

    // Try to get the iframe element's objectId from the bridge
    const { result } = await context.cdpSession.send("Runtime.callFunctionOn", {
      objectId: bridgeObjectId,
      functionDeclaration: `function(ref) {
        const info = this.getElementInfo ? this.getElementInfo(ref) : this.elements.get(ref);
        if (!info) return { found: false };
        
        // Try to return the element itself (will have objectId)
        return { found: true, hasElement: !!info.element };
      }`,
      arguments: [{ value: iframeRef }],
      returnByValue: true,
    });

    console.log("Bridge has element:", result.value?.found);
    console.log("Element property exists:", result.value?.hasElement);

    // Now try to get the element as a remote object (not by value)
    const { result: elemResult } = await context.cdpSession.send(
      "Runtime.callFunctionOn",
      {
        objectId: bridgeObjectId,
        functionDeclaration: `function(ref) {
        const info = this.getElementInfo ? this.getElementInfo(ref) : this.elements.get(ref);
        return info ? info.element : null;
      }`,
        arguments: [{ value: iframeRef }],
        returnByValue: false, // KEY: Get as remote object with objectId
      }
    );

    console.log("Element objectId:", elemResult.objectId);
    expect(elemResult.objectId).toBeTruthy();

    // CRITICAL TEST: Does this isolated world objectId work with DOM.describeNode?
    const { node } = await context.cdpSession.send("DOM.describeNode", {
      objectId: elemResult.objectId,
      pierce: true,
    });

    console.log("DOM.describeNode succeeded:", !!node);
    console.log("node.frameId:", node.frameId);
    console.log(
      "node.contentDocument?.frameId:",
      node.contentDocument?.frameId
    );

    const childFrameId = node.frameId || node.contentDocument?.frameId;
    expect(childFrameId).toBeTruthy();

    console.log("\n✅ INVESTIGATION PASSED:");
    console.log("  - Can get objectId from isolated world bridge");
    console.log(
      "  - objectId works with DOM.describeNode across execution contexts"
    );
    console.log("  - No need for attribute matching or main world queries!\n");
  });
});
