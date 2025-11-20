## Phase 4: Frame Resolution (30 minutes)

**Risk**: ✅ **LOW** - Simple CDP usage, validated approach  
**Goal**: Map iframe element refs to child frameIds

---

## 🎯 Core Insight: Isolated Worlds Don't Matter for DOM Methods

**Key Understanding from Playwright:**

CDP's `DOM.describeNode` operates at the **document/DOM level**, not the execution context level. This means:

- ✅ An `objectId` from an **isolated world** works with `DOM.describeNode`
- ✅ An `objectId` from the **main world** works with `DOM.describeNode`  
- ✅ An `objectId` from a **utility context** works with `DOM.describeNode`

**Why?** `DOM.*` methods operate on the browser's DOM tree, which is shared across all execution contexts in a frame. Only `Runtime.*` methods (like `Runtime.callFunctionOn`) care about which execution context you're in.

**This means:** We can get the element's `objectId` directly from our isolated world bridge and pass it straight to `DOM.describeNode`. No attribute matching, no main world queries, no complexity!

### How Playwright Does It

From Playwright's Chromium implementation:

```typescript
async _getContentFrame(handle: ElementHandle): Promise<Frame | null> {
  const nodeInfo = await this._client.send('DOM.describeNode', {
    objectId: handle._objectId  // Direct usage!
  });
  if (!nodeInfo || typeof nodeInfo.node.frameId !== 'string')
    return null;
  return this._page.frameManager.frame(nodeInfo.node.frameId);
}
```

That's it. One CDP call. No world juggling needed.

---

## ⚠️ Pre-Implementation Investigation (REQUIRED)

**Verify that we can get objectIds from our isolated world bridge.**

### Investigation Test

Create `tests/objectid-investigation.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../src/runtime/MultiContextBrowser";

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
    
    const context = await (browser as any)._roleContexts.get("default");
    const bridgeObjectId = await context.bridgeInjector.getBridgeHandle(
      context.cdpSession,
      context.mainFrameId
    );
    
    console.log("\n=== INVESTIGATION: Get objectId from Bridge ===");
    
    // Try to get the iframe element's objectId from the bridge
    const { result } = await context.cdpSession.send('Runtime.callFunctionOn', {
      objectId: bridgeObjectId,
      functionDeclaration: `function(ref) {
        const info = this.getElementInfo ? this.getElementInfo(ref) : this.elements.get(ref);
        if (!info) return { found: false };
        
        // Try to return the element itself (will have objectId)
        return { found: true, hasElement: !!info.element };
      }`,
      arguments: [{ value: 'e2' }],  // Assuming iframe is e2
      returnByValue: true,
    });
    
    console.log("Bridge has element:", result.value?.found);
    console.log("Element property exists:", result.value?.hasElement);
    
    // Now try to get the element as a remote object (not by value)
    const { result: elemResult } = await context.cdpSession.send('Runtime.callFunctionOn', {
      objectId: bridgeObjectId,
      functionDeclaration: `function(ref) {
        const info = this.getElementInfo ? this.getElementInfo(ref) : this.elements.get(ref);
        return info ? info.element : null;
      }`,
      arguments: [{ value: 'e2' }],
      returnByValue: false,  // KEY: Get as remote object with objectId
    });
    
    console.log("Element objectId:", elemResult.objectId);
    expect(elemResult.objectId).toBeTruthy();
    
    // CRITICAL TEST: Does this isolated world objectId work with DOM.describeNode?
    const { node } = await context.cdpSession.send('DOM.describeNode', {
      objectId: elemResult.objectId,
      pierce: true,
    });
    
    console.log("DOM.describeNode succeeded:", !!node);
    console.log("node.frameId:", node.frameId);
    console.log("node.contentDocument?.frameId:", node.contentDocument?.frameId);
    
    const childFrameId = node.frameId || node.contentDocument?.frameId;
    expect(childFrameId).toBeTruthy();
    
    console.log("\n✅ INVESTIGATION PASSED:");
    console.log("  - Can get objectId from isolated world bridge");
    console.log("  - objectId works with DOM.describeNode across execution contexts");
    console.log("  - No need for attribute matching or main world queries!\n");
  });
});
```

### Run Investigation

```bash
npm test -- tests/objectid-investigation.spec.ts
```

### Decision Point ✅

- **Test PASSES** → Proceed with simple implementation (get objectId from bridge → DOM.describeNode)
- **Test FAILS** → The bridge doesn't expose element references properly. Need to:
  - Check if `ElementInfo` has the actual DOM element stored
  - Verify bridge is returning element references, not just metadata
  - Consider storing objectIds explicitly if elements aren't accessible

**Do not proceed to Step 4.1 until investigation test passes.**

---

### Step 4.1: Enable DOM Domain in BridgeInjector (Optional)

**File**: `src/runtime/BridgeInjector.ts`

**Note**: `DOM.describeNode` works without enabling the DOM domain, but enabling it is harmless and may be useful for debugging or future features.

Update the `setupAutoInjection()` method to enable DOM domain (around line 110):

```typescript
// 2) ENABLE DOMAINS
await cdp.send("Page.enable");
await cdp.send("Runtime.enable");
await cdp.send("DOM.enable");  // NEW - Optional but harmless
```

### Step 4.2: Add Frame Resolution Method

**File**: `src/runtime/MultiContextBrowser.ts`

**Key Insight**: CDP's `DOM.describeNode` works with `objectId`s from **any execution context** (isolated world, main world, utility context). We can get the element's `objectId` directly from our bridge and pass it straight to `DOM.describeNode`.

Add this method (after `isFrameDetachedError()`, around line 425):

```typescript
/**
 * Resolve an iframe element reference to its CDP frameId.
 * 
 * Uses CDP's DOM.describeNode to get the child frameId from an iframe element.
 * Works with objectIds from any execution context (isolated world, main world, etc.)
 * because DOM methods operate at the document level, not the execution context level.
 * 
 * This is the same approach Playwright uses in ElementHandle.contentFrame().
 */
private async resolveFrameFromRef(
  context: RoleContext,
  parentFrameId: string,
  iframeRef: string
): Promise<{ frameId: string } | null> {
  try {
    // Get bridge handle for the parent frame
    const bridgeObjectId = await context.bridgeInjector.getBridgeHandle(
      context.cdpSession,
      parentFrameId
    );

    // Get the iframe element's objectId from the isolated world bridge
    // KEY: returnByValue = false means we get a remote object with objectId
    const { result } = await context.cdpSession.send('Runtime.callFunctionOn', {
      objectId: bridgeObjectId,
      functionDeclaration: `function(ref) { 
        // Get the ElementInfo which contains the actual DOM element
        const info = this.elements.get(ref);
        if (!info) return null;
        
        // Verify it's an iframe
        if (info.tagName.toUpperCase() !== 'IFRAME') return null;
        
        // Return the element itself (will have objectId)
        return info.element;
      }`,
      arguments: [{ value: iframeRef }],
      returnByValue: false,  // CRITICAL: Get as remote object, not value
    });

    if (!result.objectId) {
      console.warn(`No objectId for iframe ref ${iframeRef}`);
      return null;
    }

    // Use the isolated world objectId directly with DOM.describeNode
    // This works because DOM methods operate at the document level, not execution context level
    const { node } = await context.cdpSession.send('DOM.describeNode', {
      objectId: result.objectId,
      pierce: true,  // Enables traversal into iframe's content document
    });

    // Get the child frameId from the node info
    // CDP returns either node.frameId or node.contentDocument.frameId depending on browser version
    const childFrameId = node.frameId || node.contentDocument?.frameId;
    
    if (!childFrameId) {
      console.warn(`Element ${iframeRef} has no associated frame (might be empty or not yet loaded)`);
      return null;
    }

    return { frameId: childFrameId };
    
  } catch (error: any) {
    // Handle cross-origin iframes gracefully
    if (error?.message?.includes('cross-origin') || 
        error?.message?.includes('Cannot find context')) {
      console.warn(`Iframe ${iframeRef} is cross-origin and cannot be accessed`);
      return null;
    }
    console.warn(`Failed to resolve frame from ref ${iframeRef}:`, error);
    return null;
  }
}
```

**Summary of the approach:**
1. Get bridge handle for parent frame (isolated world)
2. Call bridge method to get the element - returns remote object with `objectId`
3. Pass `objectId` directly to `DOM.describeNode` - works across execution contexts!
4. Extract child `frameId` from the result

**Why this is simple:** Only 2 CDP calls, no attribute matching, no world juggling!

### Step 4.3: Test Frame Resolution

Create `tests/frame-resolution.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../src/runtime/MultiContextBrowser";

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
    const { frameTree } = await cdp.send('Page.getFrameTree');
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
    console.log('✓ Non-iframe returns null');
  });

  test("handles cross-origin iframes gracefully", async () => {
    // Note: cross-origin iframes will return null due to security restrictions
    const html = `
      <iframe src="https://example.com"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    
    // Wait a bit for iframe to attempt loading
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const snapshot = await browser.snapshot();
    const iframeRef = snapshot.text.match(/iframe.*\[ref=(e\d+)\]/)?.[1];
    
    if (iframeRef) {
      const context = await (browser as any)._roleContexts.get("default");
      
      // Should return null for cross-origin
      const frameInfo = await (browser as any).resolveFrameFromRef(
        context,
        context.mainFrameId,
        iframeRef
      );
      
      // Cross-origin frames cannot be accessed
      expect(frameInfo).toBeNull();
      console.log('✓ Cross-origin iframe handled gracefully');
    }
  });
});
```

### Step 4.4: Rebuild Project

The `resolveFrameFromRef` method was added to the TypeScript source, so we need to rebuild:

```bash
npm run build
```

### Step 4.5: Run Tests

```bash
npm test -- tests/frame-resolution.spec.ts
npm test  # All tests should still pass
```

### Success Gate ✅

- **Can resolve iframe refs to frameIds** → Proceed to Phase 5
- **Returns null for non-iframes** → Expected behavior
- **Handles cross-origin gracefully** → Expected behavior
- **All existing tests still pass** → No regressions

**Time**: 30 minutes (simplified from 1 hour due to correct approach)  
**Output**: Can map element refs to frame IDs using direct objectId approach

---

## ✅ Why This Approach Works

### Comparison: Complex vs Simple

**❌ Original Attempt (Incorrect Assumption):**
```
Isolated World Bridge → Get Attributes → Query Main World → Get ObjectId → DOM.describeNode
                                    ↓
                           3 steps, attribute matching, fragile
```

**✅ Correct Approach (Playwright's Pattern):**
```
Isolated World Bridge → Get Element ObjectId → DOM.describeNode
                              ↓
                    2 steps, direct, reliable
```

### Key Learnings

1. **CDP's DOM methods are execution-context agnostic**: `DOM.describeNode`, `DOM.getBoxModel`, `DOM.getContentQuads`, etc. work with `objectId`s from **any** world (main, isolated, utility).

2. **Only Runtime methods care about contexts**: `Runtime.callFunctionOn`, `Runtime.evaluate`, and `Runtime.compileScript` require specific execution context IDs.

3. **Playwright uses this pattern everywhere**: Their `ElementHandle.contentFrame()` implementation passes `objectId` directly to `DOM.describeNode`, regardless of which world the handle came from.

4. **Simpler is better**: The attribute-matching approach added unnecessary complexity and failure modes. The direct approach is faster, more reliable, and matches industry best practices.

---

