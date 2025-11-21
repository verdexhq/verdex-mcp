# Error Handling Design

**Status**: ✅ Implemented  
**Created**: 2025-11-21  
**Updated**: 2025-11-21  
**Purpose**: Clean error propagation through system layers

---

## Core Principle

**FailureLog is the single source of truth. Track all failures, classify at decision points, be transparent to users.**

**Pattern**: Operations track failures → Decision points classify → Warnings expose state

---

## System Layers

```
┌─────────────────────────────────────────┐
│  Layer 4: MCP Client (AI/User)         │  Receives formatted text
└─────────────────────────────────────────┘
                ↑ formatted strings
┌─────────────────────────────────────────┐
│  Layer 3: Server (MCP Protocol)         │  Formats errors for LLM
│  - VerdexMCPServer                       │  Routes requests
│  - Handlers (Browser/Analysis/Role)     │  Returns text responses
└─────────────────────────────────────────┘
                ↑ typed errors/results
┌─────────────────────────────────────────┐
│  Layer 2: Runtime (Node.js)             │  Classifies errors
│  - MultiContextBrowser                   │  Enforces contracts
│  - BridgeInjector                        │  Throws or returns results
└─────────────────────────────────────────┘
                ↑ exceptions/results
┌─────────────────────────────────────────┐
│  Layer 1: Browser (Isolated World)      │  Reports errors
│  - VerdexBridge                          │  Throws on failures
│  - SnapshotGenerator                     │  No classification logic
└─────────────────────────────────────────┘
```

---

## Layer Responsibilities

| Layer | Job | Must NOT |
|-------|-----|----------|
| **Browser** | Throw on DOM errors<br>Return structured data | Decide what's critical<br>Format for humans |
| **Runtime** | Classify by severity<br>Enforce contracts<br>Manage resources | Format error messages<br>Catch and hide failures |
| **Server** | Format for LLM<br>Route to handlers<br>Convert errors→text | Make policy decisions<br>Enforce business logic |
| **MCP Client** | Show to user<br>Take action | Parse error semantics |

---

## Our Approach: Track, Then Decide

### No Result Types - Use FailureLog

We **do not** use separate Result types. Instead:

1. **Operations track failures** in FailureLog
2. **Decision points check** FailureLog to classify
3. **Throw if critical**, continue if acceptable

```typescript
// ❌ DON'T: Create Result types
type AuthResult = { success: boolean; reason?: string };

// ✅ DO: Track in FailureLog, decide at decision point
try {
  await loadAuth();
} catch (error) {
  context.failures.authLoadError = { error, authPath, timestamp };
  
  // DECISION POINT: Check if critical
  if (config.authRequired) {
    throw new AuthenticationError(role, authPath, error);
  }
  // Non-critical: logged, context continues
}
```

### When to Throw

**Throw** for unrecoverable failures:
- Main frame injection fails (page unusable)
- Required auth cannot load (contract violation)
- Browser not initialized (programming error)
- Unknown element ref (stale reference)

**Track & Continue** for acceptable failures:
- Cross-origin iframe (browser security)
- Optional auth missing (degraded mode)
- Child frame detached (common during navigation)

---

## Error Classification

### Critical Errors (Throw)
Operation cannot complete, user must act:
- Main frame injection fails
- Required auth cannot load
- Browser not initialized
- Navigation to invalid URL
- Unknown element ref

### Partial Success (Return with Warnings)
Operation partially succeeds, attach warnings to result:
- Cross-origin iframe cannot inject
- Optional auth file missing
- Some child frames detached
- Snapshot generation with inaccessible content

**Note**: No "transient/retry" category - we don't implement retry logic at MCP layer. If needed later, would be handled in browser automation layer.

---

## Pattern 1: Frame Injection with FailureLog

**Problem**: Some frames may fail (cross-origin, detached). Main frame must succeed.

**Solution**: Track all failures in FailureLog with `isMainFrame` flag, decide at navigation.

```typescript
// STEP 1: Track failures during injection
private async injectFrameTreeRecursive(
  context: RoleContext,
  frameTree: any,
  isMainFrame: boolean = false
): Promise<void> {
  try {
    await context.bridgeInjector.ensureFrameState(
      context.cdpSession,
      frameTree.frame.id
    );
  } catch (error) {
    // Track in FailureLog (not throwing yet)
    const failures = this.ensureFailureLog(context);
    failures.frameInjectionFailures.push({
      frameId: frameTree.frame.id,
      error: error.message,
      reason: this.classifyFrameError(error),
      isMainFrame, // ← Track criticality
      timestamp: Date.now(),
    });
    return;
  }
}

// STEP 2: Decision point checks FailureLog
async navigate(url: string): Promise<Snapshot> {
  await this.discoverAndInjectFrames(context);
  
  // DECISION POINT: Check for critical failures
  const mainFrameFailed = context.failures?.frameInjectionFailures
    .some(f => f.isMainFrame);
  
  if (mainFrameFailed) {
    throw new Error('Main frame injection failed - page unusable');
  }
  
  // STEP 3: Build warnings from FailureLog
  snapshot.warnings = this.buildWarningsFromFailureLog(context);
  return snapshot;
}

// STEP 3: Build warnings reads FailureLog
private buildWarningsFromFailureLog(context: RoleContext) {
  const failures = context.failures;
  const inaccessibleFrames = failures.frameInjectionFailures
    .filter(f => !f.isMainFrame);
  
  if (inaccessibleFrames.length > 0) {
    return {
      inaccessibleFrames: inaccessibleFrames.length,
      details: inaccessibleFrames.map(f => `Frame ${f.frameId}: ${f.reason}`)
    };
  }
}
```

**Benefits**:
- ✅ Single source of truth (FailureLog)
- ✅ No Result types needed
- ✅ Clear decision logic
- ✅ User sees warnings for partial failures

---

## Pattern 2: Auth Loading with Decision Logic

**Problem**: Auth failure creates "authenticated" role that's actually unauthenticated.

**Solution**: Track in FailureLog, check `authRequired` flag at decision point.

```typescript
// STEP 1: Auth loading throws proper Error (not plain object)
private async _loadAuthData(role: string, page: Page): Promise<void> {
  const authPath = this.rolesConfig?.roles[role]?.authPath;
  if (!authPath) return;

  try {
    const fs = await import("fs");
    const authData = JSON.parse(fs.readFileSync(authPath, "utf8"));
    // Load cookies, localStorage...
    console.log(`✅ Auth data loaded for role: ${role}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const authError = new Error(`Failed to load auth from ${authPath}: ${errorMsg}`);
    (authError as any).authPath = authPath; // Attach metadata
    throw authError;
  }
}

// STEP 2: Role creation tracks failure in FailureLog
private async _createRoleContext(role: string): Promise<RoleContext> {
  // ... create browser context, page ...
  
  let authError: Error | undefined;
  try {
    await this._loadAuthData(role, page);
  } catch (error) {
    authError = error instanceof Error ? error : new Error(String(error));
  }

  const context = await this._setupRoleContext(role, browserContext, page);

  // Track in FailureLog
  if (authError) {
    const failures = this.ensureFailureLog(context);
    failures.authLoadError = {
      error: authError.message,
      authPath: (authError as any).authPath || 'unknown',
      timestamp: Date.now(),
    };

    // DECISION POINT: Check authRequired flag
    const roleConfig = this.rolesConfig?.roles[role];
    if (roleConfig?.authRequired) {
      // CRITICAL: Cleanup and throw
      await page.close().catch(logAndContinue);
      await browserContext.close().catch(logAndContinue);
      throw new AuthenticationError(role, authPath, authError.message);
    }

    // Non-critical: log and continue
    console.warn(`⚠️ Role '${role}' created without authentication (optional)`);
  }

  return context;
}

// STEP 3: Warnings show auth status (reads FailureLog)
private buildWarningsFromFailureLog(context: RoleContext) {
  if (context.failures?.authLoadError) {
    return {
      authStatus: 'unauthenticated',
      details: [`Auth failed: ${context.failures.authLoadError.error}`]
    };
  }
}
```

**Benefits**:
- ✅ No duplicate state (`authStatus` removed from RoleContext)
- ✅ Explicit contract via `authRequired` flag
- ✅ Decision logic in one place
- ✅ User sees warning if unauthenticated

---

## Error Types & FailureLog

### Custom Error Classes (For Critical Failures)

We use custom error classes for **critical failures only**:

```typescript
// Added in this implementation
class AuthenticationError extends Error {
  constructor(
    public role: string,
    public authPath: string, 
    public reason: string
  ) {
    super(
      `Authentication required for role '${role}' but failed to load from ${authPath}: ${reason}`
    );
    this.name = 'AuthenticationError';
  }
}

// Already existed
class FrameInjectionError extends Error { ... }
class NavigationError extends Error { ... }
class UnknownRefError extends Error { ... }
class StaleRefError extends Error { ... }
```

These are used by `VerdexMCPServer.formatErrorForLLM()` with `instanceof` checks.

### FailureLog (For All Failures)

**Single source of truth** for tracking operational failures:

```typescript
type FailureLog = {
  frameInjectionFailures: Array<{
    frameId: string;
    error: string;
    reason: "cross-origin" | "detached" | "timeout" | "unknown";
    isMainFrame: boolean; // ← NEW: Enables classification
    timestamp: number;
  }>;
  frameExpansionFailures: Array<{
    ref: string;
    error: string;
    detached: boolean;
    timestamp: number;
  }>;
  frameDiscoveryError?: {
    error: string;
    timestamp: number;
  };
  authLoadError?: {
    error: string;
    authPath: string;
    timestamp: number;
  };
  cleanupErrors: Array<{
    step: string;
    error: string;
  }>;
};
```

**Why FailureLog is better than Result types**:
- ✅ Tracks all failures in one place
- ✅ Queryable via `getFailures()` API
- ✅ Per-role isolation for debugging
- ✅ No state duplication
- ✅ Decision logic reads from it

**No Result types needed** - FailureLog already provides what Result types would have.

---

## Snapshot Warnings (Read from FailureLog)

For non-critical issues, we build warnings from FailureLog:

```typescript
// Snapshot type
type Snapshot = {
  text: string;
  elementCount: number;
  navigation?: NavigationMetadata;
  warnings?: SnapshotWarnings; // ← Built from FailureLog
};

type SnapshotWarnings = {
  inaccessibleFrames?: number;
  authStatus?: 'unauthenticated';
  partialContent?: boolean;
  details?: string[];
};

// Implementation
private buildWarningsFromFailureLog(context: RoleContext) {
  const failures = context.failures;
  if (!failures) return undefined;

  const warnings: any = {};

  // Check for inaccessible frames (non-main frames that failed)
  const inaccessibleFrames = failures.frameInjectionFailures
    .filter(f => !f.isMainFrame);
  
  if (inaccessibleFrames.length > 0) {
    warnings.inaccessibleFrames = inaccessibleFrames.length;
    warnings.details = inaccessibleFrames.map(f => 
      `Frame ${f.frameId}: ${f.reason}`
    );
  }

  // Check for unauthenticated status
  if (failures.authLoadError) {
    warnings.authStatus = 'unauthenticated';
    warnings.details = warnings.details || [];
    warnings.details.push(`Auth failed: ${failures.authLoadError.error}`);
  }

  // Check for partial content
  if (failures.frameExpansionFailures.length > 0) {
    warnings.partialContent = true;
    warnings.details = warnings.details || [];
    const detached = failures.frameExpansionFailures.filter(f => f.detached).length;
    warnings.details.push(
      `${failures.frameExpansionFailures.length} iframe(s) inaccessible (${detached} detached)`
    );
  }

  return Object.keys(warnings).length > 0 ? warnings : undefined;
}
```

**Benefits**:
- ✅ Warnings derived from FailureLog (single source of truth)
- ✅ User sees degraded state transparently
- ✅ No need to track separately

---

## Silent Failures to Fix

### Priority 1: Critical
1. **Auth failures** - Role created without auth (confusing state)
2. **Frame injection** - Main frame failure allows broken operations
3. **Snapshot errors** - Returned as text instead of thrown

### Priority 2: Important  
4. **Navigation context errors** - Inner catch swallows context issues
5. **ManualPromise rejections** - Silent if not awaited
6. **Disposal failures** - Empty catch blocks hide cleanup issues

### Priority 3: Polish
7. **Error message matching** - String matching is fragile
8. **Promise.allSettled** - No threshold for acceptable failures
9. **Console.warn only** - No structured tracking

---

## Implementation Summary

### ✅ What We Built

**1. Logging Utility** (`src/utils/logging.ts`)
```typescript
export function logAndContinue(error: unknown, context?: string): void {
  const prefix = context ? `[${context}] ` : '';
  console.warn(`${prefix}Non-critical error (continuing):`, error);
}
```

**2. FailureLog Enhancements** (`src/runtime/types.ts`)
- Added `isMainFrame: boolean` to frame injection failures
- Added `authRequired?: boolean` to `RoleConfig`
- Removed duplicate state (`authStatus`, `authFailureReason`) from `RoleContext`

**3. Auth Loading with Decision Logic** (`src/runtime/MultiContextBrowser.ts`)
- `_loadAuthData()` throws proper `Error` (not plain object)
- `_createRoleContext()` tracks failure in FailureLog
- Decision point checks `authRequired` flag
- Throws `AuthenticationError` if auth required and failed
- Logs warning if auth optional and failed

**4. Frame Injection with Classification** (`src/runtime/MultiContextBrowser.ts`)
- `injectFrameTreeRecursive()` accepts `isMainFrame` parameter
- All failures tracked in FailureLog with criticality flag
- `discoverAndInjectFrames()` checks for main frame failure
- Throws if main frame fails (critical)
- Continues if only child frames fail (acceptable)

**5. Snapshot Warnings Builder** (`src/runtime/MultiContextBrowser.ts`)
- `buildWarningsFromFailureLog()` reads FailureLog
- Builds warnings for inaccessible frames, auth status, partial content
- Attached to every snapshot

**6. Cleanup Improvements**
- `BridgeInjector.dispose()` uses `logAndContinue`
- `MultiContextBrowser.clearFailures()` logs errors
- No more empty `catch {}` blocks

**7. Error Formatting** (`src/server/VerdexMCPServer.ts`)
- Added `AuthenticationError` handler
- Provides actionable recovery steps for LLM

---

## Why More Complex Than Playwright MCP?

**Playwright MCP error handling** (from their source):
```typescript
try {
  await tool.handle(context, parsedArguments, response);
} catch (error: any) {
  response.addError(String(error));
}
```

That's it. Stringify everything. No classification.

**Why they can be simple:**
1. **Single browser context** - no multi-role complexity
2. **Native APIs** - they call `page._snapshotForAI()`, we build the snapshot mechanism
3. **No frame injection** - they don't inject bridges into frames
4. **No auth management** - no concept of authenticated roles
5. **Modal states only** - their one partial failure mode is dialog detection

**Why we need more:**
1. **Multi-role state** → Need auth status tracking (`authenticated` vs `unauthenticated`)
2. **Frame injection** → Need partial failure handling (main frame vs iframes)
3. **Custom error formatting** → Already have `instanceof`-based formatters in `VerdexMCPServer`
4. **Resource lifecycle** → Multiple contexts to manage and clean up

**Our approach**: As complex as needed, but no more. Adopt Playwright's simplicity where possible (cleanup handling), add structure where required (multi-role, frame injection).

---

## Testing Strategy

For each error scenario:

1. **Unit test**: Error is thrown/returned correctly
2. **Integration test**: Error propagates to server layer
3. **E2E test**: User receives actionable error message

Example scenarios:
- Main frame injection fails → NavigationError
- Auth file missing + required → AuthenticationError  
- Cross-origin iframe → Snapshot with warning
- All frames fail → Throw (not log and continue)

---

## Testing & Validation

**Build**: ✅ No lint errors, builds successfully  
**Tests**: ✅ All tests passing
- Failure tracking tests (6/6)
- Navigation/snapshot tests
- Bridge lifecycle tests

**Real-world debugging scenarios**:
```typescript
// Scenario: "Why can't the agent see the dashboard?"
const failures = await browser.getFailures();

console.log(failures);
// Output shows:
// {
//   authLoadError: {
//     error: "ENOENT: file not found '/auth/user.json'",
//     authPath: "/auth/user.json", 
//     timestamp: 1700000000
//   }
// }
// ✅ Clear diagnosis: Auth file missing!
```

---

## Success Criteria

✅ **No silent failures** - All errors tracked in FailureLog or logged  
✅ **Clear user feedback** - Errors have actionable messages, warnings show degraded state  
✅ **Single source of truth** - FailureLog only, no duplicate state  
✅ **Decision at right layer** - Runtime classifies, Server formats  
✅ **Transparent state** - User sees auth status, frame accessibility via warnings  
✅ **Debuggable** - `getFailures()` API, structured tracking, per-role isolation

---

## Key Takeaways

1. **FailureLog over Result types** - Simpler, more powerful, already existed
2. **Track, then decide** - Operations log to FailureLog, decision points check it
3. **No duplicate state** - Everything derives from FailureLog
4. **Warnings for transparency** - User sees partial failures without throwing
5. **Explicit contracts** - `authRequired`, `isMainFrame` flags make requirements clear

**The pattern is:**
```
Operation → Track in FailureLog → Decision point checks → Throw or warn
```

This is simpler than Result types, leverages existing infrastructure, and provides better debugging.

