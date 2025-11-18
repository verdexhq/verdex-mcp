# Iframe Support Implementation Plan

## Overview
Add iframe support to Verdex MCP to enable accessibility tree traversal and interaction with elements inside same-origin iframes, while gracefully handling cross-origin iframe limitations.

## Design Principles
1. **Leverage DOM APIs** - Use `iframe.contentDocument` for same-origin iframe access
2. **Single bridge instance** - Main frame bridge handles all elements including iframe elements
3. **Frame-qualified refs** - Disambiguate elements across frames with `frameId_elementRef` format
4. **Graceful degradation** - Handle cross-origin iframes without breaking
5. **Zero breaking changes** - Existing structural analysis tools work unmodified

## Architecture

```
┌───────────────────────────────────────────────────────┐
│  MultiContextBrowser (Node.js)                        │
│  - Parses frame-qualified refs (f1_e5)                │
│  - Routes all calls to main bridge                    │
└───────────────────────────────────────────────────────┘
                         ↓
┌───────────────────────────────────────────────────────┐
│  BridgeInjector (Node.js)                             │
│  - Injects bridge into main frame only                │
│  - No changes needed                                  │
└───────────────────────────────────────────────────────┘
                         ↓
┌───────────────────────────────────────────────────────┐
│  Bridge Instance (Browser - Main Frame)               │
│  - Traverses main document + iframe documents         │
│  - Uses iframe.contentDocument for same-origin access │
│  - Stores all element refs in single Map              │
│  - Main refs: e1, e2, e3...                           │
│  - Iframe refs: f1_e1, f1_e2, f2_e1...                │
└───────────────────────────────────────────────────────┘
```

## Key Insight

For same-origin iframes, `iframe.contentDocument` provides direct DOM access from the main frame. This means:
- ✅ No need for per-frame bridge injection
- ✅ No CDP frame lifecycle management
- ✅ `element.click()` works on iframe elements
- ✅ DOM traversal (`parentElement`) works naturally
- ✅ Single `elements` Map stores everything

## Implementation Phases

---

## Phase 1: Snapshot Generation with Iframe Support

**File: `src/browser/core/SnapshotGenerator.ts`**

### 1.1 Detect and Handle Iframes

Add to `buildAriaTree()` before creating AriaNode:

```typescript
private buildAriaTree(
  node: Node,
  parentVisible: boolean
): (AriaNode | string)[] {
  // ... existing code ...
  
  if (node.nodeType !== Node.ELEMENT_NODE) return [];
  const element = node as Element;
  const isVisible = AriaUtils.isVisibleForAria(element);
  
  if (!isVisible) {
    return this.buildChildrenTree(element, false);
  }
  
  // NEW: Handle iframe elements specially
  if (element.tagName === 'IFRAME') {
    return this.buildIframeTree(element as HTMLIFrameElement, isVisible);
  }
  
  // ... rest of existing code ...
}
```

### 1.2 Build Iframe Tree

```typescript
/**
 * Build tree for iframe element and its contents
 */
private buildIframeTree(
  iframe: HTMLIFrameElement,
  isVisible: boolean
): (AriaNode | string)[] {
  if (!isVisible) return [];
  
  // Create iframe container node
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
      // Same-origin iframe - recursively build tree
      const iframeChildren = this.buildAriaTree(iframeDoc.body, true);
      iframeNode.children = iframeChildren;
      
      // Add metadata
      iframeNode.props = {
        ...iframeNode.props,
        accessible: 'true',
        src: iframe.src || 'about:blank',
      };
    } else {
      // Iframe exists but body not ready yet
      iframeNode.children = [{ text: '[iframe loading...]' } as any];
    }
  } catch (error) {
    // Cross-origin iframe - browser security blocks access
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

### 1.3 Track Frame in Element Refs

Update `createAriaNode()` to generate frame-qualified refs:

```typescript
private createAriaNode(element: Element): AriaNode | null {
  // ... existing code to get role, name, etc. ...
  
  // Add reference for interactive elements
  if (AriaUtils.isInteractive(element, role)) {
    let ref = (element as any)._verdexRef;
    
    if (ref && this.bridge.elements.has(ref)) {
      ariaNode.ref = ref;
    } else {
      // Determine if element is in iframe
      const frameId = this.getFrameId(element);
      
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
      frameId: frameId || undefined,
    };
    
    this.bridge.elements.set(ref, elementInfo);
  }
  
  return ariaNode;
}
```

### 1.4 Frame Detection Helpers

```typescript
/**
 * Get frame identifier for element
 * Returns simple index-based identifier (f1, f2, f3...)
 */
private getFrameId(element: Element): string {
  const doc = element.ownerDocument;
  
  // Element in main document
  if (doc === document) {
    return '';
  }
  
  // Element in iframe - find which one
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
  
  // Fallback for nested iframes or edge cases
  return 'f0';
}
```

### 1.5 Update ElementInfo Type

**File: `src/browser/types/elements.ts`**

```typescript
export type ElementInfo = {
  element: Element;
  tagName: string;
  role: string;
  name: string;
  attributes: Record<string, string>;
  frameId?: string;  // NEW: track which frame element is in
};
```

**Estimated Changes:** ~130 lines total across SnapshotGenerator.ts and elements.ts

---

## Phase 2: Frame-Aware Ref Parsing

**File: `src/runtime/MultiContextBrowser.ts`**

### 2.1 Add Ref Parser

```typescript
/**
 * Parse ref to extract frame ID
 * Examples:
 *   "e5" → { frameId: null, ref: "e5" }
 *   "f1_e5" → { frameId: "f1", ref: "f1_e5" }
 */
private parseRef(ref: string): { frameId: string | null; fullRef: string } {
  const match = ref.match(/^(f\d+)_/);
  if (match) {
    return { frameId: match[1], fullRef: ref };
  }
  return { frameId: null, fullRef: ref };
}
```

### 2.2 Update Interaction Methods

The bridge handles iframe elements automatically - just pass the ref:

```typescript
async click(ref: string): Promise<void> {
  const context = await this.ensureCurrentRoleContext();
  
  // Parse ref (for future frame-specific optimizations)
  const { fullRef } = this.parseRef(ref);
  
  const navigationPromise = context.page.waitForNavigation({
    waitUntil: "networkidle2",
    timeout: 1000,
  }).catch((error) => {
    if (error.message?.includes("Timeout")) return null;
    throw error;
  });
  
  try {
    // Bridge handles all refs including iframe elements
    await context.bridgeInjector.callBridgeMethod(
      context.cdpSession,
      "click",
      [fullRef]
    );
    
    await navigationPromise;
  } catch (error) {
    await navigationPromise.catch(() => {});
    throw error;
  }
}

async type(ref: string, text: string): Promise<void> {
  const context = await this.ensureCurrentRoleContext();
  const { fullRef } = this.parseRef(ref);
  
  await context.bridgeInjector.callBridgeMethod(
    context.cdpSession,
    "type",
    [fullRef, text]
  );
}

async resolve_container(ref: string): Promise<any> {
  const context = await this.ensureCurrentRoleContext();
  const { fullRef } = this.parseRef(ref);
  
  return await context.bridgeInjector.callBridgeMethod(
    context.cdpSession,
    "resolve_container",
    [fullRef]
  );
}

async inspect_pattern(ref: string, ancestorLevel: number): Promise<any> {
  const context = await this.ensureCurrentRoleContext();
  const { fullRef } = this.parseRef(ref);
  
  return await context.bridgeInjector.callBridgeMethod(
    context.cdpSession,
    "inspect_pattern",
    [fullRef, ancestorLevel]
  );
}

async extract_anchors(ref: string, ancestorLevel: number): Promise<any> {
  const context = await this.ensureCurrentRoleContext();
  const { fullRef } = this.parseRef(ref);
  
  return await context.bridgeInjector.callBridgeMethod(
    context.cdpSession,
    "extract_anchors",
    [fullRef, ancestorLevel]
  );
}
```

**Estimated Changes:** ~40 lines

---

## Phase 3: Testing

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
          <button>Main Button</button>
          <iframe srcdoc="<h2>Iframe Content</h2><button>Iframe Button</button>"></iframe>
        </body>
      </html>
    `;

    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    await new Promise(r => setTimeout(r, 300));
    
    const snapshot = await browser.snapshot();
    
    expect(snapshot.text).toContain("Main Page");
    expect(snapshot.text).toContain("Main Button");
    expect(snapshot.text).toContain("iframe");
    expect(snapshot.text).toContain("Iframe Content");
    expect(snapshot.text).toContain("Iframe Button");
  });

  test("should generate frame-qualified refs for iframe elements", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <button>Main Button</button>
          <iframe srcdoc="<button>Iframe Button</button>"></iframe>
        </body>
      </html>
    `;

    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    await new Promise(r => setTimeout(r, 300));
    
    const snapshot = await browser.snapshot();
    
    // Main button should have simple ref
    const mainRef = snapshot.text.match(/Main Button.*\[ref=(e\d+)\]/)?.[1];
    expect(mainRef).toMatch(/^e\d+$/);
    
    // Iframe button should have frame-qualified ref
    const iframeRef = snapshot.text.match(/Iframe Button.*\[ref=(f\d+_e\d+)\]/)?.[1];
    expect(iframeRef).toMatch(/^f\d+_e\d+$/);
  });

  test("should interact with iframe elements", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Main Page</h1>
          <iframe id="test-frame" srcdoc="<button id='btn' onclick='this.textContent=&quot;Clicked&quot;'>Click Me</button>"></iframe>
        </body>
      </html>
    `;

    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    await new Promise(r => setTimeout(r, 300));
    
    const snapshot = await browser.snapshot();
    const iframeButtonRef = snapshot.text.match(/Click Me.*\[ref=(f\d+_e\d+)\]/)?.[1];
    
    expect(iframeButtonRef).toBeTruthy();
    
    // Should be able to click iframe element
    await browser.click(iframeButtonRef!);
    
    const snapshot2 = await browser.snapshot();
    expect(snapshot2.text).toContain("Clicked");
  });

  test("should type into iframe input elements", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <iframe srcdoc="<input type='text' placeholder='Type here' />"></iframe>
        </body>
      </html>
    `;

    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    await new Promise(r => setTimeout(r, 300));
    
    const snapshot = await browser.snapshot();
    const inputRef = snapshot.text.match(/textbox.*\[ref=(f\d+_e\d+)\]/)?.[1];
    
    if (inputRef) {
      await browser.type(inputRef, "Hello from iframe");
      
      const snapshot2 = await browser.snapshot();
      expect(snapshot2.text).toContain("Hello from iframe");
    }
  });

  test("should handle nested iframes", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Main</h1>
          <iframe srcdoc="<p>Level 1</p><iframe srcdoc='<p>Level 2</p><button>Nested Button</button>'></iframe>"></iframe>
        </body>
      </html>
    `;

    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    await new Promise(r => setTimeout(r, 500));
    
    const snapshot = await browser.snapshot();
    
    expect(snapshot.text).toContain("Main");
    expect(snapshot.text).toContain("Level 1");
    expect(snapshot.text).toContain("Level 2");
    expect(snapshot.text).toContain("Nested Button");
  });

  test("should handle cross-origin iframes gracefully", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Main Page</h1>
          <iframe src="https://example.com"></iframe>
        </body>
      </html>
    `;

    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    await new Promise(r => setTimeout(r, 500));
    
    const snapshot = await browser.snapshot();
    
    // Should not crash
    expect(snapshot.text).toContain("Main Page");
    expect(snapshot.text).toContain("iframe");
    expect(snapshot.text).toContain("[cross-origin iframe]");
  });

  test("should use structural tools on iframe elements", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <iframe srcdoc="<div class='container' id='wrapper'><button id='test'>Test Button</button></div>"></iframe>
        </body>
      </html>
    `;

    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    await new Promise(r => setTimeout(r, 300));
    
    const snapshot = await browser.snapshot();
    const iframeRef = snapshot.text.match(/Test Button.*\[ref=(f\d+_e\d+)\]/)?.[1];
    
    if (iframeRef) {
      // resolve_container should work within iframe
      const containerResult = await browser.resolve_container(iframeRef);
      expect(containerResult).toBeDefined();
      expect(containerResult.target.ref).toBe(iframeRef);
      expect(containerResult.ancestors.length).toBeGreaterThan(0);
      
      // inspect_pattern should work
      const patternResult = await browser.inspect_pattern(iframeRef, 1);
      expect(patternResult).toBeDefined();
      
      // extract_anchors should work
      const anchorsResult = await browser.extract_anchors(iframeRef, 1);
      expect(anchorsResult).toBeDefined();
    }
  });

  test("should handle multiple iframes on same page", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <iframe srcdoc="<button>Frame 1 Button</button>"></iframe>
          <iframe srcdoc="<button>Frame 2 Button</button>"></iframe>
          <iframe srcdoc="<button>Frame 3 Button</button>"></iframe>
        </body>
      </html>
    `;

    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    await new Promise(r => setTimeout(r, 300));
    
    const snapshot = await browser.snapshot();
    
    // Should see all three frames
    expect(snapshot.text).toContain("Frame 1 Button");
    expect(snapshot.text).toContain("Frame 2 Button");
    expect(snapshot.text).toContain("Frame 3 Button");
    
    // Refs should be distinct
    const ref1 = snapshot.text.match(/Frame 1 Button.*\[ref=(f\d+_e\d+)\]/)?.[1];
    const ref2 = snapshot.text.match(/Frame 2 Button.*\[ref=(f\d+_e\d+)\]/)?.[1];
    const ref3 = snapshot.text.match(/Frame 3 Button.*\[ref=(f\d+_e\d+)\]/)?.[1];
    
    expect(ref1).toBeTruthy();
    expect(ref2).toBeTruthy();
    expect(ref3).toBeTruthy();
    expect(ref1).not.toBe(ref2);
    expect(ref2).not.toBe(ref3);
  });
});
```

**Estimated Changes:** ~220 lines (new file)

---

## Summary

### Total Estimated Changes
- `SnapshotGenerator.ts`: ~120 lines
- `elements.ts`: ~5 lines  
- `MultiContextBrowser.ts`: ~40 lines
- New test file: ~220 lines
- **Total: ~385 lines of code**

### Files Modified
1. ✏️ `src/browser/core/SnapshotGenerator.ts`
2. ✏️ `src/browser/types/elements.ts`
3. ✏️ `src/runtime/MultiContextBrowser.ts`
4. ➕ `tests/iframe-support.spec.ts` (new)
5. ✏️ `tests/bridge-lifecycle.spec.ts` (already updated)

### Testing Strategy
1. Run existing tests - ensure no regressions
2. Run new iframe test suite
3. Manual testing with real sites containing iframes
4. Test cross-origin handling (graceful degradation)
5. Test nested iframe scenarios
6. Test multiple iframes on same page

### Rollout Plan
1. **Phase 1**: Snapshot generation with iframe traversal
2. **Phase 2**: Ref parsing and interaction routing
3. **Phase 3**: Comprehensive testing

### Why This Approach Works

**Same-Origin Iframes (99% of use cases):**
- ✅ `iframe.contentDocument` provides full DOM access
- ✅ All interactions work through main bridge
- ✅ Structural analysis tools work unchanged
- ✅ Simple and maintainable

**Cross-Origin Iframes:**
- ✅ Gracefully handled with `[cross-origin iframe]` marker
- ✅ No crashes or errors
- ✅ Expected behavior (browser security blocks access)

### Performance Impact
- Minimal: Only processes accessible iframes
- Cross-origin iframes fail fast (single try-catch)
- No additional CDP overhead
- Structural tools already bounded by config limits

### Risk Mitigation
- ✅ No breaking changes to existing API
- ✅ Existing tests should pass unchanged
- ✅ Graceful degradation for cross-origin
- ✅ Single bridge instance (no sync issues)
- ✅ DOM-based approach is well-understood

---

## Next Steps

1. Start with Phase 1 (snapshot generation)
2. Test with existing iframe test from bridge-lifecycle.spec.ts
3. Implement Phase 2 (ref parsing)
4. Add comprehensive Phase 3 tests
5. Document iframe ref format in user-facing docs
6. Update CHANGELOG.md with iframe support announcement
