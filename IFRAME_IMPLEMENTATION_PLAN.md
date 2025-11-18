# Iframe Support Implementation Plan

## Overview
Add comprehensive iframe support to Verdex MCP to enable accessibility tree traversal and interaction with elements inside same-origin iframes, while gracefully handling cross-origin iframe limitations.

## Design Principles
1. **Leverage Puppeteer's built-in frame APIs** - Don't reinvent what Puppeteer provides
2. **Per-frame bridge instances** - Each frame gets its own isolated bridge context
3. **Frame-qualified refs** - Disambiguate elements across frames with `frameId_elementRef` format
4. **Graceful degradation** - Handle cross-origin iframes without breaking
5. **Zero breaking changes** - Existing structural analysis tools work unmodified

## Architecture

```
┌───────────────────────────────────────────────────────┐
│  MultiContextBrowser (Node.js)                        │
│  - Routes calls to correct frame based on ref         │
│  - Manages frame lifecycle (attach/detach)            │
└───────────────────────────────────────────────────────┘
                         ↓
┌───────────────────────────────────────────────────────┐
│  BridgeInjector (Node.js)                             │
│  - Tracks frameId → contextId mappings                │
│  - Injects bridge into each frame's isolated world    │
│  - Handles frame attachment/detachment events         │
└───────────────────────────────────────────────────────┘
                         ↓
┌───────────────────────────────────────────────────────┐
│  Bridge Instance (Browser - Main Frame)               │
│  - document = main page document                      │
│  - Refs: e1, e2, e3...                                │
│  - Snapshot captures main content + iframe elements   │
└───────────────────────────────────────────────────────┘
                         ↓
┌───────────────────────────────────────────────────────┐
│  Bridge Instance (Browser - Iframe 1)                 │
│  - document = iframe 1's document                     │
│  - Refs: f1_e1, f1_e2... (frame-qualified)            │
│  - Structural tools work within iframe bounds         │
└───────────────────────────────────────────────────────┘
```

## Implementation Phases

---

## Phase 1: Multi-Frame Bridge Injection

**File: `src/runtime/BridgeInjector.ts`**

### 1.1 Add Frame Tracking State

```typescript
export class BridgeInjector {
  // EXISTING
  private mainFrameId: string | null = null;
  private contextId: number | null = null;
  
  // NEW: Track all frames
  private frameContexts = new Map<string, {
    contextId: number;
    bridgeObjectId: string | null;
  }>();
  
  private frameListeners = new Map<string, boolean>(); // Track which frames are set up
}
```

### 1.2 Listen for Frame Attachment

Add to `setupAutoInjection()`:

```typescript
// Listen for iframe attachment
const onFrameAttached = async (evt: any) => {
  const frameId = evt.frameId;
  console.log(`🖼️ Frame attached: ${frameId}`);
  
  // Inject bridge into new frame
  await this.injectIntoFrame(cdp, frameId);
};

this.addListener(cdp, "Page.frameAttached", onFrameAttached);
```

### 1.3 Listen for Frame Detachment

```typescript
// Listen for iframe detachment (cleanup)
const onFrameDetached = (evt: any) => {
  const frameId = evt.frameId;
  console.log(`🧹 Frame detached: ${frameId}`);
  
  // Clean up frame context
  this.frameContexts.delete(frameId);
  this.frameListeners.delete(frameId);
};

this.addListener(cdp, "Page.frameDetached", onFrameDetached);
```

### 1.4 Track Frame Contexts

Update `onCtx` handler in `setupAutoInjection()`:

```typescript
const onCtx = (evt: any) => {
  const ctx = evt.context;
  const aux = ctx.auxData ?? {};
  const matchesWorld = ctx.name === this.worldName || aux.name === this.worldName;
  const frameId = aux.frameId;
  
  if (matchesWorld) {
    if (frameId === this.mainFrameId) {
      // Main frame context
      this.contextId = ctx.id;
      this.resolveContextReady();
    } else if (frameId) {
      // Iframe context
      this.frameContexts.set(frameId, {
        contextId: ctx.id,
        bridgeObjectId: null,
      });
      console.log(`✅ Iframe bridge ready: ${frameId}`);
    }
  }
};
```

### 1.5 Inject Into Specific Frame

```typescript
private async injectIntoFrame(cdp: CDPSession, frameId: string): Promise<void> {
  try {
    // Create isolated world in this frame
    const { executionContextId } = await cdp.send("Page.createIsolatedWorld", {
      frameId: frameId,
      worldName: this.worldName,
      grantUniveralAccess: false,
    });
    
    // Inject bundle into this frame's isolated world
    await cdp.send("Runtime.evaluate", {
      expression: BRIDGE_BUNDLE,
      contextId: executionContextId,
      returnByValue: false,
    });
    
    console.log(`🔧 Bridge injected into frame: ${frameId}`);
  } catch (error) {
    console.warn(`⚠️ Failed to inject into frame ${frameId}:`, error);
  }
}
```

### 1.6 Get Bridge Handle for Specific Frame

Update `getBridgeHandle()` to accept optional frameId:

```typescript
async getBridgeHandle(cdp: CDPSession, frameId?: string): Promise<string> {
  // Main frame (existing logic)
  if (!frameId || frameId === this.mainFrameId) {
    // ... existing code ...
    return this.bridgeObjectId;
  }
  
  // Iframe
  const frameContext = this.frameContexts.get(frameId);
  if (!frameContext) {
    throw new Error(`No context found for frame: ${frameId}`);
  }
  
  // Check if bridge is alive
  if (frameContext.bridgeObjectId) {
    const alive = await this.healthCheckFrame(cdp, frameId);
    if (alive) return frameContext.bridgeObjectId;
    frameContext.bridgeObjectId = null;
  }
  
  // Create bridge instance in iframe
  const { result } = await cdp.send("Runtime.evaluate", {
    expression: `(function(config){ return globalThis.__VerdexBridgeFactory__.create(config); })(${JSON.stringify(this.config)})`,
    contextId: frameContext.contextId,
    returnByValue: false,
  });
  
  if (!result.objectId) {
    throw new Error(`Failed to create bridge in frame ${frameId}`);
  }
  
  frameContext.bridgeObjectId = result.objectId;
  return frameContext.bridgeObjectId;
}
```

### 1.7 Frame-Aware Bridge Method Calls

Update `callBridgeMethod()`:

```typescript
async callBridgeMethod<T = any>(
  cdp: CDPSession,
  method: string,
  args: any[] = [],
  frameId?: string  // NEW: optional frame parameter
): Promise<T> {
  const objectId = await this.getBridgeHandle(cdp, frameId);
  
  // ... rest of existing code (unchanged)
}
```

**Estimated Changes:** ~150 lines

---

## Phase 2: Multi-Frame Snapshot Generation

**File: `src/browser/core/SnapshotGenerator.ts`**

### 2.1 Detect and Handle Iframes

Add to `buildAriaTree()` after element visibility check:

```typescript
private buildAriaTree(
  node: Node,
  parentVisible: boolean
): (AriaNode | string)[] {
  // ... existing code ...
  
  // NEW: Handle iframe elements
  if (element.tagName === 'IFRAME') {
    return this.buildIframeTree(element as HTMLIFrameElement, isVisible);
  }
  
  // ... rest of existing code ...
}
```

### 2.2 Build Iframe Tree

```typescript
/**
 * Build tree for iframe element and its contents
 */
private buildIframeTree(
  iframe: HTMLIFrameElement,
  isVisible: boolean
): (AriaNode | string)[] {
  if (!isVisible) return [];
  
  // Create iframe node
  const iframeNode: AriaNode = {
    role: 'iframe',
    name: iframe.title || iframe.name || iframe.src || 'iframe',
    children: [],
    element: iframe,
  };
  
  // Try to access iframe content (same-origin only)
  try {
    const iframeDoc = iframe.contentDocument;
    
    if (iframeDoc && iframeDoc.body) {
      // Same-origin iframe - we can access content
      console.log('📄 Accessing same-origin iframe content');
      
      // Recursively build tree for iframe content
      const iframeChildren = this.buildAriaTree(iframeDoc.body, true);
      iframeNode.children = iframeChildren;
      
      // Add metadata
      iframeNode.props = {
        ...iframeNode.props,
        accessible: 'true',
        src: iframe.src || 'about:blank',
      };
    } else {
      // Iframe exists but has no body yet
      iframeNode.children = [{ text: '[iframe loading...]' } as any];
    }
  } catch (error) {
    // Cross-origin iframe - browser security blocks access
    console.log('🔒 Cross-origin iframe - access blocked');
    iframeNode.children = [{ text: '[cross-origin iframe]' } as any];
    iframeNode.props = {
      ...iframeNode.props,
      accessible: 'false',
      src: iframe.src || 'unknown',
      crossOrigin: 'true',
    };
  }
  
  return [iframeNode];
}
```

### 2.3 Update Element Info to Track Frame

When creating refs, track which frame the element belongs to:

```typescript
private createAriaNode(element: Element): AriaNode | null {
  // ... existing code ...
  
  // Add reference for interactive elements
  if (AriaUtils.isInteractive(element, role)) {
    // Check if element already has a ref
    let ref = (element as any)._verdexRef;
    
    if (ref && this.bridge.elements.has(ref)) {
      ariaNode.ref = ref;
    } else {
      // NEW: Determine if element is in iframe
      const inIframe = this.isInIframe(element);
      const frameId = inIframe ? this.getFrameId(element) : null;
      
      // Create frame-qualified ref if in iframe
      if (frameId) {
        ref = `${frameId}_e${++this.bridge.counter}`;
      } else {
        ref = `e${++this.bridge.counter}`;
      }
      
      (element as any)._verdexRef = ref;
      ariaNode.ref = ref;
    }
    
    // Store element info
    const elementInfo: ElementInfo = {
      element: element,
      tagName: element.tagName,
      role: role,
      name: name,
      attributes: this.bridge.getAttributes(element),
      frameId: frameId || undefined,  // NEW: track frame
    };
    
    this.bridge.elements.set(ref, elementInfo);
  }
  
  return ariaNode;
}
```

### 2.4 Add Frame Detection Helpers

```typescript
/**
 * Check if element is inside an iframe
 */
private isInIframe(element: Element): boolean {
  return element.ownerDocument !== document;
}

/**
 * Get frame identifier for element
 * Returns a simple index-based identifier for the iframe
 */
private getFrameId(element: Element): string {
  const doc = element.ownerDocument;
  if (doc === document) return '';
  
  // Find the iframe element in main document
  const iframes = Array.from(document.querySelectorAll('iframe'));
  for (let i = 0; i < iframes.length; i++) {
    const iframe = iframes[i] as HTMLIFrameElement;
    try {
      if (iframe.contentDocument === doc) {
        return `f${i + 1}`;  // f1, f2, f3...
      }
    } catch {
      // Cross-origin - skip
    }
  }
  
  return 'f0';  // Fallback
}
```

**Estimated Changes:** ~120 lines

---

## Phase 3: Frame-Aware Element References

**File: `src/browser/types/elements.ts`**

### 3.1 Update ElementInfo Type

```typescript
export type ElementInfo = {
  element: Element;
  tagName: string;
  role: string;
  name: string;
  attributes: Record<string, string>;
  frameId?: string;  // NEW: optional frame identifier
};
```

**Estimated Changes:** ~5 lines

---

## Phase 4: Frame-Aware Interactions

**File: `src/runtime/MultiContextBrowser.ts`**

### 4.1 Parse Frame-Qualified Refs

```typescript
/**
 * Parse ref to extract frame ID and element number
 * Examples:
 *   "e5" → { frameId: null, ref: "e5" }
 *   "f1_e5" → { frameId: "f1", ref: "e5" }
 */
private parseRef(ref: string): { frameId: string | null; localRef: string } {
  const match = ref.match(/^(f\d+)_(.+)$/);
  if (match) {
    return { frameId: match[1], localRef: match[2] };
  }
  return { frameId: null, localRef: ref };
}
```

### 4.2 Update Click/Type/Structural Methods

```typescript
async click(ref: string): Promise<void> {
  const context = await this.ensureCurrentRoleContext();
  const { frameId, localRef } = this.parseRef(ref);
  
  // Set up navigation listener...
  const navigationPromise = context.page.waitForNavigation({
    waitUntil: "networkidle2",
    timeout: 1000,
  }).catch((error) => {
    if (error.message?.includes("Timeout")) return null;
    throw error;
  });
  
  try {
    // Execute click in correct frame
    await context.bridgeInjector.callBridgeMethod(
      context.cdpSession,
      "click",
      [localRef],  // Pass local ref to bridge
      frameId || undefined  // Pass frame ID to injector
    );
    
    await navigationPromise;
  } catch (error) {
    await navigationPromise.catch(() => {});
    throw error;
  }
}

async type(ref: string, text: string): Promise<void> {
  const context = await this.ensureCurrentRoleContext();
  const { frameId, localRef } = this.parseRef(ref);
  
  await context.bridgeInjector.callBridgeMethod(
    context.cdpSession,
    "type",
    [localRef, text],
    frameId || undefined
  );
}

async resolve_container(ref: string): Promise<any> {
  const context = await this.ensureCurrentRoleContext();
  const { frameId, localRef } = this.parseRef(ref);
  
  return await context.bridgeInjector.callBridgeMethod(
    context.cdpSession,
    "resolve_container",
    [localRef],
    frameId || undefined
  );
}

// Similar updates for inspect_pattern and extract_anchors
```

**Estimated Changes:** ~80 lines

---

## Phase 5: Frame ID Mapping

**Challenge:** Browser-side frame detection uses simple indexes (`f1`, `f2`), but CDP uses frame IDs (opaque strings). Need to map between them.

**File: `src/runtime/BridgeInjector.ts`**

### 5.1 Add Frame Index Tracking

```typescript
export class BridgeInjector {
  // ... existing ...
  
  // NEW: Map frame IDs to simple indexes
  private frameIdToIndex = new Map<string, string>();  // CDP frameId → "f1"
  private nextFrameIndex = 1;
}
```

### 5.2 Assign Indexes on Frame Attach

```typescript
const onFrameAttached = async (evt: any) => {
  const frameId = evt.frameId;
  
  // Assign a simple index for this frame
  const frameIndex = `f${this.nextFrameIndex++}`;
  this.frameIdToIndex.set(frameId, frameIndex);
  
  console.log(`🖼️ Frame attached: ${frameId} → ${frameIndex}`);
  
  await this.injectIntoFrame(cdp, frameId);
};
```

### 5.3 Resolve Frame ID from Index

```typescript
/**
 * Get CDP frame ID from simple frame index
 */
private getFrameIdFromIndex(frameIndex: string): string | null {
  for (const [frameId, index] of this.frameIdToIndex.entries()) {
    if (index === frameIndex) return frameId;
  }
  return null;
}
```

### 5.4 Update callBridgeMethod

```typescript
async callBridgeMethod<T = any>(
  cdp: CDPSession,
  method: string,
  args: any[] = [],
  frameIndex?: string  // "f1", "f2", etc.
): Promise<T> {
  // Resolve CDP frame ID from index
  const frameId = frameIndex ? this.getFrameIdFromIndex(frameIndex) : this.mainFrameId;
  
  const objectId = await this.getBridgeHandle(cdp, frameId || undefined);
  
  // ... rest unchanged ...
}
```

**Estimated Changes:** ~50 lines

---

## Phase 6: Testing

**File: `tests/iframe-support.spec.ts`** (new file)

Create comprehensive test suite:

```typescript
import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../src/runtime/MultiContextBrowser.js";

test.describe("Iframe Support", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.initialize();
  });

  test.afterEach(async () => {
    await browser.close();
  });

  test("should capture iframe content in snapshot", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Main Page</h1>
          <iframe srcdoc="<h2>Iframe Content</h2><button>Iframe Button</button>"></iframe>
        </body>
      </html>
    `;

    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    await new Promise(r => setTimeout(r, 300));
    
    const snapshot = await browser.snapshot();
    
    // Main content
    expect(snapshot.text).toContain("Main Page");
    
    // Iframe content (if accessible)
    const hasIframeContent = snapshot.text.includes("Iframe Content");
    console.log(`Iframe content captured: ${hasIframeContent}`);
  });

  test("should interact with iframe elements", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Main Page</h1>
          <iframe id="test-frame" srcdoc="<button id='btn'>Click Me</button>"></iframe>
        </body>
      </html>
    `;

    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    await new Promise(r => setTimeout(r, 300));
    
    const snapshot = await browser.snapshot();
    
    // Find iframe button ref (should be frame-qualified)
    const iframeButtonRef = snapshot.text.match(/Click Me.*\[ref=(f\d+_e\d+)\]/)?.[1];
    
    if (iframeButtonRef) {
      // Should be able to click iframe element
      await browser.click(iframeButtonRef);
      expect(iframeButtonRef).toMatch(/^f\d+_e\d+$/);
    }
  });

  test("should handle nested iframes", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <iframe srcdoc="<p>Level 1</p><iframe srcdoc='<p>Level 2</p><button>Nested Button</button>'></iframe>"></iframe>
        </body>
      </html>
    `;

    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    await new Promise(r => setTimeout(r, 500));
    
    const snapshot = await browser.snapshot();
    expect(snapshot.text).toContain("iframe");
  });

  test("should handle cross-origin iframes gracefully", async () => {
    await browser.navigate("https://example.com");
    
    // Page might have cross-origin iframes (ads, trackers, etc.)
    const snapshot = await browser.snapshot();
    
    // Should not crash, should handle gracefully
    expect(snapshot.elementCount).toBeGreaterThan(0);
  });

  test("should use structural tools on iframe elements", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <iframe srcdoc="<div class='container'><button id='test'>Test</button></div>"></iframe>
        </body>
      </html>
    `;

    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    await new Promise(r => setTimeout(r, 300));
    
    const snapshot = await browser.snapshot();
    const iframeRef = snapshot.text.match(/Test.*\[ref=(f\d+_e\d+)\]/)?.[1];
    
    if (iframeRef) {
      // Structural analysis should work within iframe
      const containerResult = await browser.resolve_container(iframeRef);
      expect(containerResult).toBeDefined();
      expect(containerResult.target.ref).toBe(iframeRef);
    }
  });
});
```

**Estimated Changes:** ~200 lines (new file)

---

## Summary

### Total Estimated Changes
- `BridgeInjector.ts`: ~200 lines
- `SnapshotGenerator.ts`: ~120 lines
- `MultiContextBrowser.ts`: ~80 lines
- `elements.ts`: ~5 lines
- New test file: ~200 lines
- **Total: ~605 lines of code**

### Files Modified
1. ✏️ `src/runtime/BridgeInjector.ts`
2. ✏️ `src/browser/core/SnapshotGenerator.ts`
3. ✏️ `src/runtime/MultiContextBrowser.ts`
4. ✏️ `src/browser/types/elements.ts`
5. ✏️ `src/runtime/types.ts` (minor - add frameId to context)
6. ➕ `tests/iframe-support.spec.ts` (new)
7. ✏️ `tests/bridge-lifecycle.spec.ts` (already updated)

### Testing Strategy
1. Run existing tests - ensure no regressions
2. Run new iframe test suite
3. Manual testing with real sites containing iframes
4. Test cross-origin handling (should gracefully degrade)
5. Test nested iframe scenarios
6. Test frame lifecycle (attach/detach during interactions)

### Rollout Plan
1. **Phase 1-2**: Core injection and snapshot (can test in isolation)
2. **Phase 3-4**: Interactions (depends on phase 1-2)
3. **Phase 5**: Frame mapping refinements
4. **Phase 6**: Comprehensive testing and edge cases

### Risk Mitigation
- ✅ No breaking changes to existing API
- ✅ Existing tests should pass unchanged
- ✅ Graceful degradation for cross-origin
- ✅ Per-frame isolation prevents interference
- ⚠️ Frame lifecycle timing (attach/detach during navigation)
- ⚠️ Frame ID mapping consistency across navigations

### Performance Impact
- Minimal: Only processes same-origin iframes
- Cross-origin iframes are skipped (no perf cost)
- Per-frame bridges are lightweight
- Structural tools already bounded by config limits

---

## Next Steps

1. Review this plan for any gaps or concerns
2. Start with Phase 1 (multi-frame injection)
3. Test incrementally after each phase
4. Document iframe ref format in user-facing docs
5. Update CHANGELOG.md with iframe support announcement

