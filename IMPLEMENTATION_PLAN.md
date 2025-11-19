# Multi-Frame Implementation Plan: Step-by-Step Guide

**Last Updated**: November 19, 2025  
**Approach**: Fail-Fast Testing - Validate riskiest assumptions first  
**Estimated Time**: 12-17 hours (2-3 days)

---

## Overview

This guide implements multi-frame (iframe) support using a **risk-first approach**. We test the most critical assumptions first so you know within 2 hours if the plan will work.

### Critical Success Path

```
Phase 0 (Validate CDP) → Phase 1 (Markers) → Phase 2 (Multi-Frame Bridge)
         ↓
Phase 3 (Discovery) → Phase 4 (Resolution) → Phase 5 (Expansion) → Phase 6 (Interactions)
```

**Key Principle**: Each phase has a **GATE** ✅. If the gate fails, STOP and reassess.

---

## Phase 0: Critical CDP Validation (1-2 hours)

**Risk**: 🔴 **HIGHEST** - If this fails, entire plan needs revision  
**Goal**: Validate that Chrome DevTools Protocol works as we assume

### Step 0.1: Create Test File

Create `tests/cdp-validation.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../src/runtime/MultiContextBrowser";

test.describe("CDP API Validation", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.launch();
    await browser.createRole("user");
  });

  test.afterEach(async () => {
    await browser.close();
  });

  test("Test 1: createIsolatedWorld works with child frame IDs", async () => {
    const html = `<iframe id="test" srcdoc="<button>Child</button>"></iframe>`;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    
    const context = await browser.ensureCurrentRoleContext();
    const cdp = context.cdpSession;
    
    // Get child frame ID
    const { frameTree } = await cdp.send('Page.getFrameTree');
    const childFrameId = frameTree.childFrames[0].frame.id;
    
    // GATE: Can we create isolated world in child frame?
    const result = await cdp.send('Page.createIsolatedWorld', {
      frameId: childFrameId,
      worldName: 'test-world',
      grantUniveralAccess: false,
    });
    
    expect(result.executionContextId).toBeGreaterThan(0);
    console.log('✓ createIsolatedWorld works with child frames');
  });

  test("Test 2: DOM.describeNode returns frameId for iframe elements", async () => {
    const html = `<iframe id="test" srcdoc="<button>Child</button>"></iframe>`;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    
    const context = await browser.ensureCurrentRoleContext();
    const page = context.page;
    const cdp = context.cdpSession;
    
    // Get iframe element as remote object
    const iframeHandle = await page.$('iframe#test');
    const remoteObject = await iframeHandle!.evaluateHandle(el => el);
    
    // Call DOM.describeNode with pierce: true
    const { node } = await cdp.send('DOM.describeNode', {
      objectId: (remoteObject as any)._remoteObject.objectId,
      pierce: true
    });
    
    // Debug: Log what CDP actually returns
    console.log('DOM.describeNode result for iframe:');
    console.log('  node.frameId:', node.frameId);
    console.log('  node.contentDocument:', node.contentDocument);
    if (node.contentDocument) {
      console.log('  node.contentDocument.frameId:', node.contentDocument.frameId);
    }
    
    // GATE: Can we get the child frameId using either approach?
    const childFrameId = node.frameId || node.contentDocument?.frameId;
    expect(childFrameId).toBeDefined();
    expect(typeof childFrameId).toBe('string');
    
    // This resolves the CDP ambiguity
    if (node.frameId && !node.contentDocument?.frameId) {
      console.log('✓ Chrome populates node.frameId (primary approach works)');
    } else if (!node.frameId && node.contentDocument?.frameId) {
      console.log('✓ Chrome populates node.contentDocument.frameId (fallback needed)');
    } else if (node.frameId && node.contentDocument?.frameId) {
      console.log('✓ Chrome populates BOTH (either approach works)');
    }
  });

  test("Test 3: executionContextCreated fires with frameId", async () => {
    const html = `<iframe id="test" srcdoc="<button>Child</button>"></iframe>`;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    
    const context = await browser.ensureCurrentRoleContext();
    const cdp = context.cdpSession;
    
    // Get child frame ID
    const { frameTree } = await cdp.send('Page.getFrameTree');
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
    
    cdp.on('Runtime.executionContextCreated', listener);
    
    // Create isolated world in child frame
    await cdp.send('Page.createIsolatedWorld', {
      frameId: childFrameId,
      worldName: 'test-world-2',
      grantUniveralAccess: false,
    });
    
    // Wait a bit for event
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // GATE: Did the event fire with frameId?
    expect(contextCreated).toBe(true);
    expect(receivedFrameId).toBe(childFrameId);
    console.log('✓ executionContextCreated fires with correct frameId');
    
    cdp.off('Runtime.executionContextCreated', listener);
  });
});
```

### Step 0.2: Run Tests

```bash
npm test -- tests/cdp-validation.spec.ts
```

### Success Gate ✅

- **ALL 3 tests pass** → Proceed to Phase 1
- **Test 1 fails** → CDP doesn't support child frame isolated worlds - major problem
- **Test 2 fails** → Can't resolve iframe elements to frameIds - need alternative approach
- **Test 3 fails** → Events don't fire correctly - ManualPromise pattern won't work

**Decision Point**: Only proceed if all 3 tests pass.

**Time**: 1-2 hours  
**Output**: Confidence that CDP APIs work as documented

---

## Phase 1: Iframe Markers (10 minutes)

**Risk**: ✅ **LOWEST** - Simple 2-line change  
**Goal**: Make iframes visible in snapshots with refs

### Step 1.1: Edit AriaUtils.ts

**File**: `src/browser/utils/AriaUtils.ts`

**Change 1**: Add iframe role (around line 343)

```typescript
switch (tagName) {
  // ... existing cases ...
  
  case "IFRAME":
    return "iframe";
  
  // ... rest of cases ...
}
```

**Change 2**: Make iframes interactive so they get refs (around line 164)

```typescript
// Interactive HTML elements
private static readonly INTERACTIVE_ELEMENTS = [
  "A",
  "BUTTON",
  "INPUT",
  "SELECT",
  "TEXTAREA",
  "DETAILS",
  "IFRAME",  // ← ADD THIS - iframes need refs for frame resolution
];
```

### Step 1.2: Create Test File

Create `tests/iframe-markers.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../src/runtime/MultiContextBrowser";

test.describe("Iframe Markers", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.launch();
    await browser.createRole("user");
  });

  test.afterEach(async () => {
    await browser.close();
  });

  test("iframe appears in snapshot with ref", async () => {
    const html = `
      <button>Main Button</button>
      <iframe id="test" srcdoc="<button>Child</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();
    
    console.log("Snapshot:", snapshot.text);
    
    // GATE: Should match "- iframe [ref=e1]" or similar
    expect(snapshot.text).toMatch(/- iframe.*\[ref=e\d+\]/);
    
    // Extract ref to verify it was assigned
    const iframeRef = snapshot.text.match(/- iframe.*\[ref=(e\d+)\]/)?.[1];
    expect(iframeRef).toBeDefined();
    console.log(`✓ Iframe has ref: ${iframeRef}`);
  });

  test("excludes hidden iframes", async () => {
    const html = `
      <button>Visible Button</button>
      <iframe style="display:none" srcdoc="<button>Hidden</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();
    
    // Visible content should be present
    expect(snapshot.text).toContain("Visible Button");
    
    // Hidden iframe should NOT appear
    expect(snapshot.text).not.toMatch(/iframe.*Hidden/);
    console.log('✓ Hidden iframes are filtered');
  });
});
```

### Step 1.3: Run Test

```bash
npm test -- tests/iframe-markers.spec.ts
```

### Success Gate ✅

- **Iframe appears with `[ref=eN]`** → Proceed to Phase 2
- **No ref assigned** → Check INTERACTIVE_ELEMENTS was added
- **Iframe doesn't appear at all** → Check role was added to switch statement

**Time**: 10 minutes  
**Output**: Iframes are now trackable elements

---

## Phase 2: Multi-Frame Bridge (5-7 hours)

**Risk**: 🔴 **HIGHEST IMPLEMENTATION RISK** - Most complex changes  
**Goal**: Make BridgeInjector track bridges for multiple frames

### Step 2.1: Add ManualPromise Utility (15 min)

Create `src/utils/ManualPromise.ts`:

```typescript
/**
 * ManualPromise - A promise that can be resolved/rejected externally.
 * 
 * Usage:
 *   const promise = new ManualPromise<string>();
 *   promise.resolve("done");
 *   await promise;  // Awaits the resolved value (no .promise needed)
 * 
 * Debugging:
 *   ManualPromise.DEBUG = true;  // Enable warnings for double-settlement
 */
export class ManualPromise<T = void> extends Promise<T> {
  private _resolve!: (value: T) => void;
  private _reject!: (error: Error) => void;
  private _isDone = false;

  /**
   * Enable to log warnings when resolve/reject is called multiple times.
   * Useful for debugging potential logic errors in development.
   */
  static DEBUG = false;

  constructor() {
    let resolve: (value: T) => void;
    let reject: (error: Error) => void;
    super((f, r) => {
      resolve = f;
      reject = r;
    });
    this._resolve = resolve!;
    this._reject = reject!;
  }

  resolve(value: T): void {
    if (this._isDone) {
      if (ManualPromise.DEBUG) {
        console.warn(
          'ManualPromise.resolve() called after already settled',
          '\nStack trace:',
          new Error().stack
        );
      }
      return;
    }
    this._isDone = true;
    this._resolve(value);
  }

  reject(error: Error): void {
    if (this._isDone) {
      if (ManualPromise.DEBUG) {
        console.warn(
          'ManualPromise.reject() called after already settled',
          '\nStack trace:',
          new Error().stack
        );
      }
      return;
    }
    this._isDone = true;
    this._reject(error);
  }

  isDone(): boolean {
    return this._isDone;
  }

  static override get [Symbol.species]() {
    return Promise;
  }

  override get [Symbol.toStringTag]() {
    return 'ManualPromise';
  }
}
```

Test it:

```bash
# Quick validation
node -e "
const { ManualPromise } = require('./dist/utils/ManualPromise.js');
const mp = new ManualPromise();
setTimeout(() => mp.resolve(), 10);
mp.then(() => console.log('✓ ManualPromise works'));
"
```

### Step 2.2: Add Type Definitions (5 min)

**File**: `src/runtime/types.ts`

Add these types:

```typescript
export type RefIndexEntry = {
  frameId: string;
  localRef: string;
};

export type GlobalRefIndex = Map<string, RefIndexEntry>;
```

Update `RoleContext`:

```typescript
export type RoleContext = {
  // ... existing fields ...
  
  // NEW: Multi-frame state
  refIndex?: GlobalRefIndex;
  navigationTimestamp?: number;
};
```

### Step 2.3: Convert BridgeInjector State (1-2 hours)

**File**: `src/runtime/BridgeInjector.ts`

**At the top**, add import:

```typescript
import { ManualPromise } from '../utils/ManualPromise';
```

**Replace lines 12-18** (the scalar state variables):

```typescript
// OLD:
// private mainFrameId: string | null = null;
// private contextId: number | null = null;
// private bridgeObjectId: string | null = null;

// NEW:
type FrameState = {
  frameId: string;
  contextId: number;
  bridgeObjectId: string;
  contextReadyPromise: ManualPromise<void>;
};

private frameStates = new Map<CDPSession, Map<string, FrameState>>();
```

**Add helper methods** after the type definition:

```typescript
private getFrameState(
  cdp: CDPSession,
  frameId: string
): FrameState | undefined {
  return this.frameStates.get(cdp)?.get(frameId);
}

private getOrCreateFrameState(
  cdp: CDPSession,
  frameId: string
): FrameState {
  let state = this.getFrameState(cdp, frameId);
  if (state) return state;
  
  state = {
    frameId,
    contextId: 0,
    bridgeObjectId: '',
    contextReadyPromise: new ManualPromise<void>(),
  };
  
  if (!this.frameStates.has(cdp)) {
    this.frameStates.set(cdp, new Map());
  }
  this.frameStates.get(cdp)!.set(frameId, state);
  
  return state;
}
```

### Step 2.4: Update Event Listeners (2-3 hours)

**File**: `src/runtime/BridgeInjector.ts`

Find the `Runtime.executionContextCreated` listener (around line 40) and update it:

```typescript
const onCtx = (evt: any) => {
  const ctx = evt.context;
  const frameId = ctx.auxData?.frameId;
  if (!frameId) return;
  
  const matchesWorld = ctx.name === this.worldName || 
                       ctx.auxData.name === this.worldName;
  
  if (matchesWorld) {
    // Get or create frame state
    const frameState = this.getOrCreateFrameState(cdp, frameId);
    
    frameState.contextId = ctx.id;
    
    // Resolve promise - event-driven readiness!
    frameState.contextReadyPromise.resolve();
  }
};
```

**Add new frame lifecycle listeners** after the existing listeners:

```typescript
const onFrameAttached = async (evt: any) => {
  try {
    await this.ensureFrameState(cdp, evt.frameId);
  } catch (error) {
    // Frame might detach quickly - that's OK
    console.warn(`Failed to inject into new frame ${evt.frameId}:`, error);
  }
};

const onFrameDetached = (evt: any) => {
  const sessionStates = this.frameStates.get(cdp);
  if (sessionStates) {
    const state = sessionStates.get(evt.frameId);
    if (state && !state.contextReadyPromise.isDone()) {
      state.contextReadyPromise.reject(new Error('Frame detached'));
    }
    sessionStates.delete(evt.frameId);
  }
};

this.addListener(cdp, "Page.frameAttached", onFrameAttached);
this.addListener(cdp, "Page.frameDetached", onFrameDetached);
```

### Step 2.5: Add ensureFrameState Method (1-2 hours)

**File**: `src/runtime/BridgeInjector.ts`

Add this new method:

```typescript
/**
 * Ensure a frame has an isolated world with bridge injected.
 * Uses ManualPromise to wait for executionContextCreated event.
 * No polling, no retries - event-driven!
 */
async ensureFrameState(cdp: CDPSession, frameId: string): Promise<FrameState> {
  let state = this.getFrameState(cdp, frameId);
  
  // If context is already ready, return immediately
  if (state?.contextReadyPromise.isDone() && state.bridgeObjectId) {
    return state;
  }
  
  // If state exists but not ready, wait for it
  if (state) {
    await state.contextReadyPromise;
    return state;
  }
  
  // Create new state with pending promise
  state = this.getOrCreateFrameState(cdp, frameId);
  
  try {
    // Create isolated world (will trigger executionContextCreated event)
    await cdp.send('Page.createIsolatedWorld', {
      frameId,
      worldName: this.worldName,
      grantUniveralAccess: false,
    });
    
    // Wait for executionContextCreated event to resolve the promise
    await state.contextReadyPromise;
    
    // Inject bundle and get bridge handle
    const { result } = await cdp.send("Runtime.evaluate", {
      expression: this.bundleCode,
      contextId: state.contextId,
      returnByValue: false,
    });

    if (!result.objectId) {
      throw new Error("Bridge did not return an object");
    }

    state.bridgeObjectId = result.objectId;
    
    return state;
  } catch (error) {
    // Clean up state on failure
    const sessionStates = this.frameStates.get(cdp);
    if (sessionStates) {
      sessionStates.delete(frameId);
    }
    throw error;
  }
}
```

### Step 2.6: Update Method Signatures (1 hour)

Update these methods to accept `frameId` parameter:

**getBridgeHandle**:

```typescript
async getBridgeHandle(cdp: CDPSession, frameId: string): Promise<string> {
  const state = await this.ensureFrameState(cdp, frameId);
  return state.bridgeObjectId;
}
```

**callBridgeMethod**:

```typescript
async callBridgeMethod<T = any>(
  cdp: CDPSession,
  method: string,
  args: any[],
  frameId: string  // NEW parameter
): Promise<T> {
  const objectId = await this.getBridgeHandle(cdp, frameId);
  
  // ... rest of method unchanged
}
```

**healthCheck**:

```typescript
async healthCheck(cdp: CDPSession, frameId: string): Promise<boolean> {
  try {
    const objectId = await this.getBridgeHandle(cdp, frameId);
    // ... rest unchanged
  } catch {
    return false;
  }
}
```

**injectOnceIntoCurrentDoc** - update to use frameId:

```typescript
async injectOnceIntoCurrentDoc(
  cdp: CDPSession,
  frameId: string
): Promise<void> {
  await this.ensureFrameState(cdp, frameId);
}
```

### Step 2.7: Update Call Sites (30 min)

**File**: `src/runtime/MultiContextBrowser.ts`

Update all calls to `callBridgeMethod` to pass `mainFrameId`:

```typescript
// In snapshot() method:
const result = await context.bridgeInjector.callBridgeMethod<Snapshot>(
  context.cdpSession,
  "snapshot",
  [],
  context.mainFrameId  // ADD THIS
);

// Similar updates for click(), type(), resolve_container(), etc.
```

**IMPORTANT**: For now, just add `context.mainFrameId` to all calls. We'll update these properly in Phase 6.

### Step 2.8: Test Multi-Frame Bridge

Create `tests/multi-frame-bridge.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../src/runtime/MultiContextBrowser";

test.describe("Multi-Frame Bridge", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.launch();
    await browser.createRole("user");
  });

  test.afterEach(async () => {
    await browser.close();
  });

  test("can inject bridge into child frame", async () => {
    const html = `<iframe srcdoc="<button>Child Button</button>"></iframe>`;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    
    const context = (browser as any).contexts.get("user");
    const cdp = context.cdpSession;
    
    // Get child frame ID
    const { frameTree } = await cdp.send('Page.getFrameTree');
    const childFrameId = frameTree.childFrames[0].frame.id;
    
    // GATE: Should be able to create bridge in child frame
    await context.bridgeInjector.ensureFrameState(cdp, childFrameId);
    
    // GATE: Should be able to call methods on child frame bridge
    const snapshot = await context.bridgeInjector.callBridgeMethod(
      cdp,
      "snapshot",
      [],
      childFrameId
    );
    
    expect(snapshot.text).toBeTruthy();
    expect(snapshot.text).toContain("Child Button");
    console.log('✓ Child frame bridge works:', snapshot.text);
  });

  test("tracks multiple frame states", async () => {
    const html = `
      <iframe id="f1" srcdoc="<button>Frame 1</button>"></iframe>
      <iframe id="f2" srcdoc="<button>Frame 2</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    
    const context = (browser as any).contexts.get("user");
    const cdp = context.cdpSession;
    
    // Get frame IDs
    const { frameTree } = await cdp.send('Page.getFrameTree');
    const frame1Id = frameTree.childFrames[0].frame.id;
    const frame2Id = frameTree.childFrames[1].frame.id;
    
    // Inject into both frames
    await context.bridgeInjector.ensureFrameState(cdp, frame1Id);
    await context.bridgeInjector.ensureFrameState(cdp, frame2Id);
    
    // GATE: Should be able to call methods on both frames
    const snapshot1 = await context.bridgeInjector.callBridgeMethod(
      cdp, "snapshot", [], frame1Id
    );
    const snapshot2 = await context.bridgeInjector.callBridgeMethod(
      cdp, "snapshot", [], frame2Id
    );
    
    expect(snapshot1.text).toContain("Frame 1");
    expect(snapshot2.text).toContain("Frame 2");
    console.log('✓ Multiple frame states tracked');
  });
});
```

### Step 2.9: Run Tests

```bash
npm test -- tests/multi-frame-bridge.spec.ts
npm test -- tests/bridge-lifecycle.spec.ts  # Should still pass
```

### Success Gate ✅

- **Can inject bridge into child frame** → Proceed to Phase 3
- **ensureFrameState fails** → Check event listeners, verify Phase 0 passed
- **Can't call methods on child bridge** → Check objectId handling
- **Existing tests fail** → Fix regressions before proceeding

**Time**: 5-7 hours  
**Output**: BridgeInjector is multi-frame capable

---

## Phase 3: Frame Discovery (1-2 hours)

**Risk**: ⚠️ **MEDIUM** - Needs Phase 2 working  
**Goal**: Automatically discover and inject bridges into all frames after navigation

### Step 3.1: Add Frame Discovery Methods

**File**: `src/runtime/MultiContextBrowser.ts`

Add these methods (around line 400, after `navigate`):

```typescript
/**
 * Discover all frames in page and inject bridges into each.
 * Called after navigation to ensure bridges exist in all frames.
 */
private async discoverAndInjectFrames(context: RoleContext): Promise<void> {
  try {
    // Get complete frame tree
    const { frameTree } = await context.cdpSession.send('Page.getFrameTree');
    
    // Inject into all frames recursively (parallel)
    await this.injectFrameTreeRecursive(context, frameTree);
  } catch (error) {
    console.warn('Frame discovery failed:', error);
  }
}

/**
 * Recursively inject bridges into frame tree.
 * Uses parallel processing for speed.
 */
private async injectFrameTreeRecursive(
  context: RoleContext,
  frameTree: any
): Promise<void> {
  // Inject into this frame
  try {
    await context.bridgeInjector.ensureFrameState(
      context.cdpSession,
      frameTree.frame.id
    );
  } catch (error) {
    // Frame detachment is normal - don't treat as error
    if (this.isFrameDetachedError(error)) {
      return;
    }
    console.warn(`Failed to inject into frame ${frameTree.frame.id}:`, error);
    return;
  }
  
  // Recursively inject into children (PARALLEL for speed)
  if (frameTree.childFrames && frameTree.childFrames.length > 0) {
    await Promise.allSettled(
      frameTree.childFrames.map((child: any) => 
        this.injectFrameTreeRecursive(context, child)
      )
    );
    // allSettled means one frame failure doesn't block siblings
  }
}

private isFrameDetachedError(error: any): boolean {
  if (!error?.message) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('frame detached') ||
    msg.includes('frame has been detached') ||
    msg.includes('cannot find execution context') ||
    msg.includes('execution context was destroyed') ||
    msg.includes('frame with the given id was not found')
  );
}
```

### Step 3.2: Update navigate() Method

**File**: `src/runtime/MultiContextBrowser.ts`

Find the `navigate()` method (around line 273) and add the discovery call:

```typescript
async navigate(url: string): Promise<Snapshot> {
  try {
    const context = await this.ensureCurrentRoleContext();
    
    // ... existing response handler setup ...
    
    const response = await context.page.goto(url, {
      waitUntil: "networkidle0",  // Waits for ALL frames recursively
    });
    
    // NEW: Discover and inject bridges into all frames
    await this.discoverAndInjectFrames(context);
    
    // Mark context as navigated
    context.hasNavigated = true;
    context.navigationTimestamp = Date.now();
    
    // Get snapshot (will include iframes in Phase 5)
    const snapshot = await this.snapshot();
    
    // ... rest of method unchanged ...
  }
}
```

### Step 3.3: Test Frame Discovery

Create `tests/frame-discovery.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../src/runtime/MultiContextBrowser";

test.describe("Frame Discovery", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.launch();
    await browser.createRole("user");
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
    
    const context = (browser as any).contexts.get("user");
    const cdp = context.cdpSession;
    
    // GATE: All frames should have bridges
    const { frameTree } = await cdp.send('Page.getFrameTree');
    
    // Main frame
    const mainState = context.bridgeInjector.getFrameState(
      cdp,
      frameTree.frame.id
    );
    expect(mainState).toBeDefined();
    expect(mainState.bridgeObjectId).toBeTruthy();
    
    // Child frames
    for (const child of frameTree.childFrames) {
      const childState = context.bridgeInjector.getFrameState(
        cdp,
        child.frame.id
      );
      expect(childState).toBeDefined();
      expect(childState.bridgeObjectId).toBeTruthy();
      console.log(`✓ Frame ${child.frame.id} has bridge`);
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
    
    const context = (browser as any).contexts.get("user");
    const cdp = context.cdpSession;
    
    // GATE: Nested frames should have bridges
    const { frameTree } = await cdp.send('Page.getFrameTree');
    const level1 = frameTree.childFrames[0];
    
    // Check level 1
    const level1State = context.bridgeInjector.getFrameState(
      cdp,
      level1.frame.id
    );
    expect(level1State?.bridgeObjectId).toBeTruthy();
    
    // Check level 2
    if (level1.childFrames?.length > 0) {
      const level2 = level1.childFrames[0];
      const level2State = context.bridgeInjector.getFrameState(
        cdp,
        level2.frame.id
      );
      expect(level2State?.bridgeObjectId).toBeTruthy();
      console.log('✓ Nested frames have bridges');
    }
  });
});
```

### Step 3.4: Run Tests

```bash
npm test -- tests/frame-discovery.spec.ts
npm test  # All tests should still pass
```

### Success Gate ✅

- **All frames have bridges after navigation** → Proceed to Phase 4
- **Some frames missing bridges** → Check recursive injection logic
- **Nested frames don't work** → Check Promise.allSettled usage

**Time**: 1-2 hours  
**Output**: Bridges automatically exist in all frames

---

## Phase 4: Frame Resolution (1 hour)

**Risk**: ⚠️ **MEDIUM** - Tests CDP DOM.describeNode  
**Goal**: Map iframe element refs to child frameIds

### Step 4.1: Add getElementInfo to Bridge

**File**: `src/browser/types/bridge.ts`

Add to interface:

```typescript
export type IBridge = {
  // ... existing methods ...
  
  getElementInfo(ref: string): ElementInfo | null;  // NEW
};
```

**File**: `src/browser/bridge/BridgeFactory.ts`

Add implementation:

```typescript
const bridge: IBridge = {
  // ... existing methods ...

  getElementInfo(ref: string): ElementInfo | null {
    return bridge.elements.get(ref) || null;
  },
};
```

### Step 4.2: Add Frame Resolution Method

**File**: `src/runtime/MultiContextBrowser.ts`

Add this method:

```typescript
/**
 * Resolve an iframe element reference to its CDP frameId.
 * Uses DOM.describeNode to get frame information from element.
 */
private async resolveFrameFromRef(
  context: RoleContext,
  parentFrameId: string,
  iframeRef: string
): Promise<{ frameId: string } | null> {
  try {
    // Get bridge handle for parent frame
    const bridgeObjectId = await context.bridgeInjector.getBridgeHandle(
      context.cdpSession,
      parentFrameId
    );

    // Get the iframe element as a remote object
    const { result } = await context.cdpSession.send('Runtime.callFunctionOn', {
      objectId: bridgeObjectId,
      functionDeclaration: `function(ref) { 
        const info = this.getElementInfo(ref);
        return info ? info.element : null;
      }`,
      arguments: [{ value: iframeRef }],
      returnByValue: false,  // We need the objectId
    });

    if (!result.objectId) {
      console.warn(`No element found for iframe ref ${iframeRef}`);
      return null;
    }

    // Use CDP to get node details including frameId
    const { node } = await context.cdpSession.send('DOM.describeNode', {
      objectId: result.objectId,
      pierce: true,  // Required to traverse into iframe
    });

    // Try both documented approaches (CDP ambiguity)
    const childFrameId = node.frameId || node.contentDocument?.frameId;
    
    if (!childFrameId) {
      console.warn(`Element ${iframeRef} is not an iframe or has no content`);
      return null;
    }

    return { frameId: childFrameId };
  } catch (error) {
    console.warn(`Failed to resolve frame from ref ${iframeRef}:`, error);
    return null;
  }
}
```

### Step 4.3: Test Frame Resolution

Create `tests/frame-resolution.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../src/runtime/MultiContextBrowser";

test.describe("Frame Resolution", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.launch();
    await browser.createRole("user");
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
    
    const context = (browser as any).contexts.get("user");
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
    
    const context = (browser as any).contexts.get("user");
    
    // GATE: Should return null for non-iframe
    const frameInfo = await (browser as any).resolveFrameFromRef(
      context,
      context.mainFrameId,
      buttonRef
    );
    
    expect(frameInfo).toBeNull();
    console.log('✓ Non-iframe returns null');
  });
});
```

### Step 4.4: Run Tests

```bash
npm test -- tests/frame-resolution.spec.ts
```

### Success Gate ✅

- **Can resolve iframe refs to frameIds** → Proceed to Phase 5
- **Returns null** → Check DOM.describeNode, verify Phase 0 passed
- **Wrong frameId returned** → Check pierce:true parameter

**Time**: 1 hour  
**Output**: Can map element refs to frame IDs

---

## Phase 5: Snapshot Expansion (2-3 hours)

**Risk**: ⚠️ **MEDIUM** - Brings everything together  
**Goal**: Recursively expand iframe markers in snapshots

### Step 5.1: Update Snapshot Method

**File**: `src/runtime/MultiContextBrowser.ts`

Replace the `snapshot()` method (around line 450):

```typescript
async snapshot(): Promise<Snapshot> {
  try {
    const context = await this.ensureCurrentRoleContext();

    // Get main frame snapshot (with iframe markers from Phase 1)
    const mainSnapshot = await context.bridgeInjector.callBridgeMethod<Snapshot>(
      context.cdpSession,
      "snapshot",
      [],
      context.mainFrameId
    );

    // Build refIndex for interaction routing (Phase 6)
    const refIndex = new Map<string, RefIndexEntry>();
    
    // Populate with main frame refs first
    const mainFrameRefs = mainSnapshot.text.matchAll(/\[ref=([^\]]+)\]/g);
    for (const match of mainFrameRefs) {
      const ref = match[1];
      refIndex.set(ref, { frameId: context.mainFrameId, localRef: ref });
    }

    // Recursively expand iframe markers
    const expanded = await this.expandIframes(
      context,
      mainSnapshot.text,
      context.mainFrameId,
      0, // ordinal counter
      refIndex
    );

    // Store refIndex on context for interaction routing
    context.refIndex = refIndex;

    return {
      text: expanded.text,
      elementCount: expanded.elementCount,
    };
  } catch (error) {
    throw new Error(
      `Snapshot failed for role '${this.currentRole}': ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
```

### Step 5.2: Add Expansion Method

**File**: `src/runtime/MultiContextBrowser.ts`

Add this method:

```typescript
/**
 * Recursively expand iframe markers in snapshot text.
 * For each "- iframe [ref=eN]" line:
 *   1. Resolve element ref to frame ID
 *   2. Snapshot that child frame
 *   3. Rewrite child refs with frame prefix (fX_eN)
 *   4. Recursively expand any iframes in child
 *   5. Indent and merge child content
 */
private async expandIframes(
  context: RoleContext,
  snapshotText: string,
  currentFrameId: string,
  ordinalCounter: number,
  refIndex: GlobalRefIndex
): Promise<{ text: string; elementCount: number; nextOrdinal: number }> {
  const lines = snapshotText.split('\n');
  const result: string[] = [];
  let totalElements = 0;
  let nextOrdinal = ordinalCounter;

  for (const line of lines) {
    // Match iframe markers: "- iframe [ref=eN]" or "  - iframe "Name" [ref=eN]"
    const match = line.match(/^(\s*)- iframe(?:\s+"[^"]*")?\s+\[ref=([^\]]+)\]/);
    
    if (!match) {
      // Not an iframe marker, keep as-is
      result.push(line);
      continue;
    }

    const indentation = match[1];
    const iframeRef = match[2];

    // Keep the original iframe line (with colon to indicate children)
    result.push(line + ':');

    try {
      // Resolve iframe element ref to frame ID
      const frameInfo = await this.resolveFrameFromRef(
        context,
        currentFrameId,
        iframeRef
      );

      if (!frameInfo) {
        result.push(indentation + '  [Frame content unavailable]');
        continue;
      }

      // Assign frame ordinal (f1, f2, f3, ...)
      const frameOrdinal = ++nextOrdinal;

      // Snapshot child frame
      const childSnapshot = await context.bridgeInjector.callBridgeMethod<Snapshot>(
        context.cdpSession,
        "snapshot",
        [],
        frameInfo.frameId
      );

      totalElements += childSnapshot.elementCount;

      // Recursively expand any iframes in child frame
      const expandedChild = await this.expandIframes(
        context,
        childSnapshot.text,
        frameInfo.frameId,
        nextOrdinal,
        refIndex
      );

      nextOrdinal = expandedChild.nextOrdinal;
      totalElements += expandedChild.elementCount - childSnapshot.elementCount;

      // Rewrite refs in child frame: eN → fX_eN
      const prefix = `f${frameOrdinal}_`;
      const rewritten = expandedChild.text.replace(
        /\[ref=([^\]]+)\]/g,
        (_whole, localRef) => {
          const globalRef = prefix + localRef;
          refIndex.set(globalRef, { frameId: frameInfo.frameId, localRef });
          return `[ref=${globalRef}]`;
        }
      );

      // Indent child frame content and add to result
      for (const childLine of rewritten.split('\n')) {
        if (childLine.trim()) {
          result.push(indentation + '  ' + childLine);
        }
      }
    } catch (error) {
      // Frame detachment is normal, generic errors need logging
      if (this.isFrameDetachedError(error)) {
        result.push(indentation + '  [Frame detached]');
      } else {
        const errMsg = error instanceof Error ? error.message : String(error);
        result.push(indentation + `  [Error: ${errMsg}]`);
      }
      continue;
    }
  }

  return {
    text: result.join('\n'),
    elementCount: totalElements,
    nextOrdinal,
  };
}
```

### Step 5.3: Test Snapshot Expansion

Create `tests/iframe-support.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../src/runtime/MultiContextBrowser";

test.describe("Iframe Support", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.launch();
    await browser.createRole("user");
  });

  test.afterEach(async () => {
    await browser.close();
  });

  test("expands iframe content in snapshot", async () => {
    const html = `
      <button>Main Button</button>
      <iframe srcdoc="<button>Child Button</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();
    
    console.log("=== SNAPSHOT ===");
    console.log(snapshot.text);
    console.log("================");
    
    // GATE: Should contain both main and child content
    expect(snapshot.text).toContain("Main Button");
    expect(snapshot.text).toContain("Child Button");
    
    // GATE: Child button should have frame-qualified ref
    expect(snapshot.text).toMatch(/Child Button.*\[ref=f1_e\d+\]/);
    
    // GATE: Should have iframe with children indicator
    expect(snapshot.text).toMatch(/iframe.*\[ref=e\d+\]:/);
    
    console.log('✓ Iframe content expanded');
  });

  test("handles nested iframes", async () => {
    const html = `
      <button>Main</button>
      <iframe srcdoc="
        <button>Level 1</button>
        <iframe srcdoc='<button>Level 2</button>'></iframe>
      "></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();
    
    console.log("=== NESTED SNAPSHOT ===");
    console.log(snapshot.text);
    console.log("=======================");
    
    // GATE: Should contain all levels
    expect(snapshot.text).toContain("Main");
    expect(snapshot.text).toContain("Level 1");
    expect(snapshot.text).toContain("Level 2");
    
    // GATE: Should have nested refs (f1_e1, f2_e1)
    expect(snapshot.text).toMatch(/Level 1.*\[ref=f1_e\d+\]/);
    expect(snapshot.text).toMatch(/Level 2.*\[ref=f2_e\d+\]/);
    
    console.log('✓ Nested iframes expanded');
  });

  test("handles multiple iframes", async () => {
    const html = `
      <iframe srcdoc="<button>Frame 1</button>"></iframe>
      <iframe srcdoc="<button>Frame 2</button>"></iframe>
      <iframe srcdoc="<button>Frame 3</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();
    
    console.log("=== MULTIPLE IFRAMES ===");
    console.log(snapshot.text);
    console.log("========================");
    
    // GATE: Should contain all frame content
    expect(snapshot.text).toContain("Frame 1");
    expect(snapshot.text).toContain("Frame 2");
    expect(snapshot.text).toContain("Frame 3");
    
    // GATE: Should have distinct frame prefixes
    expect(snapshot.text).toMatch(/Frame 1.*\[ref=f1_e\d+\]/);
    expect(snapshot.text).toMatch(/Frame 2.*\[ref=f2_e\d+\]/);
    expect(snapshot.text).toMatch(/Frame 3.*\[ref=f3_e\d+\]/);
    
    console.log('✓ Multiple iframes expanded');
  });
});
```

### Step 5.4: Run Tests

```bash
npm test -- tests/iframe-support.spec.ts
npm test  # All tests should pass
```

### Success Gate ✅

- **Snapshot contains iframe content** → Proceed to Phase 6
- **Only main frame content** → Check resolveFrameFromRef
- **No frame-qualified refs** → Check ref rewriting logic
- **Nested iframes don't work** → Check recursion

**Time**: 2-3 hours  
**Output**: Complete multi-frame snapshots!

---

## Phase 6: Interaction Routing (2-3 hours)

**Risk**: ✅ **LOW** - Polish, not critical for validation  
**Goal**: Route interactions (click, type, etc.) to correct frame

### Step 6.1: Add parseRef Method

**File**: `src/runtime/MultiContextBrowser.ts`

Add this method:

```typescript
/**
 * Parse a global ref into { frameId, localRef } using the snapshot-built refIndex.
 * All refs (main frame and child frames) are in refIndex for consistent lookup.
 */
private parseRef(
  ref: string,
  context: RoleContext
): { frameId: string; localRef: string } {
  // Lookup in refIndex (includes both main frame and child frame refs)
  const fromIndex = context.refIndex?.get(ref);
  if (fromIndex) return fromIndex;

  // If not found, ref is stale or invalid
  throw new Error(
    `Unknown element reference: ${ref}. ` +
    `Ref may be stale after navigation. Take a new snapshot.`
  );
}
```

### Step 6.2: Update Interaction Methods

**File**: `src/runtime/MultiContextBrowser.ts`

Update these methods to use `parseRef`:

```typescript
async click(ref: string): Promise<void> {
  const context = await this.ensureCurrentRoleContext();
  const { frameId, localRef } = this.parseRef(ref, context);

  const navigationPromise = context.page
    .waitForNavigation({ waitUntil: "networkidle2", timeout: 1000 })
    .catch((error) => {
      if (/timeout/i.test(error.message || "")) return null;
      throw error;
    });

  try {
    await context.bridgeInjector.callBridgeMethod(
      context.cdpSession,
      "click",
      [localRef],
      frameId  // Routes to correct frame!
    );
    await navigationPromise;
  } catch (error) {
    await navigationPromise.catch(() => {});
    throw error;
  }
}

async type(ref: string, text: string): Promise<void> {
  const context = await this.ensureCurrentRoleContext();
  const { frameId, localRef } = this.parseRef(ref, context);

  await context.bridgeInjector.callBridgeMethod(
    context.cdpSession,
    "type",
    [localRef, text],
    frameId
  );
}

async resolve_container(ref: string): Promise<any> {
  const context = await this.ensureCurrentRoleContext();
  const { frameId, localRef } = this.parseRef(ref, context);

  return await context.bridgeInjector.callBridgeMethod(
    context.cdpSession,
    "resolve_container",
    [localRef],
    frameId
  );
}

async inspect_pattern(ref: string, ancestorLevel: number): Promise<any> {
  const context = await this.ensureCurrentRoleContext();
  const { frameId, localRef } = this.parseRef(ref, context);

  return await context.bridgeInjector.callBridgeMethod(
    context.cdpSession,
    "inspect_pattern",
    [localRef, ancestorLevel],
    frameId
  );
}

async extract_anchors(ref: string, ancestorLevel: number): Promise<any> {
  const context = await this.ensureCurrentRoleContext();
  const { frameId, localRef } = this.parseRef(ref, context);

  return await context.bridgeInjector.callBridgeMethod(
    context.cdpSession,
    "extract_anchors",
    [localRef, ancestorLevel],
    frameId
  );
}
```

### Step 6.3: Test Interaction Routing

Add to `tests/iframe-support.spec.ts`:

```typescript
test("clicks button inside iframe using frame-qualified ref", async () => {
  const html = `
    <iframe srcdoc="
      <button id='btn' onclick='window.clicked = true'>Click Me</button>
    "></iframe>
  `;
  await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
  const snapshot = await browser.snapshot();
  
  console.log("Snapshot:", snapshot.text);
  
  // Find iframe button ref
  const match = snapshot.text.match(/Click Me.*\[ref=(f\d+_e\d+)\]/);
  expect(match).toBeTruthy();
  const btnRef = match![1];
  console.log(`Button ref: ${btnRef}`);

  // GATE: Should click child frame button
  await browser.click(btnRef);

  // Verify side-effect
  const context = (browser as any).contexts.get("user");
  const clicked = await context.page.evaluate(() => {
    const iframe = document.querySelector('iframe') as HTMLIFrameElement;
    return (iframe.contentWindow as any)?.clicked === true;
  });

  expect(clicked).toBe(true);
  console.log('✓ Clicked button in iframe');
});

test("types into input inside iframe", async () => {
  const html = `
    <iframe srcdoc="<input type='text' id='input' />"></iframe>
  `;
  await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
  const snapshot = await browser.snapshot();
  
  // Find iframe input ref
  const match = snapshot.text.match(/textbox.*\[ref=(f\d+_e\d+)\]/);
  expect(match).toBeTruthy();
  const inputRef = match![1];

  // GATE: Should type into child frame input
  await browser.type(inputRef, "Hello from iframe");

  // Verify value
  const context = (browser as any).contexts.get("user");
  const value = await context.page.evaluate(() => {
    const iframe = document.querySelector('iframe') as HTMLIFrameElement;
    const input = iframe.contentDocument?.getElementById('input') as HTMLInputElement;
    return input?.value;
  });

  expect(value).toBe("Hello from iframe");
  console.log('✓ Typed into input in iframe');
});

test("structural tools work in iframes", async () => {
  const html = `
    <div id="main-container">
      <button id="main-btn">Main</button>
    </div>
    <iframe srcdoc="
      <div id='iframe-container'>
        <button id='iframe-btn'>Iframe Button</button>
      </div>
    "></iframe>
  `;
  await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
  const snapshot = await browser.snapshot();

  // Find iframe button ref
  const match = snapshot.text.match(/Iframe Button.*\[ref=(f\d+_e\d+)\]/);
  expect(match).toBeTruthy();
  const iframeRef = match![1];

  // GATE: resolve_container should work in iframe
  const container = await browser.resolve_container(iframeRef);
  expect(container.target.tagName.toLowerCase()).toBe("button");
  expect(container.ancestors[0].attributes.id).toBe("iframe-container");

  // GATE: extract_anchors should work in iframe
  const anchors = await browser.extract_anchors(iframeRef, 1);
  expect(anchors).toBeDefined();

  console.log('✓ Structural tools work in iframe');
});

test("throws clear error for stale refs", async () => {
  const html1 = `<iframe srcdoc="<button>Button 1</button>"></iframe>`;
  const html2 = `<iframe srcdoc="<button>Button 2</button>"></iframe>`;

  await browser.navigate(`data:text/html,${encodeURIComponent(html1)}`);
  const snapshot1 = await browser.snapshot();

  // Get a ref from first page
  const match = snapshot1.text.match(/\[ref=(f1_e\d+)\]/);
  expect(match).toBeTruthy();
  const oldRef = match![1];

  // Navigate to new page
  await browser.navigate(`data:text/html,${encodeURIComponent(html2)}`);

  // GATE: Should fail with clear error
  await expect(browser.click(oldRef)).rejects.toThrow(
    /Unknown element reference.*stale.*snapshot/i
  );
  
  console.log('✓ Stale ref error is clear');
});
```

### Step 6.4: Run Tests

```bash
npm test -- tests/iframe-support.spec.ts
npm test  # All tests should pass
```

### Success Gate ✅

- **Can interact with iframe elements** → **COMPLETE!** 🎉
- **Click fails** → Check parseRef logic
- **Wrong frame clicked** → Check frameId routing
- **Structural tools fail** → Check method signature updates

**Time**: 2-3 hours  
**Output**: Full multi-frame support with interactions!

---

## Final Validation

### Run Complete Test Suite

```bash
# Run all tests
npm test

# Expected results:
# ✓ CDP validation (3 tests)
# ✓ Iframe markers (2 tests)
# ✓ Multi-frame bridge (2 tests)
# ✓ Frame discovery (2 tests)
# ✓ Frame resolution (2 tests)
# ✓ Iframe support (6+ tests)
# ✓ All existing tests still pass
```

### Manual Testing

Test with a real multi-frame page:

```typescript
// Create manual-test.spec.ts
test("complete checkout flow with iframe", async () => {
  const browser = new MultiContextBrowser();
  await browser.launch();
  await browser.createRole("user");
  
  // Navigate to page with payment iframe
  await browser.navigate("https://your-test-page-with-stripe.com");
  
  // Get snapshot
  const snapshot = await browser.snapshot();
  console.log(snapshot.text);
  
  // Find iframe refs
  const iframeRefs = Array.from(snapshot.text.matchAll(/\[ref=(f\d+_e\d+)\]/g));
  console.log(`Found ${iframeRefs.length} iframe elements`);
  
  // Interact with iframe elements
  // ... test your actual use case ...
  
  await browser.close();
});
```

### Success Criteria ✅

The implementation is complete when:

1. ✅ All CDP validation tests pass
2. ✅ Iframes appear in snapshots with refs
3. ✅ All frames have bridges after navigation
4. ✅ Can resolve iframe refs to frameIds
5. ✅ Snapshots include iframe content recursively
6. ✅ Can interact with iframe elements
7. ✅ All existing tests still pass
8. ✅ Manual testing with real iframe works

---

## Rollback Plan

If at any phase you encounter blocking issues:

### Phase 0 Fails
→ STOP. Research alternatives. CDP may not support our approach.

### Phase 1-2 Issues
→ Rollback with:
```bash
git checkout -- src/browser/utils/AriaUtils.ts
git checkout -- src/runtime/BridgeInjector.ts
```

### Phase 3-6 Issues
→ Can ship Phase 1-2 alone as "iframe markers" feature (prep for future).

### Nuclear Option
→ Entire feature branch:
```bash
git checkout main
git branch -D feature/multi-frame-support
```

---

## Estimated Timeline

| Phase | Time | Cumulative |
|-------|------|------------|
| 0. CDP Validation | 1-2h | 1-2h |
| 1. Iframe Markers | 10min | 1-2h |
| 2. Multi-Frame Bridge | 5-7h | 6-9h |
| 3. Frame Discovery | 1-2h | 7-11h |
| 4. Frame Resolution | 1h | 8-12h |
| 5. Snapshot Expansion | 2-3h | 10-15h |
| 6. Interaction Routing | 2-3h | 12-18h |
| **Total** | **12-18h** | **2-3 days** |

Add 20% buffer for debugging: **15-22 hours**

---

## Quick Reference

### Commands

```bash
# Phase 0
npm test -- tests/cdp-validation.spec.ts

# Phase 1
npm test -- tests/iframe-markers.spec.ts

# Phase 2
npm test -- tests/multi-frame-bridge.spec.ts
npm test -- tests/bridge-lifecycle.spec.ts

# Phase 3
npm test -- tests/frame-discovery.spec.ts

# Phase 4
npm test -- tests/frame-resolution.spec.ts

# Phase 5-6
npm test -- tests/iframe-support.spec.ts

# All tests
npm test

# Build
npm run build
```

### Key Files

- `src/browser/utils/AriaUtils.ts` - Phase 1
- `src/utils/ManualPromise.ts` - Phase 2 (new)
- `src/runtime/BridgeInjector.ts` - Phase 2
- `src/runtime/MultiContextBrowser.ts` - Phases 3-6
- `src/runtime/types.ts` - Phase 2
- `src/browser/types/bridge.ts` - Phase 4

### Debugging Tips

**Phase 0 fails**: Check CDP session is connected, Chrome version is recent

**Phase 2 fails**: Add logging to event listeners:
```typescript
console.log('Context created for frame:', frameId);
```

**Phase 5 fails**: Log snapshot at each level:
```typescript
console.log('Parent snapshot:', snapshotText);
console.log('Child snapshot:', childSnapshot.text);
console.log('Rewritten:', rewritten);
```

**General**: Use `console.log` liberally, check playwright-report for traces

---

## Congratulations! 🎉

If you've made it through all phases, you now have complete multi-frame support in Verdex MCP!

**What you've built**:
- ✅ Automatic frame discovery and bridge injection
- ✅ Recursive iframe snapshot expansion
- ✅ Frame-aware interaction routing
- ✅ Proper cleanup and error handling
- ✅ Battle-tested event-driven patterns

**Next steps**:
- Test with real Stripe/PayPal checkout flows
- Add performance monitoring
- Consider optional iframe metadata enhancement
- Update documentation and examples

---

*Last updated: November 19, 2025*

