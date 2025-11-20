# Step 2.10: Complete Investigation Report
## Old State Variable Removal Analysis

**Date**: Investigation for safe removal of old single-frame state variables  
**Status**: ❌ **NOT SAFE TO DELETE** - Multiple critical issues found  

---

## Executive Summary

The old single-frame state variables **CANNOT be safely deleted yet** because:

1. ✅ **1 method NEVER got updated**: `healthCheck()` still uses old state
2. ✅ **1 method signature incomplete**: `healthCheck()` missing `frameId` parameter
3. ⚠️ **Main frame bootstrap logic** still depends on old state (intentional?)
4. ⚠️ **Old helper methods** (`isTopFrame()`, `waitForContextReady()`, etc.) still active
5. ⚠️ **Fallback injection** (`injectOnceIntoCurrentDoc()`) uses `this.mainFrameId!`

---

## Detailed Analysis

### 1. OLD STATE VARIABLES (Lines 22-27 in BridgeInjector.ts)

```typescript
private mainFrameId: string | null = null;                    // ❌ STILL USED (5 places)
private contextId: number | null = null;                      // ❌ STILL USED (6 places)
private bridgeObjectId: string | null = null;                 // ✅ SAFE TO REMOVE (shadowed)
private contextReadyResolvers: Array<() => void> = [];        // ❌ STILL USED (3 places)
private scriptId: string | null = null;                       // ✅ KEEP (legitimate state)
private manualInjectionMode = false;                          // ✅ KEEP (legitimate state)
```

---

## CRITICAL ISSUE #1: `healthCheck()` Method Never Updated

### Location: Lines 313-326 in BridgeInjector.ts

**Current Signature (WRONG):**
```typescript
async healthCheck(cdp: CDPSession): Promise<boolean>
```

**Expected Signature (from Step 2.6d):**
```typescript
async healthCheck(cdp: CDPSession, frameId: string): Promise<boolean>
```

**Current Implementation (uses OLD state):**
```typescript
async healthCheck(cdp: CDPSession): Promise<boolean> {
  try {
    if (!this.contextId) return false;  // ❌ OLD STATE
    const { result } = await cdp.send("Runtime.evaluate", {
      expression: `(function(){ return globalThis.__VerdexBridgeFactory__?.version === ${JSON.stringify(
        BRIDGE_VERSION
      )}; })()`,
      contextId: this.contextId,  // ❌ OLD STATE
      returnByValue: true,
    });
    return result.value === true;
  } catch {
    return false;
  }
}
```

**Call Site Analysis:**

1. **MultiContextBrowser.ts:255** - Called in `ensureBridgeForContext()`:
   ```typescript
   const healthy = await context.bridgeInjector.healthCheck(
     context.cdpSession  // ❌ Missing frameId parameter!
   );
   ```

**Impact**: TypeScript should be showing an error, but the method signature doesn't require `frameId` yet!

**Required Fix:**
```typescript
async healthCheck(cdp: CDPSession, frameId: string): Promise<boolean> {
  try {
    const state = this.getFrameState(cdp, frameId);
    if (!state?.contextId) return false;
    
    const { result } = await cdp.send("Runtime.evaluate", {
      expression: `(function(){ return globalThis.__VerdexBridgeFactory__?.version === ${JSON.stringify(
        BRIDGE_VERSION
      )}; })()`,
      contextId: state.contextId,
      returnByValue: true,
    });
    return result.value === true;
  } catch {
    return false;
  }
}
```

**Call Site Fix (MultiContextBrowser.ts:255):**
```typescript
const healthy = await context.bridgeInjector.healthCheck(
  context.cdpSession,
  context.mainFrameId  // ADD THIS
);
```

---

## CRITICAL ISSUE #2: Main Frame Bootstrap Logic

### Location: Lines 163-184 in BridgeInjector.ts

The bootstrap logic in `setupAutoInjection()` **still uses old single-frame pattern**:

```typescript
// Line 166-172: OLD promise resolver pattern
let ctxAppeared = false;
try {
  await this.waitForContextReady(500);  // ❌ Uses old contextReadyResolvers
  ctxAppeared = true;
} catch {
  /* timeout */
}

if (!ctxAppeared) await this.injectOnceIntoCurrentDoc(cdp);  // ❌ Uses this.mainFrameId!

// Lines 175-184: Manual injection fallback
if (this.manualInjectionMode) {
  const reinject = async (evt: any) => {
    if (evt.frame && this.isTopFrame(evt.frame.id) && !evt.frame.parentId) {
      try {
        await this.injectOnceIntoCurrentDoc(cdp);  // ❌ Uses this.mainFrameId!
      } catch {}
    }
  };
  this.addListener(cdp, "Page.frameNavigated", reinject);
}
```

**Analysis**: This logic is specifically for **MAIN FRAME ONLY** during initial setup. It's a bootstrap/fallback mechanism.

**Question**: Should this be:
- **Option A**: Converted to use `ensureFrameState(cdp, mainFrameId)`?
- **Option B**: Left as-is for main frame bootstrap, document as "main frame only"?

---

## CRITICAL ISSUE #3: Helper Methods Still Use Old State

### `waitForContextReady()` - Lines 204-225

```typescript
private async waitForContextReady(timeoutMs = 3000): Promise<void> {
  if (this.contextId) return;  // ❌ OLD STATE
  
  let timeoutHandle: NodeJS.Timeout | null = null;
  const p = new Promise<void>((resolve, reject) => {
    const done = () => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolve();
    };
    this.contextReadyResolvers.push(done);  // ❌ OLD STATE
    timeoutHandle = setTimeout(() => {
      reject(
        new Error(
          `Isolated world '${this.worldName}' not ready within ${timeoutMs}ms`
        )
      );
    }, timeoutMs);
  });
  return p;
}
```

**Used by**: Line 166 in `setupAutoInjection()`

### `resolveContextReady()` - Lines 227-230

```typescript
private resolveContextReady() {
  const resolvers = this.contextReadyResolvers.splice(0);  // ❌ OLD STATE
  resolvers.forEach((fn) => fn());
}
```

**Used by**: Line 64 in `onCtx` event listener

### `isTopFrame()` - Lines 200-202

```typescript
private isTopFrame(frameId?: string): boolean {
  return !!this.mainFrameId && frameId === this.mainFrameId;  // ❌ OLD STATE
}
```

**Used by**:
- Line 78 in `onSameDoc` event listener
- Line 93 in `onCrossDocNav` event listener
- Line 177 in manual injection fallback

### `injectOnceIntoCurrentDoc()` - Lines 187-198

```typescript
private async injectOnceIntoCurrentDoc(cdp: CDPSession): Promise<void> {
  const { executionContextId } = await cdp.send("Page.createIsolatedWorld", {
    frameId: this.mainFrameId!,  // ❌ OLD STATE (non-null assertion!)
    worldName: this.worldName,
    grantUniveralAccess: false,
  });
  await cdp.send("Runtime.evaluate", {
    expression: BRIDGE_BUNDLE,
    contextId: executionContextId,
    returnByValue: false,
  });
}
```

**Used by**:
- Line 172 in `setupAutoInjection()` bootstrap
- Line 179 in manual injection fallback

---

## CRITICAL ISSUE #4: Old Event Listeners Still Populate Old State

### `onCtx` Event Listener (Lines 53-73)

```typescript
const onCtx = (evt: any) => {
  const ctx = evt.context;
  const aux = ctx.auxData ?? {};
  const frameId = aux.frameId;
  const matchesWorld =
    ctx.name === this.worldName || aux.name === this.worldName;
  const matchesTop = !this.mainFrameId || frameId === this.mainFrameId;  // ❌ Uses OLD

  if (matchesWorld && matchesTop) {
    // KEEP EXISTING: Old single-frame logic
    this.contextId = ctx.id;  // ❌ STILL POPULATING OLD STATE
    this.resolveContextReady();  // ❌ STILL CALLING OLD METHOD
  }

  // ADD NEW: Also populate frameStates map for any frame with our world
  if (matchesWorld && frameId) {
    const frameState = this.getOrCreateFrameState(cdp, frameId);
    frameState.contextId = ctx.id;
    frameState.contextReadyPromise.resolve();
  }
};
```

**Analysis**: Currently maintains BOTH old and new state in parallel (intentional from Step 2.4a).

### `onSameDoc` Event Listener (Lines 77-88)

```typescript
const onSameDoc = (evt: any) => {
  if (this.isTopFrame(evt.frameId)) {  // ❌ Uses OLD helper
    this.bridgeObjectId = null;  // ❌ OLD state
  }

  // NEW: For multi-frame, invalidate bridge instance for navigated frame
  const sessionStates = this.frameStates.get(cdp);
  const state = sessionStates?.get(evt.frameId);
  if (state) {
    state.bridgeObjectId = ""; // Clear cached instance, keep context
  }
};
```

**Analysis**: Maintains both old and new state.

### `onCrossDocNav` Event Listener (Lines 92-105)

```typescript
const onCrossDocNav = (evt: any) => {
  if (evt.frame && this.isTopFrame(evt.frame.id) && !evt.frame.parentId) {  // ❌ Uses OLD helper
    // Cross-document navigation destroys and recreates execution contexts
    // Reset our state; Runtime.executionContextCreated will fire with new context
    this.contextId = null;  // ❌ OLD state
    this.bridgeObjectId = null;  // ❌ OLD state

    // NEW: Also clear multi-frame state for navigated frame
    const sessionStates = this.frameStates.get(cdp);
    if (sessionStates) {
      sessionStates.delete(evt.frame.id);
    }
  }
};
```

**Analysis**: Maintains both old and new state.

---

## CRITICAL ISSUE #5: Constructor Still Accepts `mainFrameId`

### Location: Lines 36-37 in BridgeInjector.ts

```typescript
constructor(options: InjectorOptions = {}) {
  this.worldName = options.worldName ?? "verdex_isolated";
  this.config = options.config ?? {};
  if (options.mainFrameId) this.mainFrameId = options.mainFrameId;  // ❌ SETS OLD STATE
}
```

**Call Site**: MultiContextBrowser.ts:135-139
```typescript
const bridgeInjector = new BridgeInjector({
  worldName: `verdex_${role}_${salt}`,
  config: this.bridgeConfig,
  mainFrameId,  // ❌ PASSING mainFrameId to constructor
});
```

**Analysis**: The constructor accepts `mainFrameId` and stores it. This is later used by `setupAutoInjection()`.

---

## CRITICAL ISSUE #6: `reset()` Method Still Uses Old State

### Location: Lines 329-332 in BridgeInjector.ts

```typescript
reset(): void {
  this.contextId = null;  // ❌ OLD state
  this.bridgeObjectId = null;  // ❌ OLD state
}
```

**Call Sites**: None found in codebase!

**Analysis**: This method is NOT called anywhere. It's a public method but unused. Should be removed or updated.

---

## Variables That Are SAFE to Keep

### `scriptId` (Line 26)

```typescript
private scriptId: string | null = null;
```

**Usage**: Tracks the auto-injected script identifier for cleanup in `dispose()`.  
**Status**: ✅ **LEGITIMATE STATE** - Not frame-specific, applies to entire CDP session.

### `manualInjectionMode` (Line 27)

```typescript
private manualInjectionMode = false;
```

**Usage**: Fallback flag for very old Chromium versions that don't support modern injection.  
**Status**: ✅ **LEGITIMATE STATE** - Not frame-specific, applies to entire CDP session.

---

## Summary of Required Fixes

### 🔴 CRITICAL (Must Fix Before Deletion)

1. **Fix `healthCheck()` method**:
   - Add `frameId: string` parameter
   - Update implementation to use `getFrameState()`
   - Update call site in MultiContextBrowser.ts:255

2. **Refactor main frame bootstrap** (lines 163-184):
   - Option A: Convert to use `ensureFrameState(cdp, mainFrameId)`
   - Option B: Document as "main frame only" and keep old pattern

3. **Refactor `injectOnceIntoCurrentDoc()`**:
   - Add `frameId: string` parameter (can't use `this.mainFrameId!`)
   - Update call sites (lines 172, 179)

4. **Refactor `isTopFrame()`**:
   - Convert to accept `mainFrameId` as parameter instead of using `this.mainFrameId`
   - OR: Remove if no longer needed

5. **Handle `waitForContextReady()` / `resolveContextReady()`**:
   - Either keep for main frame bootstrap
   - OR: Refactor to use ManualPromise pattern from new code

### 🟡 MEDIUM (Should Fix)

6. **Clean up event listeners** (lines 53-105):
   - Remove old state assignments (`this.contextId = ...`, etc.)
   - Remove old helper calls (`this.isTopFrame()`, etc.)
   - Keep only NEW multi-frame logic

7. **Fix or remove `reset()` method**:
   - Not called anywhere in codebase
   - Either remove it or update to reset `frameStates`

8. **Update constructor**:
   - Remove `mainFrameId` from `InjectorOptions` type
   - Remove line 36 assignment
   - Pass `mainFrameId` to `setupAutoInjection()` instead

### 🟢 LOW (Nice to Have)

9. **Remove `mainFrameId` from InjectorOptions type** (bridge.ts:45):
   ```typescript
   export type InjectorOptions = {
     worldName?: string;
     config?: BridgeConfig;
     mainFrameId?: string;  // ❌ REMOVE THIS
   };
   ```

---

## 📋 INCREMENTAL FIX PLAN (Safest → Riskiest)

**Strategy**: Fix issues one at a time, test after each step, build confidence incrementally.

**Total Estimated Time**: ~2-3 hours

---

### ✅ STEP 1: Fix `healthCheck()` Method (15 minutes)
**Risk**: 🟢 LOW - Most isolated change  
**Files**: `BridgeInjector.ts`, `MultiContextBrowser.ts`

#### Why First?
- Only 1 method to change
- Only 1 call site to update
- No dependencies on other fixes
- Easiest to test and verify

#### Changes Required:

**1a. Update method signature and implementation** (`BridgeInjector.ts:313-326`):

```typescript
// BEFORE:
async healthCheck(cdp: CDPSession): Promise<boolean> {
  try {
    if (!this.contextId) return false;
    const { result } = await cdp.send("Runtime.evaluate", {
      expression: `(function(){ return globalThis.__VerdexBridgeFactory__?.version === ${JSON.stringify(
        BRIDGE_VERSION
      )}; })()`,
      contextId: this.contextId,
      returnByValue: true,
    });
    return result.value === true;
  } catch {
    return false;
  }
}

// AFTER:
async healthCheck(cdp: CDPSession, frameId: string): Promise<boolean> {
  try {
    const state = this.getFrameState(cdp, frameId);
    if (!state?.contextId) return false;
    
    const { result } = await cdp.send("Runtime.evaluate", {
      expression: `(function(){ return globalThis.__VerdexBridgeFactory__?.version === ${JSON.stringify(
        BRIDGE_VERSION
      )}; })()`,
      contextId: state.contextId,
      returnByValue: true,
    });
    return result.value === true;
  } catch {
    return false;
  }
}
```

**1b. Update call site** (`MultiContextBrowser.ts:255`):

```typescript
// BEFORE:
const healthy = await context.bridgeInjector.healthCheck(
  context.cdpSession
);

// AFTER:
const healthy = await context.bridgeInjector.healthCheck(
  context.cdpSession,
  context.mainFrameId
);
```

#### Test Gate:
```bash
npm run build
npm test -- tests/bridge-lifecycle.spec.ts
```

**Gate**: ✅ All tests pass → Proceed to Step 2

---

### ✅ STEP 2: Fix `injectOnceIntoCurrentDoc()` Method (15 minutes)
**Risk**: 🟡 MEDIUM - 2 call sites, both in bootstrap paths  
**Files**: `BridgeInjector.ts`

#### Why Second?
- Still relatively isolated
- Only used in bootstrap/fallback logic
- Mechanical change (add parameter)

#### Changes Required:

**2a. Update method signature** (`BridgeInjector.ts:187-198`):

```typescript
// BEFORE:
private async injectOnceIntoCurrentDoc(cdp: CDPSession): Promise<void> {
  const { executionContextId } = await cdp.send("Page.createIsolatedWorld", {
    frameId: this.mainFrameId!,  // ❌ Non-null assertion!
    worldName: this.worldName,
    grantUniveralAccess: false,
  });
  await cdp.send("Runtime.evaluate", {
    expression: BRIDGE_BUNDLE,
    contextId: executionContextId,
    returnByValue: false,
  });
}

// AFTER:
private async injectOnceIntoCurrentDoc(
  cdp: CDPSession,
  frameId: string
): Promise<void> {
  const { executionContextId } = await cdp.send("Page.createIsolatedWorld", {
    frameId,
    worldName: this.worldName,
    grantUniveralAccess: false,
  });
  await cdp.send("Runtime.evaluate", {
    expression: BRIDGE_BUNDLE,
    contextId: executionContextId,
    returnByValue: false,
  });
}
```

**2b. Update call site #1** (`BridgeInjector.ts:172`):

```typescript
// BEFORE:
if (!ctxAppeared) await this.injectOnceIntoCurrentDoc(cdp);

// AFTER:
if (!ctxAppeared) await this.injectOnceIntoCurrentDoc(cdp, mainFrameId);
```

**2c. Update call site #2** (`BridgeInjector.ts:179`):

```typescript
// BEFORE:
await this.injectOnceIntoCurrentDoc(cdp);

// AFTER:
await this.injectOnceIntoCurrentDoc(cdp, evt.frame.id);
```

#### Test Gate:
```bash
npm run build
npm test -- tests/bridge-lifecycle.spec.ts
npm test -- tests/navigation-lifecycle.spec.ts
```

**Gate**: ✅ All tests pass → Proceed to Step 3

---

### ✅ STEP 3: Fix `isTopFrame()` Helper (20 minutes)
**Risk**: 🟡 MEDIUM - 4 call sites in event listeners  
**Files**: `BridgeInjector.ts`

#### Why Third?
- Affects event listeners but changes are mechanical
- Once fixed, event listeners can be cleaned up

#### Changes Required:

**3a. Update helper method** (`BridgeInjector.ts:200-202`):

```typescript
// BEFORE:
private isTopFrame(frameId?: string): boolean {
  return !!this.mainFrameId && frameId === this.mainFrameId;
}

// AFTER:
private isTopFrame(mainFrameId: string, frameId?: string): boolean {
  return !!mainFrameId && frameId === mainFrameId;
}
```

**3b. Update call site in `onCtx`** (`BridgeInjector.ts:59`):

```typescript
// BEFORE:
const matchesTop = !this.mainFrameId || frameId === this.mainFrameId;

// AFTER:
const matchesTop = !mainFrameId || frameId === mainFrameId;
```

**3c. Update call site in `onSameDoc`** (`BridgeInjector.ts:78`):

```typescript
// BEFORE:
if (this.isTopFrame(evt.frameId)) {

// AFTER:
if (this.isTopFrame(mainFrameId, evt.frameId)) {
```

**3d. Update call site in `onCrossDocNav`** (`BridgeInjector.ts:93`):

```typescript
// BEFORE:
if (evt.frame && this.isTopFrame(evt.frame.id) && !evt.frame.parentId) {

// AFTER:
if (evt.frame && this.isTopFrame(mainFrameId, evt.frame.id) && !evt.frame.parentId) {
```

**3e. Update call site in manual injection fallback** (`BridgeInjector.ts:177`):

```typescript
// BEFORE:
if (evt.frame && this.isTopFrame(evt.frame.id) && !evt.frame.parentId) {

// AFTER:
if (evt.frame && this.isTopFrame(mainFrameId, evt.frame.id) && !evt.frame.parentId) {
```

#### Test Gate:
```bash
npm run build
npm test -- tests/bridge-lifecycle.spec.ts
npm test -- tests/navigation-lifecycle.spec.ts
```

**Gate**: ✅ All tests pass → Proceed to Step 4

---

### ✅ STEP 4: Clean Up Event Listener Old State Assignments (30 minutes)
**Risk**: 🔴 MEDIUM-HIGH - Affects core bridge lifecycle  
**Files**: `BridgeInjector.ts`

#### Why Fourth?
- Now that helpers are fixed, we can safely remove old state writes
- Event listeners already have NEW logic in parallel

#### Changes Required:

**4a. Clean up `onCtx` event listener** (`BridgeInjector.ts:53-73`):

```typescript
// BEFORE:
const onCtx = (evt: any) => {
  const ctx = evt.context;
  const aux = ctx.auxData ?? {};
  const frameId = aux.frameId;
  const matchesWorld =
    ctx.name === this.worldName || aux.name === this.worldName;
  const matchesTop = !mainFrameId || frameId === mainFrameId;

  if (matchesWorld && matchesTop) {
    // KEEP EXISTING: Old single-frame logic
    this.contextId = ctx.id;  // ❌ REMOVE THIS
    this.resolveContextReady();  // ❌ REMOVE THIS
  }

  // ADD NEW: Also populate frameStates map for any frame with our world
  if (matchesWorld && frameId) {
    const frameState = this.getOrCreateFrameState(cdp, frameId);
    frameState.contextId = ctx.id;
    frameState.contextReadyPromise.resolve();
  }
};

// AFTER:
const onCtx = (evt: any) => {
  const ctx = evt.context;
  const aux = ctx.auxData ?? {};
  const frameId = aux.frameId;
  const matchesWorld =
    ctx.name === this.worldName || aux.name === this.worldName;

  // Populate frameStates for any frame with our world
  if (matchesWorld && frameId) {
    const frameState = this.getOrCreateFrameState(cdp, frameId);
    frameState.contextId = ctx.id;
    frameState.contextReadyPromise.resolve();
  }
};
```

**4b. Clean up `onSameDoc` event listener** (`BridgeInjector.ts:77-88`):

```typescript
// BEFORE:
const onSameDoc = (evt: any) => {
  if (this.isTopFrame(mainFrameId, evt.frameId)) {
    this.bridgeObjectId = null;  // ❌ REMOVE THIS
  }

  // NEW: For multi-frame, invalidate bridge instance for navigated frame
  const sessionStates = this.frameStates.get(cdp);
  const state = sessionStates?.get(evt.frameId);
  if (state) {
    state.bridgeObjectId = ""; // Clear cached instance, keep context
  }
};

// AFTER:
const onSameDoc = (evt: any) => {
  // Invalidate bridge instance for navigated frame
  const sessionStates = this.frameStates.get(cdp);
  const state = sessionStates?.get(evt.frameId);
  if (state) {
    state.bridgeObjectId = ""; // Clear cached instance, keep context
  }
};
```

**4c. Clean up `onCrossDocNav` event listener** (`BridgeInjector.ts:92-105`):

```typescript
// BEFORE:
const onCrossDocNav = (evt: any) => {
  if (evt.frame && this.isTopFrame(mainFrameId, evt.frame.id) && !evt.frame.parentId) {
    // Cross-document navigation destroys and recreates execution contexts
    // Reset our state; Runtime.executionContextCreated will fire with new context
    this.contextId = null;  // ❌ REMOVE THIS
    this.bridgeObjectId = null;  // ❌ REMOVE THIS

    // NEW: Also clear multi-frame state for navigated frame
    const sessionStates = this.frameStates.get(cdp);
    if (sessionStates) {
      sessionStates.delete(evt.frame.id);
    }
  }
};

// AFTER:
const onCrossDocNav = (evt: any) => {
  if (evt.frame && !evt.frame.parentId) {
    // Cross-document navigation destroys and recreates execution contexts
    // Clear frame state; Runtime.executionContextCreated will fire with new context
    const sessionStates = this.frameStates.get(cdp);
    if (sessionStates) {
      sessionStates.delete(evt.frame.id);
    }
  }
};
```

#### Test Gate:
```bash
npm run build
npm test -- tests/bridge-lifecycle.spec.ts
npm test -- tests/navigation-lifecycle.spec.ts
npm test -- tests/multi-frame-bridge.spec.ts
```

**Gate**: ✅ All tests pass → Proceed to Step 5

---

### ✅ STEP 5: Refactor Bootstrap Logic (30 minutes)
**Risk**: 🔴 HIGH - Changes initial setup flow  
**Files**: `BridgeInjector.ts`

#### Why Fifth?
- Most complex change
- By now, all helpers are refactored
- Can choose between two approaches

#### Decision Point:

**Option A (RECOMMENDED - Cleaner)**: Use `ensureFrameState()` for main frame
**Option B (Safer)**: Keep old pattern, document as "main frame bootstrap only"

#### Changes Required (Option A):

**5a. Replace bootstrap logic** (`BridgeInjector.ts:163-184`):

```typescript
// BEFORE:
// 4) FALLBACK: if our world hasn't appeared quickly, inject once for current doc
let ctxAppeared = false;
try {
  await this.waitForContextReady(500);  // ❌ OLD PATTERN
  ctxAppeared = true;
} catch {
  /* timeout */
}

if (!ctxAppeared) await this.injectOnceIntoCurrentDoc(cdp, mainFrameId);  // ❌ OLD PATTERN

// 5) Manual reinjection mode ONLY if addScriptToEvaluateOnNewDocument unavailable
if (this.manualInjectionMode) {
  const reinject = async (evt: any) => {
    if (evt.frame && this.isTopFrame(mainFrameId, evt.frame.id) && !evt.frame.parentId) {
      try {
        await this.injectOnceIntoCurrentDoc(cdp, evt.frame.id);
      } catch {}
    }
  };
  this.addListener(cdp, "Page.frameNavigated", reinject);
}

// AFTER:
// 4) FALLBACK: Ensure main frame has bridge injected
try {
  await this.ensureFrameState(cdp, mainFrameId);
} catch (error) {
  // If main frame injection fails, that's a critical error
  throw new Error(
    `Failed to inject bridge into main frame: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
}

// 5) Manual reinjection mode ONLY if addScriptToEvaluateOnNewDocument unavailable
if (this.manualInjectionMode) {
  const reinject = async (evt: any) => {
    if (evt.frame && evt.frame.id === mainFrameId && !evt.frame.parentId) {
      try {
        // Use ensureFrameState for consistency
        await this.ensureFrameState(cdp, evt.frame.id);
      } catch {}
    }
  };
  this.addListener(cdp, "Page.frameNavigated", reinject);
}
```

**5b. Remove now-unused helper methods**:

Delete `waitForContextReady()` (lines 204-225)
Delete `resolveContextReady()` (lines 227-230)
Delete `injectOnceIntoCurrentDoc()` (lines 187-198) - replaced by `ensureFrameState()`

#### Test Gate:
```bash
npm run build
npm test -- tests/bridge-lifecycle.spec.ts
npm test -- tests/navigation-lifecycle.spec.ts
npm test -- tests/multi-frame-bridge.spec.ts
```

**Gate**: ✅ All tests pass → Proceed to Step 6

---

### ✅ STEP 6: Remove Constructor `mainFrameId` Storage (5 minutes)
**Risk**: 🟢 LOW - By now nothing uses it  
**Files**: `BridgeInjector.ts`, `MultiContextBrowser.ts`, `bridge.ts`

#### Why Sixth?
- By now, no code references `this.mainFrameId`
- Safe to remove from constructor
- Can also clean up types

#### Changes Required:

**6a. Remove from constructor** (`BridgeInjector.ts:33-37`):

```typescript
// BEFORE:
constructor(options: InjectorOptions = {}) {
  this.worldName = options.worldName ?? "verdex_isolated";
  this.config = options.config ?? {};
  if (options.mainFrameId) this.mainFrameId = options.mainFrameId;  // ❌ REMOVE
}

// AFTER:
constructor(options: InjectorOptions = {}) {
  this.worldName = options.worldName ?? "verdex_isolated";
  this.config = options.config ?? {};
}
```

**6b. Remove from call site** (`MultiContextBrowser.ts:135-139`):

```typescript
// BEFORE:
const bridgeInjector = new BridgeInjector({
  worldName: `verdex_${role}_${salt}`,
  config: this.bridgeConfig,
  mainFrameId,  // ❌ REMOVE
});

// AFTER:
const bridgeInjector = new BridgeInjector({
  worldName: `verdex_${role}_${salt}`,
  config: this.bridgeConfig,
});
```

**6c. Remove from type definition** (`src/browser/types/bridge.ts:42-46`):

```typescript
// BEFORE:
export type InjectorOptions = {
  worldName?: string;
  config?: BridgeConfig;
  mainFrameId?: string;  // ❌ REMOVE
};

// AFTER:
export type InjectorOptions = {
  worldName?: string;
  config?: BridgeConfig;
};
```

#### Test Gate:
```bash
npm run build
npm test -- tests/bridge-lifecycle.spec.ts
```

**Gate**: ✅ All tests pass → Proceed to Step 7

---

### ✅ STEP 7: Delete Old State Variables (5 minutes)
**Risk**: 🟢 LOW - Nothing uses them anymore  
**Files**: `BridgeInjector.ts`

#### Why Seventh?
- Everything has been refactored
- These variables are now unused
- Final cleanup

#### Changes Required:

**7a. Delete old state variables** (`BridgeInjector.ts:22-25`):

```typescript
// DELETE THESE LINES:
private mainFrameId: string | null = null;
private contextId: number | null = null;
private bridgeObjectId: string | null = null;
private contextReadyResolvers: Array<() => void> = [];
```

**7b. Remove or update `reset()` method** (`BridgeInjector.ts:329-332`):

Since `reset()` is unused (no call sites found), just delete it:

```typescript
// DELETE THIS METHOD:
reset(): void {
  this.contextId = null;
  this.bridgeObjectId = null;
}
```

**7c. Remove `isTopFrame()` helper** (`BridgeInjector.ts:200-202`):

If no longer used after Step 4 cleanup:

```typescript
// DELETE THIS METHOD (if unused):
private isTopFrame(mainFrameId: string, frameId?: string): boolean {
  return !!mainFrameId && frameId === mainFrameId;
}
```

#### Test Gate:
```bash
npm run build
npm test -- tests/bridge-lifecycle.spec.ts
npm test -- tests/navigation-lifecycle.spec.ts
npm test -- tests/multi-frame-bridge.spec.ts
```

**Gate**: ✅ All tests pass → Proceed to Step 8

---

### ✅ STEP 8: Run Complete Test Suite (10 minutes)
**Risk**: 🟢 LOW - Final validation  

#### Run All Tests:

```bash
# Full test suite
npm test

# Specifically verify:
npm test -- tests/bridge-lifecycle.spec.ts
npm test -- tests/navigation-lifecycle.spec.ts
npm test -- tests/multi-frame-bridge.spec.ts
npm test -- tests/snapshot-generator.spec.ts
npm test -- tests/mcp-server-integration.spec.ts
```

#### Success Criteria:

✅ All existing tests pass
✅ No TypeScript compilation errors
✅ No linter warnings
✅ Multi-frame tests pass
✅ Bridge lifecycle intact

---

## 🎯 Progress Tracking

Use this checklist to track progress:

- [ ] **Step 1**: Fix `healthCheck()` method (15 min)
- [ ] **Step 2**: Fix `injectOnceIntoCurrentDoc()` (15 min)
- [ ] **Step 3**: Fix `isTopFrame()` helper (20 min)
- [ ] **Step 4**: Clean event listener old state (30 min)
- [ ] **Step 5**: Refactor bootstrap logic (30 min)
- [ ] **Step 6**: Remove constructor storage (5 min)
- [ ] **Step 7**: Delete old state variables (5 min)
- [ ] **Step 8**: Run complete test suite (10 min)

---

## 📊 Risk Summary

| Step | Risk Level | Why | Mitigation |
|------|-----------|-----|------------|
| 1 | 🟢 LOW | Isolated method | Test immediately |
| 2 | 🟡 MEDIUM | 2 call sites | Both in bootstrap |
| 3 | 🟡 MEDIUM | 4 call sites | Mechanical changes |
| 4 | 🔴 MEDIUM-HIGH | Event listeners | Keep NEW logic |
| 5 | 🔴 HIGH | Bootstrap flow | Use proven pattern |
| 6 | 🟢 LOW | By now unused | Quick change |
| 7 | 🟢 LOW | Final cleanup | Nothing depends |
| 8 | 🟢 LOW | Validation | Catch any issues |

---

## ✅ Conclusion

**Current Status**: ❌ NOT SAFE TO DELETE - Need to complete Steps 1-7 first

**Next Action**: Start with Step 1 (Fix `healthCheck()` method)

**Total Time**: ~2-3 hours for all steps

**Approach**: Incremental (safest), test after each step, build confidence progressively

