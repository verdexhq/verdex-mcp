# Phase 2: Multi-Frame Bridge - Incremental Migration Plan

**Status**: Planning (After Failed Big Bang Attempt)  
**Created**: November 19, 2025  
**Strategy**: Incremental migration with backward compatibility at every step

---

## Lessons Learned from Failed Attempt

### What Went Wrong ❌

1. **Big Bang Rewrite**: Changed entire BridgeInjector internal structure at once
2. **Breaking Changes**: Method signatures changed without updating consumers first
3. **No Backward Compatibility**: Removed old state variables before new system was proven
4. **Untested Patterns**: Used ManualPromise without isolated unit tests first
5. **State Initialization Mismatch**: New event-driven flow incompatible with existing setup sequence
6. **All Tests Failed**: 20/20 tests broke immediately - no incremental validation

### Why It Failed 💥

```
Old Flow (Working):
  setupAutoInjection() → scalar state → events update state → getBridgeHandle() → works

New Flow (Broken):
  setupAutoInjection() → Map state → events fire → state doesn't exist yet → ManualPromise hangs → fails
```

### Key Insight 💡

**You can't change the data structure AND the control flow AND the API simultaneously.**

You must change ONE thing at a time, with tests passing at each step.

---

## Incremental Migration Strategy

### Core Principle: Dual-Write Pattern

```typescript
// Keep BOTH old and new systems running in parallel
private frameStates = new Map<...>();  // NEW - write to this
private mainFrameId: string | null = null;  // OLD - keep reading from this
private contextId: number | null = null;  // OLD - keep using this
private bridgeObjectId: string | null = null;  // OLD - keep using this

// Gradually migrate reads from old → new
// Only remove old once all consumers use new
```

### Migration Phases

```
Phase 2a: Add Structures (No behavior change)
Phase 2b: Add Optional Parameters (Backward compatible)
Phase 2c: Update Consumers (Still using old internally)
Phase 2d: Dual Write (Old and new both work)
Phase 2e: Switch Reads (Use new, keep old for fallback)
Phase 2f: Remove Old (New is proven, delete legacy)
```

**Tests must pass after EVERY phase.**

---

## Phase 2a: Add New Structures (30 min)

**Goal**: Add new data structures alongside old ones, NO behavior change

### Step 2a.1: Create ManualPromise Utility (WITH TESTS!)

**File**: `src/utils/ManualPromise.ts`

```typescript
/**
 * ManualPromise - A deferred promise that can be resolved/rejected externally.
 * Uses composition (Deferred pattern), NOT inheritance (safer).
 */
export class ManualPromise<T = void> {
  private _resolve!: (value: T) => void;
  private _reject!: (error: Error) => void;
  private _isDone = false;
  public readonly promise: Promise<T>;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
  }

  resolve(value: T): void {
    if (this._isDone) return;
    this._isDone = true;
    this._resolve(value);
  }

  reject(error: Error): void {
    if (this._isDone) return;
    this._isDone = true;
    this._reject(error);
  }

  isDone(): boolean {
    return this._isDone;
  }
}
```

**CRITICAL**: Test this BEFORE using it:

**File**: `tests/unit/ManualPromise.spec.ts` (NEW)

```typescript
import { describe, it, expect } from '@jest/globals';
import { ManualPromise } from '../../src/utils/ManualPromise';

describe('ManualPromise', () => {
  it('should resolve externally', async () => {
    const mp = new ManualPromise<string>();
    
    setTimeout(() => mp.resolve('done'), 10);
    
    const result = await mp.promise;
    expect(result).toBe('done');
    expect(mp.isDone()).toBe(true);
  });

  it('should reject externally', async () => {
    const mp = new ManualPromise<string>();
    
    setTimeout(() => mp.reject(new Error('failed')), 10);
    
    await expect(mp.promise).rejects.toThrow('failed');
    expect(mp.isDone()).toBe(true);
  });

  it('should ignore multiple resolves', () => {
    const mp = new ManualPromise<string>();
    
    mp.resolve('first');
    mp.resolve('second'); // Should be ignored
    
    expect(mp.isDone()).toBe(true);
  });

  it('should work with error indicator pattern', async () => {
    const mp = new ManualPromise<{success: boolean, error?: string}>();
    
    mp.resolve({ success: false, error: 'Navigation occurred' });
    
    const result = await mp.promise;
    expect(result.success).toBe(false);
    expect(result.error).toBe('Navigation occurred');
  });
});
```

**Test Command**:
```bash
npm test -- tests/unit/ManualPromise.spec.ts
```

**Gate**: ManualPromise tests must pass before proceeding.

### Step 2a.2: Add Type Definitions

**File**: `src/runtime/types.ts`

```typescript
// ADD these types (don't change RoleContext yet!)

export type RefIndexEntry = {
  frameId: string;
  localRef: string;
};

export type GlobalRefIndex = Map<string, RefIndexEntry>;

// NEW: Result type for context readiness
export type ContextResult = 
  | { success: true }
  | { success: false; error: string; frameId: string };
```

**Don't touch RoleContext yet** - we'll add fields later when consumers are ready.

### Step 2a.3: Add New State to BridgeInjector (NO LOGIC CHANGES)

**File**: `src/runtime/BridgeInjector.ts`

```typescript
import { ManualPromise } from '../utils/ManualPromise.js';
import type { ContextResult } from './types.js';

// NEW: Frame state structure
type FrameState = {
  frameId: string;
  contextId: number;
  bridgeObjectId: string;
  contextReadyPromise: ManualPromise<ContextResult>;
};

export class BridgeInjector {
  private worldName: string;
  private config: BridgeConfig;

  // NEW: Multi-frame state (UNUSED for now)
  private frameStates = new Map<CDPSession, Map<string, FrameState>>();
  
  // OLD: Keep all existing state (STILL IN USE)
  private mainFrameId: string | null = null;
  private contextId: number | null = null;
  private bridgeObjectId: string | null = null;
  private contextReadyResolvers: Array<() => void> = [];
  private scriptId: string | null = null;
  private manualInjectionMode = false;
  private listeners: Array<{ event: string; handler: Function }> = [];

  // ... rest unchanged
}
```

**No logic changes!** Just adding fields.

### Step 2a.4: Test

```bash
npm run build  # Should compile
npm test       # ALL TESTS SHOULD STILL PASS
```

**Gate**: ✅ All 20 existing tests pass, build succeeds

**Commit Point**: `git commit -m "Phase 2a: Add multi-frame structures (no behavior change)"`

---

## Phase 2b: Add Optional Parameters (1 hour)

**Goal**: Make methods accept `frameId` parameter, but default to old behavior

### Step 2b.1: Update BridgeInjector Method Signatures

**File**: `src/runtime/BridgeInjector.ts`

Update these methods to accept OPTIONAL `frameId`:

```typescript
async getBridgeHandle(cdp: CDPSession, frameId?: string): Promise<string> {
  // DEFAULT to old behavior
  if (!frameId) {
    // Use legacy scalar state
    if (this.bridgeObjectId) {
      const alive = await this.healthCheck(cdp);
      if (alive) return this.bridgeObjectId;
      this.bridgeObjectId = null;
    }
    
    // ... rest of OLD logic unchanged
  }
  
  // TODO: New multi-frame logic (not implemented yet)
  throw new Error('Multi-frame not yet implemented');
}

async callBridgeMethod<T = any>(
  cdp: CDPSession,
  method: string,
  args: any[] = [],
  frameId?: string  // NEW OPTIONAL PARAMETER
): Promise<T> {
  // Still calls getBridgeHandle with undefined → old behavior
  const objectId = await this.getBridgeHandle(cdp, frameId);
  
  // ... rest unchanged
}

async healthCheck(cdp: CDPSession, frameId?: string): Promise<boolean> {
  // DEFAULT to old behavior
  if (!frameId) {
    try {
      if (!this.contextId) return false;
      // ... OLD logic
    } catch {
      return false;
    }
  }
  
  // TODO: New multi-frame logic
  throw new Error('Multi-frame not yet implemented');
}
```

**Key Point**: Adding optional parameters is **non-breaking**. Old code still works.

### Step 2b.2: Test

```bash
npm run build
npm test  # ALL TESTS SHOULD STILL PASS (using old code path)
```

**Gate**: ✅ All tests pass

**Commit Point**: `git commit -m "Phase 2b: Add optional frameId parameters (backward compatible)"`

---

## Phase 2c: Update Consumers to Pass frameId (1-2 hours)

**Goal**: Make MultiContextBrowser pass `mainFrameId` explicitly, BEFORE changing internals

### Step 2c.1: Update MultiContextBrowser Call Sites

**File**: `src/runtime/MultiContextBrowser.ts`

Find every call to BridgeInjector methods and add `mainFrameId`:

```typescript
// In snapshot() method:
const result = await context.bridgeInjector.callBridgeMethod<Snapshot>(
  context.cdpSession,
  "snapshot",
  [],
  context.mainFrameId  // ADD THIS EVERYWHERE
);

// In click() method:
await context.bridgeInjector.callBridgeMethod(
  context.cdpSession,
  "click",
  [ref],
  context.mainFrameId  // ADD THIS
);

// In type() method:
await context.bridgeInjector.callBridgeMethod(
  context.cdpSession,
  "type",
  [ref, text],
  context.mainFrameId  // ADD THIS
);

// In resolve_container():
return await context.bridgeInjector.callBridgeMethod(
  context.cdpSession,
  "resolve_container",
  [ref],
  context.mainFrameId  // ADD THIS
);

// In inspect_pattern():
return await context.bridgeInjector.callBridgeMethod(
  context.cdpSession,
  "inspect_pattern",
  [ref, ancestorLevel],
  context.mainFrameId  // ADD THIS
);

// In extract_anchors():
return await context.bridgeInjector.callBridgeMethod(
  context.cdpSession,
  "extract_anchors",
  [ref, ancestorLevel],
  context.mainFrameId  // ADD THIS
);

// In ensureBridgeForContext():
await context.bridgeInjector.getBridgeHandle(
  context.cdpSession,
  context.mainFrameId  // ADD THIS
);

const healthy = await context.bridgeInjector.healthCheck(
  context.cdpSession,
  context.mainFrameId  // ADD THIS
);
```

**Use grep to find all call sites**:
```bash
grep -n "callBridgeMethod" src/runtime/MultiContextBrowser.ts
grep -n "getBridgeHandle" src/runtime/MultiContextBrowser.ts
grep -n "healthCheck" src/runtime/MultiContextBrowser.ts
```

### Step 2c.2: Test

```bash
npm run build
npm test  # ALL TESTS SHOULD STILL PASS (still using old code path)
```

**Why this works**: BridgeInjector checks `if (!frameId)` and uses old logic. But now we're passing `mainFrameId`, so we're testing the **parameter passing** works before changing internals.

**Gate**: ✅ All tests pass

**Commit Point**: `git commit -m "Phase 2c: Update consumers to pass mainFrameId explicitly"`

---

## Phase 2d: Implement Dual-Write (2-3 hours)

**Goal**: Write to BOTH old and new state, read from old (safest transition point)

### Step 2d.1: Update Event Listeners to Dual-Write

**File**: `src/runtime/BridgeInjector.ts`

In `setupAutoInjection()`, update the context creation listener:

```typescript
const onCtx = (evt: any) => {
  const ctx = evt.context;
  const frameId = ctx.auxData?.frameId;
  const aux = ctx.auxData ?? {};
  const matchesWorld = ctx.name === this.worldName || aux.name === this.worldName;
  const matchesTop = !this.mainFrameId || aux.frameId === this.mainFrameId;
  
  if (matchesWorld && matchesTop) {
    // OLD: Update scalar state (KEEP THIS)
    this.contextId = ctx.id;
    this.resolveContextReady();
    
    // NEW: Also update map state (DUAL WRITE)
    if (frameId) {
      const state = this.getOrCreateFrameState(cdp, frameId);
      state.contextId = ctx.id;
      state.contextReadyPromise.resolve({ success: true });
    }
  }
};
```

**Key**: Both old AND new state are updated. Tests still use old state.

### Step 2d.2: Add Helper Methods for New State

Add these methods (they won't be called yet):

```typescript
private getFrameState(cdp: CDPSession, frameId: string): FrameState | undefined {
  return this.frameStates.get(cdp)?.get(frameId);
}

private getOrCreateFrameState(cdp: CDPSession, frameId: string): FrameState {
  let state = this.getFrameState(cdp, frameId);
  if (state) return state;
  
  state = {
    frameId,
    contextId: 0,
    bridgeObjectId: '',
    contextReadyPromise: new ManualPromise<ContextResult>(),
  };
  
  if (!this.frameStates.has(cdp)) {
    this.frameStates.set(cdp, new Map());
  }
  this.frameStates.get(cdp)!.set(frameId, state);
  
  return state;
}
```

### Step 2d.3: Test

```bash
npm run build
npm test  # Should still pass (still reading from old state)
```

**Gate**: ✅ Tests pass

**Commit Point**: `git commit -m "Phase 2d: Dual-write to old and new state"`

---

## Phase 2e: Switch to Reading from New State (2-3 hours)

**Goal**: Implement new logic in methods, but keep old state as fallback

### Step 2e.1: Implement Multi-Frame getBridgeHandle

```typescript
async getBridgeHandle(cdp: CDPSession, frameId?: string): Promise<string> {
  if (!frameId) {
    frameId = this.mainFrameId!;
  }
  
  // Try NEW path first
  const state = this.getFrameState(cdp, frameId);
  if (state && state.contextReadyPromise.isDone() && state.bridgeObjectId) {
    return state.bridgeObjectId;
  }
  
  // FALLBACK to OLD path if new state doesn't exist
  if (frameId === this.mainFrameId && this.bridgeObjectId) {
    const alive = await this.healthCheck(cdp, frameId);
    if (alive) return this.bridgeObjectId;
    this.bridgeObjectId = null;
  }
  
  // Use old initialization logic
  await this.waitForContextReady();
  if (!this.contextId) {
    throw new Error("No execution context available");
  }
  
  // ... rest of OLD bridge creation logic
  
  // DUAL WRITE: Update new state too
  if (state) {
    state.bridgeObjectId = this.bridgeObjectId!;
  }
  
  return this.bridgeObjectId!;
}
```

**Key**: Try new state first, fall back to old if not found. Still dual-writing.

### Step 2e.2: Test Incrementally

After each method update, test:

```bash
npm run build
npm test -- tests/bridge-lifecycle.spec.ts:30  # Test single test first
npm test -- tests/bridge-lifecycle.spec.ts     # Then all tests
```

### Step 2e.3: Update Other Methods Similarly

Update `healthCheck`, `callBridgeMethod` (already done in Step 2e.1).

**Gate**: ✅ All tests pass using new state, with old state as fallback

**Commit Point**: `git commit -m "Phase 2e: Switch to reading from new state with old fallback"`

---

## Phase 2f: Add Frame Lifecycle Events (1-2 hours)

**Goal**: Add new functionality (frameAttached, frameDetached) now that base works

### Step 2f.1: Add New Event Listeners

```typescript
// In setupAutoInjection(), add:

const onFrameAttached = async (evt: any) => {
  try {
    // Only process if we're tracking multi-frame state
    const state = this.getFrameState(cdp, evt.frameId);
    if (!state) {
      // Create state for new frame
      await this.ensureFrameState(cdp, evt.frameId);
    }
  } catch (error) {
    console.warn(`Failed to inject into new frame ${evt.frameId}:`, error);
  }
};

const onFrameDetached = (evt: any) => {
  const sessionStates = this.frameStates.get(cdp);
  if (sessionStates) {
    sessionStates.delete(evt.frameId);
  }
};

this.addListener(cdp, "Page.frameAttached", onFrameAttached);
this.addListener(cdp, "Page.frameDetached", onFrameDetached);
```

### Step 2f.2: Implement ensureFrameState

```typescript
async ensureFrameState(cdp: CDPSession, frameId: string): Promise<FrameState> {
  let state = this.getFrameState(cdp, frameId);
  
  if (state?.contextReadyPromise.isDone() && state.bridgeObjectId) {
    return state;
  }
  
  if (state) {
    const result = await state.contextReadyPromise.promise;
    if (!result.success) {
      throw new Error(result.error);
    }
    return state;
  }
  
  state = this.getOrCreateFrameState(cdp, frameId);
  
  try {
    await cdp.send('Page.createIsolatedWorld', {
      frameId,
      worldName: this.worldName,
      grantUniveralAccess: false,
    });
    
    const result = await state.contextReadyPromise.promise;
    if (!result.success) {
      throw new Error(result.error);
    }
    
    // Inject bundle
    const { result: evalResult } = await cdp.send('Runtime.evaluate', {
      expression: BRIDGE_BUNDLE,
      contextId: state.contextId,
      returnByValue: false,
    });
    
    if (!evalResult.objectId) {
      throw new Error('Bridge did not return an object');
    }
    
    state.bridgeObjectId = evalResult.objectId;
    return state;
  } catch (error) {
    const sessionStates = this.frameStates.get(cdp);
    if (sessionStates) {
      sessionStates.delete(frameId);
    }
    throw error;
  }
}
```

### Step 2f.3: Test

```bash
npm run build
npm test
```

**Gate**: ✅ Tests pass with frame lifecycle handling

**Commit Point**: `git commit -m "Phase 2f: Add frame lifecycle event handling"`

---

## Phase 2g: Remove Old State (30 min)

**Goal**: Clean up legacy code once new system is proven

### Step 2g.1: Remove Scalar State Variables

```typescript
export class BridgeInjector {
  // DELETE these:
  // private mainFrameId: string | null = null;  // ← DELETE (keep for compatibility)
  // private contextId: number | null = null;  // ← DELETE
  // private bridgeObjectId: string | null = null;  // ← DELETE
  // private contextReadyResolvers: Array<() => void> = [];  // ← DELETE
  
  // KEEP mainFrameId for legacy API compatibility
  private mainFrameId: string | null = null;
  
  // KEEP these:
  private frameStates = new Map<...>();
  private scriptId: string | null = null;
  private manualInjectionMode = false;
  private listeners: Array<...>();
}
```

### Step 2g.2: Remove Old Methods

Delete:
- `waitForContextReady()` - replaced by ManualPromise
- `resolveContextReady()` - replaced by ManualPromise.resolve()
- Old fallback logic in `getBridgeHandle()`

### Step 2g.3: Test

```bash
npm run build
npm test
```

**Gate**: ✅ All tests pass without old state

**Commit Point**: `git commit -m "Phase 2g: Remove legacy scalar state (multi-frame complete)"`

---

## Success Criteria for Phase 2

Before marking Phase 2 complete:

- [ ] All 20 existing bridge-lifecycle tests pass
- [ ] All Phase 0 CDP validation tests pass
- [ ] All Phase 1 iframe marker tests pass
- [ ] ManualPromise unit tests pass
- [ ] No TypeScript compilation errors
- [ ] Build succeeds
- [ ] Can call methods with or without frameId parameter
- [ ] Main frame still works exactly as before
- [ ] Ready to add frame discovery in Phase 3

---

## Testing Strategy at Each Step

### After Every Commit:

```bash
# 1. Build
npm run build

# 2. Quick test (single test)
npm test -- tests/bridge-lifecycle.spec.ts:30

# 3. Bridge tests
npm test -- tests/bridge-lifecycle.spec.ts

# 4. All tests
npm test

# 5. If all pass, commit
git add -A
git commit -m "..."
```

### If Tests Fail:

1. **DON'T PROCEED** - fix immediately
2. Check TypeScript compilation errors first
3. Add console.log to understand what's breaking
4. Revert if can't fix in 15 minutes: `git reset --hard HEAD`
5. Rethink approach

---

## Rollback Plan

### If Phase 2a-2c Fails:
```bash
git reset --hard HEAD  # Lose uncommitted changes
```

### If Phase 2d-2e Fails:
```bash
git revert <commit-hash>  # Revert specific commit
```

### Nuclear Option:
```bash
git checkout HEAD~5  # Go back 5 commits
git branch -D feature/multi-frame-support
git checkout -b feature/multi-frame-support-v2
```

---

## Time Estimates (Conservative)

| Phase | Task | Time | Cumulative |
|-------|------|------|------------|
| 2a.1 | ManualPromise + tests | 30 min | 0.5h |
| 2a.2 | Type definitions | 10 min | 0.7h |
| 2a.3 | Add state fields | 10 min | 0.8h |
| 2a.4 | Test & commit | 10 min | 1h |
| 2b | Add optional params | 1h | 2h |
| 2c | Update consumers | 1-2h | 3-4h |
| 2d | Dual-write logic | 2-3h | 5-7h |
| 2e | Switch to new state | 2-3h | 7-10h |
| 2f | Frame lifecycle | 1-2h | 8-12h |
| 2g | Remove old state | 30min | 8.5-12.5h |
| **Total** | | **8.5-12.5h** | **1.5-2 days** |

Add 25% buffer for debugging: **10-16 hours total**

---

## Key Differences from Failed Attempt

| Aspect | Failed Approach | Incremental Approach |
|--------|----------------|---------------------|
| **State Changes** | All at once | One at a time |
| **Compatibility** | Breaking changes | Backward compatible |
| **Testing** | At the end | After every step |
| **Fallback** | None | Old code as fallback |
| **Risk** | All-or-nothing | Minimal at each step |
| **Debugging** | Hard (everything broken) | Easy (one change) |
| **Rollback** | Lose all work | Revert one commit |
| **Confidence** | Low | High |

---

## Next Steps After Phase 2

Once Phase 2 is complete and committed:

1. **Phase 3**: Frame Discovery (1-2 hours)
   - Add `discoverAndInjectFrames()` in MultiContextBrowser
   - Call after navigation
   - Tests: All frames have bridges after `navigate()`

2. **Phase 4**: Frame Resolution (1 hour)
   - Add `resolveFrameFromRef()` method
   - Use CDP `DOM.describeNode`
   - Tests: Can map iframe refs to frameIds

3. **Phase 5**: Snapshot Expansion (2-3 hours)
   - Recursive iframe content merging
   - Ref rewriting (eN → fX_eN)
   - Tests: Multi-frame snapshots work

4. **Phase 6**: Interaction Routing (2-3 hours)
   - Parse global refs
   - Route to correct frame
   - Tests: Can click/type in iframes

---

## Conclusion

**The incremental approach is slower but MUCH safer.**

- Each step is testable
- Each commit is shippable
- Rollback is easy
- Debugging is trivial
- Confidence is high

**Key Rule**: If tests don't pass, don't proceed. Fix or revert.

---

*Last updated: November 19, 2025*
*Status: Ready to implement*

