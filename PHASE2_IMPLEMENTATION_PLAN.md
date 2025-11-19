## Phase 2: Multi-Frame Bridge (5-7 hours)

**Risk**: 🔴 **HIGHEST IMPLEMENTATION RISK** - Most complex changes  
**Goal**: Make BridgeInjector track bridges for multiple frames

### Testing Strategy

This phase has **3 critical breaking points** where existing functionality could break:

1. **Step 2.3-2.4**: Changing core state + event listeners
2. **Step 2.6**: Changing method signatures  
3. **Step 2.7**: Updating all call sites

**Mitigation**: 
- Run `npm test -- tests/bridge-lifecycle.spec.ts` after EACH risky change
- Keep old state in parallel until new state is proven working (Step 2.3a)
- Update event listeners incrementally (Steps 2.4a, 2.4b)
- Update methods one at a time with immediate testing (Steps 2.6a-d)
- Update call sites with testing after each method (Step 2.7b)

**Safety Net**: If anything breaks, revert the last change and re-test smaller chunks.

---

### Step 2.1: Add ManualPromise Utility (15 min)
**Risk**: 🟢 LOW - New file, no dependencies

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

**Test immediately**:

```bash
npm run build
node -e "
const { ManualPromise } = require('./dist/utils/ManualPromise.js');
const mp = new ManualPromise();
setTimeout(() => mp.resolve(), 10);
mp.then(() => console.log('✓ ManualPromise works'));
"
```

**Gate**: ManualPromise resolves correctly → Proceed to 2.2

---

### Step 2.2: Add Type Definitions (5 min)
**Risk**: 🟢 LOW - Additive changes only

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

**Test immediately**:

```bash
npm run build
npm test -- tests/bridge-lifecycle.spec.ts
```

**Gate**: Build succeeds, all existing tests pass → Proceed to 2.3

---

### Step 2.3: Convert BridgeInjector State (1-2 hours)
**Risk**: 🔴 CRITICAL - Replacing core state management

⚠️ **BREAKING POINT**: This changes fundamental state structure. Must be done incrementally.

**File**: `src/runtime/BridgeInjector.ts`

#### Step 2.3a: Add FrameState type and helpers (keep old state!)

**At the top**, add import:

```typescript
import { ManualPromise } from '../utils/ManualPromise';
```

**Add NEW state alongside old state** (DON'T delete old state yet):

```typescript
// KEEP EXISTING:
// private mainFrameId: string | null = null;
// private contextId: number | null = null;
// private bridgeObjectId: string | null = null;

// ADD NEW (parallel state for testing):
type FrameState = {
  frameId: string;
  contextId: number;
  bridgeObjectId: string;
  contextReadyPromise: ManualPromise<void>;
};

private frameStates = new Map<CDPSession, Map<string, FrameState>>();
```

**Add helper methods** at the end of the class:

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

**Test immediately**:

```bash
npm run build
npm test -- tests/bridge-lifecycle.spec.ts
```

**Gate**: Build compiles, existing tests still pass → Proceed to 2.4

---

### Step 2.4: Update Event Listeners (2-3 hours)
**Risk**: 🔴 CRITICAL - Modifying event handling that drives bridge injection

⚠️ **BREAKING POINT**: Event listeners control bridge lifecycle. Test incrementally.

**File**: `src/runtime/BridgeInjector.ts`

#### Step 2.4a: Update executionContextCreated to populate NEW state (keep old logic!)

Find the `Runtime.executionContextCreated` listener (around line 40) and **add to it** (keep existing logic):

```typescript
const onCtx = (evt: any) => {
  const ctx = evt.context;
  const frameId = ctx.auxData?.frameId;
  if (!frameId) return;
  
  const matchesWorld = ctx.name === this.worldName || 
                       ctx.auxData.name === this.worldName;
  
  if (matchesWorld) {
    // KEEP EXISTING OLD LOGIC HERE (mainFrameId assignment, etc.)
    
    // ADD NEW: Also populate frameStates map
    const frameState = this.getOrCreateFrameState(cdp, frameId);
    frameState.contextId = ctx.id;
    frameState.contextReadyPromise.resolve();
  }
};
```

**Test immediately**:

```bash
npm run build
npm test -- tests/bridge-lifecycle.spec.ts
```

**Gate**: Old logic still works, new state also populates → Proceed to 2.4b

#### Step 2.4b: Add frame lifecycle listeners

**Add new listeners** after existing ones:

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

**Test immediately**:

```bash
npm run build
npm test -- tests/bridge-lifecycle.spec.ts
npm test -- tests/navigation-lifecycle.spec.ts
```

**Gate**: Listeners don't break existing functionality → Proceed to 2.5

---

### Step 2.5: Add ensureFrameState Method (1-2 hours)
**Risk**: 🟡 MEDIUM - New critical method, but doesn't break existing code yet

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

**Test immediately**:

```bash
npm run build
# Quick manual test that method compiles and can be called
npm test -- tests/bridge-lifecycle.spec.ts
```

**Gate**: Code compiles, method exists → Proceed to 2.6

---

### Step 2.6: Update Method Signatures (1 hour)
**Risk**: 🔴 CRITICAL - Changing ALL public method signatures

⚠️ **BREAKING POINT**: This will break all call sites. Must update methods AND their call sites together.

**Strategy**: Update one method at a time, test, then update its call sites, test again.

#### Step 2.6a: Update getBridgeHandle + test

```typescript
async getBridgeHandle(cdp: CDPSession, frameId: string): Promise<string> {
  const state = await this.ensureFrameState(cdp, frameId);
  return state.bridgeObjectId;
}
```

**Don't update call sites yet.** Just add the parameter, TypeScript will show errors.

**Test**:

```bash
npm run build 2>&1 | grep "getBridgeHandle"  # See what needs updating
```

#### Step 2.6b: Update injectOnceIntoCurrentDoc + call sites

```typescript
async injectOnceIntoCurrentDoc(
  cdp: CDPSession,
  frameId: string
): Promise<void> {
  await this.ensureFrameState(cdp, frameId);
}
```

Find all call sites in `MultiContextBrowser.ts` and add `context.mainFrameId`.

**Test immediately**:

```bash
npm run build
npm test -- tests/bridge-lifecycle.spec.ts
```

**Gate**: injectOnceIntoCurrentDoc works → Proceed to 2.6c

#### Step 2.6c: Update callBridgeMethod signature

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

**Don't update call sites yet** - do that in Step 2.7.

**Test**:

```bash
npm run build 2>&1 | grep "callBridgeMethod"  # Document all call sites
```

#### Step 2.6d: Update healthCheck

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

**Gate**: Compiles → Proceed to 2.7

---

### Step 2.7: Update Call Sites (30 min)
**Risk**: 🔴 CRITICAL - All bridge operations will break until this is complete

⚠️ **BREAKING POINT**: Do this in one focused session. Test after each file.

**File**: `src/runtime/MultiContextBrowser.ts`

#### Step 2.7a: Grep for all callBridgeMethod calls

```bash
grep -n "callBridgeMethod" src/runtime/MultiContextBrowser.ts
```

Document each location and what method it's in.

#### Step 2.7b: Update each call site systematically

For EACH method in MultiContextBrowser that calls `callBridgeMethod`:

```typescript
// In snapshot() method:
const result = await context.bridgeInjector.callBridgeMethod<Snapshot>(
  context.cdpSession,
  "snapshot",
  [],
  context.mainFrameId  // ADD THIS
);

// Repeat for: click(), type(), resolve_container(), getAllInteractiveElements(), etc.
```

**IMPORTANT**: For now, just add `context.mainFrameId` to all calls. We'll update these properly in Phase 6.

**Test after EACH method update**:

```bash
npm run build
npm test -- tests/bridge-lifecycle.spec.ts
```

If any test fails, fix that method before proceeding to next.

**Gate**: ALL existing tests pass → Proceed to 2.8

---

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

### Step 2.9: Comprehensive Test Suite

Run ALL tests to ensure nothing broke:

```bash
# First: ALL existing tests must still pass
npm test -- tests/bridge-lifecycle.spec.ts
npm test -- tests/navigation-lifecycle.spec.ts
npm test -- tests/snapshot-generator.spec.ts
npm test -- tests/mcp-server-integration.spec.ts

# Then: New multi-frame tests
npm test -- tests/multi-frame-bridge.spec.ts
```

**Gate**: All tests pass → Proceed to 2.10

---

### Step 2.10: Remove Old State (cleanup)
**Risk**: 🟢 LOW - Old code no longer used, safe to remove

Now that everything works with `frameStates`, remove old state variables from `BridgeInjector.ts`:

```typescript
// DELETE THESE:
// private mainFrameId: string | null = null;
// private contextId: number | null = null;
// private bridgeObjectId: string | null = null;
```

**Test immediately**:

```bash
npm run build
npm test -- tests/bridge-lifecycle.spec.ts
npm test -- tests/multi-frame-bridge.spec.ts
```

**Gate**: All tests still pass → Phase 2 complete

---

### Success Gate ✅

- ✅ **Can inject bridge into child frame** → Proceed to Phase 3
- ✅ **Can track multiple frame states independently** → Proceed to Phase 3
- ✅ **All existing tests pass** → No regressions
- ❌ **Any test fails** → Fix before proceeding to Phase 3

**Time**: 5-7 hours (with incremental testing)
**Output**: BridgeInjector is multi-frame capable, all tests passing

---