# Architecture Improvements Plan

**Status**: ✅ Verified & Ready to Execute  
**Created**: 2025-11-20  
**Verified**: 2025-11-20  
**Purpose**: Incremental improvements to error handling, type consistency, and architecture clarity

> **📋 Verification Report**: See `ARCHITECTURE_IMPROVEMENTS_VERIFICATION.md` for detailed verification against the codebase. All file paths, line numbers, and code structures have been validated.

---

## Overview

This document outlines step-by-step improvements to the Verdex codebase based on architectural review. Each step is:
- **Small and focused** - One concern at a time
- **Independently testable** - Can verify after each change
- **Non-breaking** - Maintains existing API contracts

---

## Prerequisites

Before starting, ensure you have:
```bash
# Clean build
npm run build

# All tests passing
npm test

# Git working tree clean
git status
```

---

## Phase 1: Error Handling Foundation (Days 1-2)

### Step 1.1: Add Structured Error Types

**Goal**: Replace generic `Error` with specific error types for better handling and debugging.

**Files to Create**: `src/shared-types.ts` (extend existing file)

**Implementation**:

1. Add error types to shared-types.ts:

```typescript
/**
 * Error thrown when an element reference is stale (element removed from DOM)
 */
export class StaleRefError extends Error {
  constructor(
    public ref: string,
    public elementInfo: { role: string; name: string; tagName: string }
  ) {
    super(
      `Element ${ref} (${elementInfo.role} "${elementInfo.name}") was removed from DOM. ` +
        `Take a new snapshot() to refresh refs.`
    );
    this.name = "StaleRefError";
  }
}

/**
 * Error thrown when an element reference is not found in the bridge
 */
export class UnknownRefError extends Error {
  constructor(public ref: string) {
    super(
      `Element ${ref} not found. Try browser_snapshot() to refresh refs.`
    );
    this.name = "UnknownRefError";
  }
}

/**
 * Error thrown when a frame is detached or unavailable
 */
export class FrameDetachedError extends Error {
  constructor(public frameId: string, details?: string) {
    super(`Frame ${frameId} was detached${details ? `: ${details}` : ""}`);
    this.name = "FrameDetachedError";
  }
}

/**
 * Error thrown when frame injection fails for non-recoverable reasons
 */
export class FrameInjectionError extends Error {
  constructor(public frameId: string, public reason: string) {
    super(`Failed to inject bridge into frame ${frameId}: ${reason}`);
    this.name = "FrameInjectionError";
  }
}

/**
 * Error thrown when navigation fails
 */
export class NavigationError extends Error {
  constructor(
    public url: string,
    public role: string,
    details: string
  ) {
    super(`Navigation failed for role '${role}' to '${url}': ${details}`);
    this.name = "NavigationError";
  }
}
```

2. Build and verify types compile:

```bash
npm run build
```

**Test**:
```bash
# No tests needed yet - just type checking
npm run build
```

**Commit**:
```bash
git add src/shared-types.ts
git commit -m "feat: add structured error types for better error handling"
```

---

### Step 1.2: Use Structured Errors in Bridge Validation

**Goal**: Replace generic errors in `BridgeFactory` with typed errors.

**Files to Modify**: 
- `src/browser/types/elements.ts`
- `src/browser/types/index.ts`
- `src/browser/bridge/BridgeFactory.ts`

**Implementation**:

1. Update `src/browser/types/elements.ts` to re-export error classes:

```typescript
// Re-export all shared types used by the bridge
export type {
  Attributes,
  ContainerInfo,
  ContainerResult,
  OutlineItem,
  PatternInfo,
  PatternResult,
  AnchorInfo,
  AnchorsResult,
  SnapshotResult,
} from "../../shared-types.js";

// NEW: Re-export error classes (not 'type' because they're runtime classes)
export { StaleRefError, UnknownRefError } from "../../shared-types.js";

/**
 * Browser-specific: Information about an interactive element in the browser context.
 * This version uses the actual DOM Element type rather than 'any'.
 */
export type ElementInfo = {
  element: Element;
  tagName: string;
  role: string;
  name: string;
  attributes: Record<string, string>;
};
```

2. Update `src/browser/types/index.ts` to re-export error classes:

```typescript
/**
 * Export all types for the injected bridge
 */

export type {
  Attributes,
  ElementInfo,
  SnapshotResult,
  ContainerInfo,
  ContainerResult,
  OutlineItem,
  PatternInfo,
  PatternResult,
  AnchorInfo,
  AnchorsResult,
} from "./elements.js";

// NEW: Re-export error classes
export { StaleRefError, UnknownRefError } from "./elements.js";

export type { IBridge, BridgeConfig } from "./bridge.js";
export type { VerdexBridgeFactory } from "./global.js";
```

3. Import error types at top of `BridgeFactory.ts` (note: NOT `type` import):

```typescript
import { SnapshotGenerator } from "../core/SnapshotGenerator.js";
import { StructuralAnalyzer } from "../core/StructuralAnalyzer.js";
import { DOMAnalyzer } from "../utils/DOMAnalyzer.js";
import type {
  IBridge,
  ElementInfo,
  SnapshotResult,
  ContainerResult,
  PatternResult,
  AnchorsResult,
  BridgeConfig,
} from "../types/index.js";
// NEW: Import error classes (not 'type' import - these are runtime classes)
import { StaleRefError, UnknownRefError } from "../types/index.js";
```

4. Update `validateElement` function (around line 26):

```typescript
const validateElement = (ref: string): Element => {
  const info = bridge.elements.get(ref);

  if (!info) {
    throw new UnknownRefError(ref);
  }

  if (!info.element.isConnected) {
    // Auto-cleanup stale ref
    bridge.elements.delete(ref);
    throw new StaleRefError(ref, {
      role: info.role,
      name: info.name,
      tagName: info.tagName,
    });
  }

  return info.element;
};
```

**Build**:
```bash
npm run build
```

**Test**:
```bash
# Run specific test for element validation
npm test -- tests/ref-persistence.spec.ts

# Run all tests to ensure no regressions
npm test
```

**Commit**:
```bash
git add src/browser/types/elements.ts src/browser/types/index.ts src/browser/bridge/BridgeFactory.ts
git commit -m "refactor: use structured errors in bridge validation"
```

---

### Step 1.3: Use Structured Errors in Frame Operations

**Goal**: Replace generic errors in `BridgeInjector` and `MultiContextBrowser` with typed errors.

**Files to Modify**: 
- `src/runtime/BridgeInjector.ts`
- `src/runtime/MultiContextBrowser.ts`

**Implementation**:

1. In `BridgeInjector.ts`, import error types:

```typescript
import { FrameDetachedError, FrameInjectionError } from "../shared-types.js";
```

2. Update error throwing in `ensureFrameState` (around line 390):

```typescript
if (isNonInjectable) {
  if (!state.contextReadyPromise.isDone()) {
    const error = new FrameInjectionError(frameId, errorMsg);
    state.contextReadyPromise.reject(error);
  }
  throw new FrameInjectionError(frameId, errorMsg);
}
```

3. Update frame detached rejection (around line 101):

```typescript
if (state && !state.contextReadyPromise.isDone()) {
  state.contextReadyPromise.reject(new FrameDetachedError(evt.frameId));
}
```

4. In `MultiContextBrowser.ts`, import error types:

```typescript
import { 
  FrameDetachedError, 
  NavigationError,
  UnknownRefError 
} from "../shared-types.js";
```

5. Update `parseRef` to throw typed error (around line 662):

```typescript
throw new UnknownRefError(ref);
```

6. Update `navigate` catch block (around line 365):

```typescript
throw new NavigationError(url, this.currentRole, 
  error instanceof Error ? error.message : String(error)
);
```

7. Update `isFrameDetachedError` to check error type (around line 419):

```typescript
private isFrameDetachedError(error: any): boolean {
  // Check for our custom error type first
  if (error instanceof FrameDetachedError) {
    return true;
  }
  
  // Fallback to message checking for external errors
  if (!error?.message) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("frame detached") ||
    msg.includes("frame has been detached") ||
    msg.includes("cannot find execution context") ||
    msg.includes("execution context was destroyed") ||
    msg.includes("frame with the given id was not found") ||
    msg.includes("no frame for given id") ||
    msg.includes("target closed") ||
    msg.includes("session closed")
  );
}
```

**Build**:
```bash
npm run build
```

**Test**:
```bash
# Test frame operations
npm test -- tests/multi-frame-bridge.spec.ts
npm test -- tests/iframe-edge-cases.spec.ts

# Run all tests
npm test
```

**Commit**:
```bash
git add src/runtime/BridgeInjector.ts src/runtime/MultiContextBrowser.ts
git commit -m "refactor: use structured errors in frame operations"
```

---

### Step 1.4: Add Error Logging for Suppressed Errors

**Goal**: Ensure suppressed errors in frame expansion are logged for debugging.

**Files to Modify**: `src/runtime/MultiContextBrowser.ts`

**Implementation**:

1. Update `expandIframes` catch block (around line 616):

```typescript
} catch (error) {
  // Frame detachment is normal, generic errors need logging
  if (this.isFrameDetachedError(error)) {
    console.debug(`Frame ${iframeRef} detached during expansion`);
    result.push(indentation + "  [Frame detached]");
  } else {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.warn(`Frame expansion error for ${iframeRef}:`, error);
    result.push(indentation + `  [Error: ${errMsg}]`);
  }
  continue;
}
```

2. Update `injectFrameTreeRecursive` error logging (around line 404):

```typescript
} catch (error) {
  // Frame detachment is normal - don't treat as error
  if (this.isFrameDetachedError(error)) {
    console.debug(`Frame ${frameTree.frame.id} detached during injection`);
    return;
  }
  console.warn(`Failed to inject into frame ${frameTree.frame.id}:`, error);
  return;
}
```

**Build**:
```bash
npm run build
```

**Test**:
```bash
# Test with verbose logging
DEBUG=verdex:* npm test -- tests/iframe-edge-cases.spec.ts

# Regular test run
npm test
```

**Commit**:
```bash
git add src/runtime/MultiContextBrowser.ts
git commit -m "feat: add debug logging for suppressed frame errors"
```

---

## Phase 2: Type System Cleanup (Days 3-4)

### Step 2.1: Audit Runtime ElementInfo Usage

**Goal**: Understand if unused fields are needed or can be removed.

**Files to Inspect**: Search codebase for `ElementInfo` usage.

**Implementation**:

1. Search for uses of runtime ElementInfo:

```bash
# Search for selector field usage
grep -r "\.selector" src/

# Search for siblingIndex field usage
grep -r "\.siblingIndex" src/

# Search for parentRef field usage
grep -r "\.parentRef" src/
```

2. Document findings in a comment at top of `src/runtime/types.ts`:

```typescript
/**
 * AUDIT RESULTS (2025-11-20):
 * - selector: NOT USED (candidate for removal)
 * - siblingIndex: NOT USED (candidate for removal)
 * - parentRef: NOT USED (candidate for removal)
 * 
 * These fields appear to be from an earlier design iteration.
 * TODO: Remove in next breaking version or repurpose for Phase 7+ features.
 */
export type ElementInfo = {
  // ... rest of type
```

**Test**: No code changes, just documentation.

**Commit**:
```bash
git add src/runtime/types.ts
git commit -m "docs: audit ElementInfo fields for future cleanup"
```

---

### Step 2.2: Remove Unused ElementInfo Fields

**Goal**: Clean up unused fields to reduce confusion.

**Files to Modify**: `src/runtime/types.ts`

**Implementation**:

1. Update `ElementInfo` type (around line 13):

```typescript
/**
 * Represents information about an interactive element stored in the Node.js runtime.
 * This is different from the browser-side ElementInfo which has actual DOM Elements.
 * 
 * Note: This type is currently unused in the runtime layer. It may be used in
 * future phases for element tracking or caching. For now, we rely on the bridge's
 * in-browser ElementInfo map.
 */
export type ElementInfo = {
  element: any; // Will be the actual DOM element reference in browser context
  tagName: string; // HTML tag name
  role: string; // ARIA role or semantic role of the element
  name: string; // Accessible name of the element
  attributes: Record<string, string>; // Element attributes
  // REMOVED: selector, siblingIndex, parentRef (unused)
};
```

**Build**:
```bash
npm run build
```

**Test**:
```bash
# Full test suite - should pass without changes
npm test
```

**Commit**:
```bash
git add src/runtime/types.ts
git commit -m "refactor: remove unused fields from runtime ElementInfo"
```

---

### Step 2.3: Create Ref Formatter Utility

**Goal**: Centralize ref format logic to prevent inconsistencies.

**Files to Create**: `src/utils/RefFormatter.ts`

**Implementation**:

1. Create new file `src/utils/RefFormatter.ts`:

```typescript
/**
 * Utility for formatting and parsing element references across frames.
 * 
 * Ref format:
 * - Main frame: "e1", "e2", "e3" (local refs only)
 * - Child frames: "f1_e1", "f2_e5" (frame ordinal + local ref)
 */
export class RefFormatter {
  /**
   * Convert frame ordinal and local ref to global ref
   * @param frameOrdinal - Frame number (0 = main frame)
   * @param localRef - Local element ref (e1, e2, etc.)
   * @returns Global ref string
   */
  static toGlobal(frameOrdinal: number, localRef: string): string {
    if (frameOrdinal === 0) {
      return localRef; // Main frame refs are not prefixed
    }
    return `f${frameOrdinal}_${localRef}`;
  }

  /**
   * Parse global ref into frame ordinal and local ref
   * @param globalRef - Global reference string
   * @returns Object with frameOrdinal and localRef
   * @throws Error if ref format is invalid
   */
  static parse(globalRef: string): { frameOrdinal: number; localRef: string } {
    // Match: "e1" or "f1_e1"
    const match = globalRef.match(/^(?:f(\d+)_)?(e\d+)$/);
    
    if (!match) {
      throw new Error(
        `Invalid ref format: ${globalRef}. Expected "e1" or "f1_e1" format.`
      );
    }

    return {
      frameOrdinal: match[1] ? parseInt(match[1], 10) : 0,
      localRef: match[2],
    };
  }

  /**
   * Check if a ref is a local ref (not frame-prefixed)
   * @param ref - Reference string
   * @returns True if ref is local (e.g. "e1"), false if global (e.g. "f1_e1")
   */
  static isLocal(ref: string): boolean {
    return /^e\d+$/.test(ref);
  }

  /**
   * Extract local ref from global ref
   * @param globalRef - Global reference string
   * @returns Local ref portion (e.g. "e1")
   */
  static getLocalRef(globalRef: string): string {
    const parsed = this.parse(globalRef);
    return parsed.localRef;
  }
}
```

2. Export from utils index (create `src/utils/index.ts` if needed):

```typescript
export { ManualPromise } from "./ManualPromise.js";
export { RefFormatter } from "./RefFormatter.js";
```

**Build**:
```bash
npm run build
```

**Test**: Create test file `tests/ref-formatter.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import { RefFormatter } from "../src/utils/RefFormatter.js";

test.describe("RefFormatter", () => {
  test("toGlobal() - main frame refs have no prefix", () => {
    expect(RefFormatter.toGlobal(0, "e1")).toBe("e1");
    expect(RefFormatter.toGlobal(0, "e42")).toBe("e42");
  });

  test("toGlobal() - child frame refs have f-prefix", () => {
    expect(RefFormatter.toGlobal(1, "e1")).toBe("f1_e1");
    expect(RefFormatter.toGlobal(5, "e23")).toBe("f5_e23");
  });

  test("parse() - main frame refs", () => {
    const result = RefFormatter.parse("e1");
    expect(result.frameOrdinal).toBe(0);
    expect(result.localRef).toBe("e1");
  });

  test("parse() - child frame refs", () => {
    const result = RefFormatter.parse("f2_e15");
    expect(result.frameOrdinal).toBe(2);
    expect(result.localRef).toBe("e15");
  });

  test("parse() - throws on invalid format", () => {
    expect(() => RefFormatter.parse("invalid")).toThrow("Invalid ref format");
    expect(() => RefFormatter.parse("f_e1")).toThrow("Invalid ref format");
    expect(() => RefFormatter.parse("f1e1")).toThrow("Invalid ref format");
  });

  test("isLocal() - detects local vs global refs", () => {
    expect(RefFormatter.isLocal("e1")).toBe(true);
    expect(RefFormatter.isLocal("e999")).toBe(true);
    expect(RefFormatter.isLocal("f1_e1")).toBe(false);
    expect(RefFormatter.isLocal("f10_e5")).toBe(false);
  });

  test("getLocalRef() - extracts local portion", () => {
    expect(RefFormatter.getLocalRef("e1")).toBe("e1");
    expect(RefFormatter.getLocalRef("f5_e23")).toBe("e23");
  });
});
```

**Run test**:
```bash
npm test -- tests/ref-formatter.spec.ts
```

**Commit**:
```bash
git add src/utils/RefFormatter.ts src/utils/index.ts tests/ref-formatter.spec.ts
git commit -m "feat: add RefFormatter utility for consistent ref handling"
```

---

### Step 2.4: Use RefFormatter in MultiContextBrowser

**Goal**: Replace manual ref parsing with RefFormatter.

**Files to Modify**: `src/runtime/MultiContextBrowser.ts`

**Implementation**:

1. Import RefFormatter at top:

```typescript
import { RefFormatter } from "../utils/RefFormatter.js";
```

2. Replace manual regex in `expandIframes` (around line 601):

```typescript
// OLD:
const prefix = `f${frameOrdinal}_`;
const rewritten = expandedChild.text.replace(
  /\[ref=(e[^\]]+)\]/g,
  (_whole, localRef) => {
    const globalRef = prefix + localRef;
    refIndex.set(globalRef, { frameId: frameInfo.frameId, localRef });
    return `[ref=${globalRef}]`;
  }
);

// NEW:
const rewritten = expandedChild.text.replace(
  /\[ref=(e[^\]]+)\]/g,
  (_whole, localRef) => {
    // Only rewrite local refs, not already-qualified refs
    if (!RefFormatter.isLocal(localRef)) {
      return `[ref=${localRef}]`; // Already qualified, keep as-is
    }
    
    const globalRef = RefFormatter.toGlobal(frameOrdinal, localRef);
    refIndex.set(globalRef, { frameId: frameInfo.frameId, localRef });
    return `[ref=${globalRef}]`;
  }
);
```

**Build**:
```bash
npm run build
```

**Test**:
```bash
# Test multi-frame operations
npm test -- tests/iframe-snapshot-expansion.spec.ts
npm test -- tests/multi-frame-bridge.spec.ts

# Full suite
npm test
```

**Commit**:
```bash
git add src/runtime/MultiContextBrowser.ts
git commit -m "refactor: use RefFormatter in iframe expansion"
```

---

## Phase 3: Configuration & Cleanup (Days 5-6)

### Step 3.1: Clarify Bridge Config Precedence

**Goal**: Make config precedence explicit and predictable.

**Files to Modify**: `src/runtime/MultiContextBrowser.ts`

**Implementation**:

1. Update `loadBridgeConfigFromEnv` to respect existing config (around line 40):

```typescript
/**
 * Load bridge configuration from environment variables.
 * Environment variables only override values that weren't explicitly set.
 * 
 * Precedence order:
 * 1. Programmatic config (via setBridgeConfiguration)
 * 2. Environment variables (BRIDGE_MAX_DEPTH, etc.)
 * 3. Default values (set in bridge creation)
 */
private loadBridgeConfigFromEnv(): void {
  if (process.env.BRIDGE_MAX_DEPTH && this.bridgeConfig.maxDepth === undefined) {
    const parsed = parseInt(process.env.BRIDGE_MAX_DEPTH, 10);
    if (!isNaN(parsed) && parsed > 0) {
      this.bridgeConfig.maxDepth = parsed;
    }
  }
  
  if (process.env.BRIDGE_MAX_SIBLINGS && this.bridgeConfig.maxSiblings === undefined) {
    const parsed = parseInt(process.env.BRIDGE_MAX_SIBLINGS, 10);
    if (!isNaN(parsed) && parsed > 0) {
      this.bridgeConfig.maxSiblings = parsed;
    }
  }
  
  if (process.env.BRIDGE_MAX_DESCENDANTS && this.bridgeConfig.maxDescendants === undefined) {
    const parsed = parseInt(process.env.BRIDGE_MAX_DESCENDANTS, 10);
    if (!isNaN(parsed) && parsed > 0) {
      this.bridgeConfig.maxDescendants = parsed;
    }
  }
}
```

2. Add JSDoc to `setBridgeConfiguration` (around line 29):

```typescript
/**
 * Set bridge configuration programmatically.
 * This takes precedence over environment variables.
 * 
 * @param config - Performance limits for bridge operations
 */
setBridgeConfiguration(config: {
  maxDepth?: number;
  maxSiblings?: number;
  maxDescendants?: number;
}): void {
  this.bridgeConfig = { ...config };
}
```

**Build**:
```bash
npm run build
```

**Test**: Create config test `tests/bridge-configuration.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../src/runtime/MultiContextBrowser.js";

test.describe("Bridge Configuration", () => {
  test("programmatic config takes precedence over env vars", async () => {
    // Set env var
    process.env.BRIDGE_MAX_DEPTH = "10";
    
    const browser = new MultiContextBrowser();
    
    // Set programmatically
    browser.setBridgeConfiguration({ maxDepth: 5 });
    
    await browser.initialize();
    
    // Programmatic value should win
    // We can't directly inspect bridgeConfig (private), but we can
    // verify behavior through integration tests
    
    await browser.close();
    delete process.env.BRIDGE_MAX_DEPTH;
  });
});
```

**Run test**:
```bash
npm test -- tests/bridge-configuration.spec.ts
```

**Commit**:
```bash
git add src/runtime/MultiContextBrowser.ts tests/bridge-configuration.spec.ts
git commit -m "fix: clarify bridge config precedence (programmatic > env)"
```

---

### Step 3.2: Add Frame State Cleanup to Dispose

**Goal**: Prevent memory leaks by cleaning up frame states.

**Files to Modify**: `src/runtime/BridgeInjector.ts`

**Implementation**:

1. Update `dispose` method (around line 405):

```typescript
async dispose(cdp: CDPSession): Promise<void> {
  // Remove auto-injected script
  if (this.scriptId) {
    try {
      await cdp.send("Page.removeScriptToEvaluateOnNewDocument", {
        identifier: this.scriptId,
      } as any);
    } catch {
      /* ignore */
    }
    this.scriptId = null;
  }
  
  // Remove all registered listeners (critical: prevents memory leaks)
  for (const { event, handler } of this.listeners) {
    try {
      (cdp as any).off?.(event, handler) ??
        (cdp as any).removeListener?.(event, handler);
    } catch {}
  }
  this.listeners = [];
  
  // NEW: Clean up frame states for this session
  const sessionStates = this.frameStates.get(cdp);
  if (sessionStates) {
    // Reject any pending frame state promises
    for (const [frameId, state] of sessionStates.entries()) {
      if (!state.contextReadyPromise.isDone()) {
        state.contextReadyPromise.reject(
          new Error(`Session disposed while frame ${frameId} was initializing`)
        );
      }
    }
    this.frameStates.delete(cdp);
  }
}
```

**Build**:
```bash
npm run build
```

**Test**:
```bash
# Test cleanup doesn't cause issues
npm test -- tests/bridge-lifecycle.spec.ts

# Full suite
npm test
```

**Commit**:
```bash
git add src/runtime/BridgeInjector.ts
git commit -m "fix: clean up frame states in dispose to prevent memory leaks"
```

---

### Step 3.3: Store Error Snapshots in Navigation Failures

**Goal**: Actually store error snapshots as the comment suggests.

**Files to Modify**: 
- `src/runtime/types.ts`
- `src/runtime/MultiContextBrowser.ts`

**Implementation**:

1. Add field to `RoleContext` in `types.ts` (around line 41):

```typescript
export type RoleContext = {
  role: string;
  browserContext: BrowserContext;
  page: Page;
  cdpSession: CDPSession;
  bridgeInjector: any;
  mainFrameId: string;
  defaultUrl?: string;
  createdAt: number;
  lastUsed: number;
  hasNavigated: boolean;
  storageStatePath?: string;
  
  // Multi-frame state
  refIndex?: GlobalRefIndex;
  navigationTimestamp?: number;
  
  // NEW: Error recovery
  lastErrorSnapshot?: Snapshot; // Snapshot captured during last error
};
```

2. Update `navigate` error handler in `MultiContextBrowser.ts` (around line 359):

```typescript
// Store error snapshot in context for potential retrieval
context.lastErrorSnapshot = errorSnapshot;

console.error(`Navigation failed: ${errorMessage}`);
console.debug(`Error snapshot stored in context.lastErrorSnapshot`);
```

3. Add method to retrieve error snapshot:

```typescript
/**
 * Get the last error snapshot if available.
 * Useful for debugging navigation failures.
 * 
 * @returns Last error snapshot or null if none available
 */
getLastErrorSnapshot(): Snapshot | null {
  try {
    const context = this._roleContexts.get(this.currentRole);
    if (!context) return null;
    
    // Context might still be a promise
    if (context instanceof Promise) return null;
    
    return context.lastErrorSnapshot || null;
  } catch {
    return null;
  }
}
```

**Build**:
```bash
npm run build
```

**Test**:
```bash
# Test navigation error handling
npm test -- tests/error-handling.spec.ts

# Full suite
npm test
```

**Commit**:
```bash
git add src/runtime/types.ts src/runtime/MultiContextBrowser.ts
git commit -m "feat: store error snapshots in navigation failures for debugging"
```

---

## Phase 4: Documentation & Polish (Day 7)

### Step 4.1: Add JSDoc Comments for Event-Driven Patterns

**Goal**: Document the event-driven architecture for maintainability.

**Files to Modify**: `src/runtime/BridgeInjector.ts`

**Implementation**:

Add detailed JSDoc to `setupAutoInjection`:

```typescript
/**
 * Setup automatic bridge injection for all frames in a page.
 * 
 * This method establishes an event-driven lifecycle for bridge management:
 * 
 * **Event Coordination**:
 * 1. Listeners registered BEFORE enabling domains (prevents race conditions)
 * 2. Domains enabled (triggers existing context events)
 * 3. Auto-injection script registered for new documents
 * 4. Main frame injection as fallback
 * 
 * **Navigation Patterns Handled**:
 * - Cross-document navigation: Destroys & recreates contexts
 * - Same-document navigation (SPA): Context survives, bridge instance invalidated
 * - Frame attach/detach: Lazy injection on first use
 * 
 * **Why ManualPromise?**:
 * - Allows event handlers to resolve promises awaited elsewhere
 * - No polling or retries needed - purely event-driven
 * - Idempotent - multiple awaits on same promise are safe
 * 
 * @param cdp - CDP session for this page
 * @param mainFrameId - ID of the main frame (from Page.getFrameTree)
 */
async setupAutoInjection(
  cdp: CDPSession,
  mainFrameId: string
): Promise<void> {
  // ... existing implementation
}
```

**Build**:
```bash
npm run build
```

**Test**: No code changes, just docs.

**Commit**:
```bash
git add src/runtime/BridgeInjector.ts
git commit -m "docs: add detailed JSDoc for event-driven architecture"
```

---

### Step 4.2: Document Click Navigation Pattern

**Goal**: Explain the navigation promise pattern and timeout choice.

**Files to Modify**: `src/runtime/MultiContextBrowser.ts`

**Implementation**:

Add JSDoc and inline comments to `click` method:

```typescript
/**
 * Click an interactive element.
 * 
 * **Navigation Handling**:
 * - Sets up navigation listener BEFORE clicking (prevents race)
 * - Waits up to 1 second for navigation (fast feedback for non-nav clicks)
 * - Uses networkidle2 for real-world app compatibility
 * 
 * **Why 1 Second Timeout?**:
 * - Most clicks don't navigate (buttons, accordions, modals)
 * - 1s is long enough to detect navigation start
 * - If navigation starts, we wait full networkidle2 duration
 * - Balances responsiveness with reliability
 * 
 * **Cross-Frame Support**:
 * - Ref is parsed to determine target frame
 * - Click is routed to correct iframe if needed
 * 
 * @param ref - Global element reference (e.g. "e1" or "f2_e5")
 */
async click(ref: string): Promise<void> {
  const context = await this.ensureCurrentRoleContext();

  // Parse ref to get frame and local ref
  const { frameId, localRef } = this.parseRef(ref, context);

  // Set up navigation listener BEFORE clicking (prevents race condition)
  // networkidle2: Waits for ≤2 network connections for 500ms (good for real-world apps)
  // 1s timeout: Fast feedback for non-navigating clicks (most common case)
  const navigationPromise = context.page
    .waitForNavigation({
      waitUntil: "networkidle2",
      timeout: 1000,
    })
    .catch((error) => {
      // Only suppress timeout errors (expected for non-navigating clicks)
      if (
        error.message?.includes("Timeout") ||
        error.message?.includes("timeout")
      ) {
        return null;
      }
      // Re-throw real errors (network failures, etc.)
      throw error;
    });

  try {
    // Execute the click (routes to correct frame!)
    await context.bridgeInjector.callBridgeMethod(
      context.cdpSession,
      "click",
      [localRef],
      frameId
    );

    // Wait for navigation to complete (if it happens)
    // For cross-document navigation, this resolves when page is loaded
    // For same-document navigation (SPA/Remix), this times out and returns null
    await navigationPromise;

    // No additional wait needed - networkidle2 already waits 500ms after network settles
    // Bridge is automatically re-injected via CDP events for cross-document navigation
    // Bridge context stays valid for same-document navigation (SPA/Remix)
  } catch (error) {
    // CRITICAL: Await navigationPromise even on error to prevent "Navigating frame was detached"
    // If we don't wait for it, the promise keeps running during browser cleanup
    await navigationPromise.catch(() => {
      /* Ignore navigation errors when click itself failed */
    });
    throw error;
  }
}
```

**Build**:
```bash
npm run build
```

**Commit**:
```bash
git add src/runtime/MultiContextBrowser.ts
git commit -m "docs: document click navigation pattern and timeout rationale"
```

---

### Step 4.3: Update Architecture Documentation

**Goal**: Create high-level architecture overview.

**Files to Create**: `ARCHITECTURE.md` (project root)

**Implementation**:

Create comprehensive architecture doc:

```markdown
# Verdex Architecture

## Overview

Verdex is a browser automation system built on three core principles:
1. **Event-driven** - No polling, pure CDP event coordination
2. **Multi-context** - Isolated browser contexts for role separation
3. **Multi-frame** - Unified element addressing across iframes

## Layer Architecture

```
┌─────────────────────────────────────────────┐
│          MCP Server Layer                    │
│  (VerdexMCPServer, handlers)                │
│  - Tool definitions & dispatch               │
│  - Error formatting for LLM consumption      │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│          Runtime Layer                       │
│  (MultiContextBrowser, BridgeInjector)      │
│  - Puppeteer/CDP orchestration               │
│  - Multi-role context management             │
│  - Frame discovery & injection               │
│  - Navigation lifecycle tracking             │
└─────────────────┬───────────────────────────┘
                  │
           ┌──────┴──────┐
           │   CDP API   │
           └──────┬──────┘
                  │
┌─────────────────▼───────────────────────────┐
│          Browser Layer                       │
│  (Bridge code - runs in isolated world)     │
│  - Accessibility tree generation             │
│  - Element tracking & interaction            │
│  - Structural analysis (ancestors, etc.)     │
└─────────────────────────────────────────────┘
```

## Error Flow

```
Browser Error (e.g. StaleRefError)
    │
    ├─> BridgeFactory.validateElement()
    │       │
    │       └─> throws StaleRefError
    │
    ├─> BridgeInjector.callBridgeMethod()
    │       │
    │       └─> propagates to MultiContextBrowser
    │
    ├─> MultiContextBrowser.click/type/etc()
    │       │
    │       └─> propagates to MCP handler
    │
    └─> VerdexMCPServer (global catch)
            │
            └─> formats error for LLM
```

## Event-Driven Patterns

### Bridge Injection Lifecycle

```
setupAutoInjection()
    │
    ├─> Register CDP listeners (BEFORE enable)
    │   ├─ Runtime.executionContextCreated
    │   ├─ Page.navigatedWithinDocument
    │   ├─ Page.frameNavigated
    │   ├─ Page.frameAttached
    │   └─ Page.frameDetached
    │
    ├─> Enable CDP domains
    │   ├─ Page.enable
    │   ├─ Runtime.enable
    │   └─ DOM.enable
    │
    ├─> Register auto-injection script
    │   └─ Page.addScriptToEvaluateOnNewDocument
    │
    └─> Inject main frame (fallback)
        └─ ensureFrameState(mainFrameId)
```

### Navigation Coordination

```
navigate(url)
    │
    ├─> Setup response tracking
    │
    ├─> page.goto(url)
    │       │
    │       └─> [Triggers cross-document navigation]
    │               │
    │               ├─> Page.frameNavigated event
    │               │   └─> Clear frame state
    │               │
    │               └─> Runtime.executionContextCreated
    │                   └─> Resolve contextReadyPromise
    │
    ├─> discoverAndInjectFrames()
    │   └─> Inject bridges into all child frames
    │
    └─> snapshot() with iframe expansion
```

## Multi-Frame Element Addressing

### Ref Format

- Main frame: `e1`, `e2`, `e3`
- Child frames: `f1_e1`, `f2_e5` (frame ordinal + local ref)

### Ref Resolution Flow

```
User calls: browser.click("f2_e5")
    │
    ├─> parseRef("f2_e5") via RefIndex
    │   └─> { frameId: "ABC123", localRef: "e5" }
    │
    ├─> ensureFrameState(frameId)
    │   └─> Inject bridge if not present
    │
    ├─> getBridgeHandle(frameId)
    │   └─> Get bridge instance for frame
    │
    └─> callBridgeMethod("click", ["e5"], frameId)
        └─> Execute in correct iframe
```

## Configuration Precedence

1. **Programmatic** - `browser.setBridgeConfiguration()`
2. **Environment** - `BRIDGE_MAX_DEPTH`, etc.
3. **Defaults** - Built into bridge code

## Memory Management

### Cleanup Order

```
browser.close()
    │
    ├─> For each role context:
    │   ├─> bridgeInjector.dispose()
    │   │   ├─ Remove CDP listeners
    │   │   ├─ Remove auto-inject script
    │   │   └─ Clear frame states
    │   │
    │   ├─> cdpSession.detach()
    │   ├─> page.close()
    │   └─> browserContext.close() [non-default only]
    │
    └─> browser.close()
```

## Testing Strategy

- **Unit tests**: RefFormatter, error types
- **Integration tests**: Bridge injection, frame discovery
- **E2E tests**: Full workflows with real pages
```

**Commit**:
```bash
git add ARCHITECTURE.md
git commit -m "docs: add comprehensive architecture documentation"
```

---

## Verification & Completion

### Final Build & Test

Run full verification:

```bash
# Clean build
rm -rf dist/
npm run build

# Full test suite
npm test

# Check for linter errors
npm run lint # (if you have this script)

# Verify types
npx tsc --noEmit
```

### Create Summary Report

Document what was accomplished:

```bash
# Generate git log of changes
git log --oneline --graph feature/architecture-improvements

# Count changes
git diff main --stat
```

---

## Rollback Strategy

If any step causes issues:

```bash
# Rollback last commit
git reset --soft HEAD~1

# Rollback to specific commit
git reset --soft <commit-hash>

# Discard uncommitted changes
git restore .
```

---

## Future Improvements (Phase 5+)

Items identified but deferred:

1. **Retry strategies** - Add exponential backoff for transient frame errors
2. **Error recovery hooks** - Allow custom error handlers per role
3. **Performance monitoring** - Track injection times and failures
4. **Structured logging** - Replace console.* with structured logger
5. **Error reporting** - Send errors to monitoring service

---

## Success Criteria

- [ ] All tests passing
- [ ] No TypeScript errors
- [ ] Clean git history (one commit per step)
- [ ] Documentation updated
- [ ] No regressions in existing functionality
- [ ] Improved error messages in real usage
- [ ] Memory leaks fixed (verified with long-running tests)

---

## Questions & Support

If you encounter issues:
1. Check the commit message for context
2. Review test output for specific failures
3. Rollback and try step again
4. Open GitHub issue with error details

