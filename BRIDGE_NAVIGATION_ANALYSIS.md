# Bridge Navigation Analysis: Why snapshot() Fails After click() But Works After navigate()

## Root Cause Summary

The `snapshot()` function fails after `click()` because **clicking can trigger navigation**, which puts the bridge in a `navigationInProgress` state. The 500ms wait in `click()` is insufficient for the new page to load and the bridge to reinitialize, causing subsequent `snapshot()` calls to timeout.

## Detailed Flow Analysis

### 1. When `navigate()` is Called (✅ Works)

**Source:** `src/runtime/MultiContextBrowser.ts` lines 273-331

```typescript
async navigate(url: string): Promise<Snapshot> {
  // Perform navigation
  const response = await context.page.goto(url, {
    waitUntil: "networkidle0",  // ⭐ KEY: Waits for page to be fully loaded
  });
  
  // ... capture metadata ...
  
  // Get snapshot - bridge is ready because we waited for networkidle0
  const snapshot = await this.snapshot();
  return snapshot;
}
```

**Why it works:**
- `goto()` with `waitUntil: "networkidle0"` ensures the page is fully loaded
- Bridge injector has auto-injection set up via CDP event listeners
- By the time `snapshot()` is called, the new execution context is created and bridge is ready
- `navigationInProgress` flag is set back to `false` by the time we call `snapshot()`

### 2. When `click()` is Called (❌ Fails)

**Source:** `src/runtime/MultiContextBrowser.ts` lines 400-406

```typescript
async click(ref: string): Promise<void> {
  const context = await this.ensureCurrentRoleContext();
  await context.bridgeInjector.callBridgeMethod(context.cdpSession, "click", [
    ref,
  ]);
  await new Promise((resolve) => setTimeout(resolve, 500)); // ⚠️ Only 500ms wait!
}
```

**Why it fails:**
1. Click is executed via bridge
2. If the clicked element triggers navigation (e.g., a link), the page starts navigating
3. Bridge injector detects navigation via CDP events and sets `navigationInProgress = true`
4. Only 500ms wait - **not enough for the new page to load**
5. When `snapshot()` is called next, the bridge is still in navigation state

### 3. Bridge Injector Event Listeners

**Source:** `src/runtime/BridgeInjector.ts` lines 32-69

The injector monitors these CDP events:

```typescript
async setupAutoInjection(cdp: CDPSession, mainFrameId: string): Promise<void> {
  // Listener: Detects when new execution context is created (sets navigationInProgress = false)
  const onCtx = (evt: any) => {
    const ctx = evt.context;
    // ... matching logic ...
    if (matchesWorld && matchesTop) {
      this.contextId = ctx.id;
      this.navigationInProgress = false; // ✅ Clear flag
      this.resolveContextReady();
    }
  };
  
  // Listener: Detects when navigation starts (sets navigationInProgress = true)
  const onStart = (evt: any) => {
    if (this.isTopFrame(evt.frameId)) this.onTopFrameNavigating(); // ⚠️ Sets flag
  };
  
  // Listener: Handles SPA navigations
  const onSameDoc = (evt: any) => {
    if (this.isTopFrame(evt.frameId)) {
      // SPA route change: keep context alive, just invalidate instance handle
      this.bridgeObjectId = null;
      // Importantly: DOES NOT set navigationInProgress = true
    }
  };

  this.addListener(cdp, "Runtime.executionContextCreated", onCtx);
  this.addListener(cdp, "Page.frameStartedLoading", onStart);
  this.addListener(cdp, "Page.navigatedWithinDocument", onSameDoc);
}
```

**Key events:**
- `Page.frameStartedLoading` → Sets `navigationInProgress = true`
- `Runtime.executionContextCreated` → Sets `navigationInProgress = false` (when bridge world is ready)

### 4. The Timeout Error

**Source:** `src/runtime/BridgeInjector.ts` lines 174-183

```typescript
private async waitForNavToClear(maxWaitMs = 10000): Promise<void> {
  if (!this.navigationInProgress) return;
  const start = Date.now();
  while (this.navigationInProgress && Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, 50));
  }
  if (this.navigationInProgress) {
    throw new Error("Bridge unavailable: navigation taking too long"); // ❌ Your error!
  }
}
```

**Source:** `src/runtime/BridgeInjector.ts` lines 185-234

```typescript
async getBridgeHandle(cdp: CDPSession): Promise<string> {
  await this.waitForNavToClear(); // ⚠️ Waits up to 10 seconds for navigation to complete
  // ... rest of bridge handle acquisition ...
}
```

Every bridge method call goes through `getBridgeHandle()`, which calls `waitForNavToClear()`.

## Timeline Comparison

### ✅ Successful: navigate() → snapshot()

```
T+0ms:    navigate() called
T+1ms:    page.goto() starts
T+1ms:    CDP: Page.frameStartedLoading → navigationInProgress = true
T+2000ms: Page loads, network idle
T+2100ms: CDP: Runtime.executionContextCreated → navigationInProgress = false
T+2100ms: navigate() calls snapshot()
T+2100ms: snapshot() → getBridgeHandle() → waitForNavToClear() → returns immediately (flag is false)
T+2150ms: ✅ Snapshot succeeds
```

### ❌ Failed: click() → snapshot()

```
T+0ms:    click() called
T+1ms:    Bridge executes click
T+5ms:    Click triggers navigation
T+6ms:    CDP: Page.frameStartedLoading → navigationInProgress = true
T+500ms:  click() returns (after 500ms wait) ⚠️ Page still loading!
T+501ms:  User calls snapshot()
T+501ms:  snapshot() → getBridgeHandle() → waitForNavToClear() → waits...
T+510ms:  Still waiting... (navigationInProgress still true)
T+1000ms: Still waiting...
T+2000ms: Page finishes loading
T+2100ms: CDP: Runtime.executionContextCreated → navigationInProgress = false
T+2100ms: ✅ waitForNavToClear() unblocks, snapshot succeeds

BUT if page takes > 10s to load:
T+10501ms: ❌ waitForNavToClear() throws "Bridge unavailable: navigation taking too long"
```

## The Real-World Scenario

In your case, the CS FIT application pages were taking 5-6 seconds to load:

```
Load Time: 5291ms  (dashboard)
Load Time: 5671ms  (my-calendar)
Load Time: 5926ms  (my-calendar again)
```

So the timeline was:
1. `click("My calendar" link)` - returns after 500ms
2. User calls `snapshot()` - waits for navigation
3. After ~5.5 seconds, page finishes loading and snapshot succeeds
4. **BUT** if page took > 10 seconds, it would timeout

## Solutions

### Option 1: Smart Wait After Click (Recommended)

Detect if navigation happened and wait for it to complete:

```typescript
async click(ref: string): Promise<void> {
  const context = await this.ensureCurrentRoleContext();
  
  // Capture current URL before click
  const urlBefore = context.page.url();
  
  await context.bridgeInjector.callBridgeMethod(context.cdpSession, "click", [ref]);
  
  // Smart wait: check if URL changed (navigation occurred)
  await new Promise((resolve) => setTimeout(resolve, 100));
  const urlAfter = context.page.url();
  
  if (urlBefore !== urlAfter) {
    // Navigation occurred - wait for it to complete
    await context.page.waitForLoadState('networkidle');
  } else {
    // No navigation - just wait a bit for any dynamic content
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
```

### Option 2: Expose Navigation State

Add a method to check if navigation is in progress:

```typescript
async isNavigating(): Promise<boolean> {
  const context = await this.ensureCurrentRoleContext();
  return context.bridgeInjector.navigationInProgress;
}
```

Users can then:
```typescript
await click("e2");
while (await isNavigating()) {
  await wait(100);
}
await snapshot();
```

### Option 3: Auto-Wait in snapshot()

Make `snapshot()` wait longer or use a progressive backoff:

```typescript
async snapshot(): Promise<Snapshot> {
  const context = await this.ensureCurrentRoleContext();
  
  // Try with progressive timeouts
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await context.bridgeInjector.callBridgeMethod(
        context.cdpSession,
        "snapshot"
      );
    } catch (error) {
      if (error.message.includes("navigation taking too long") && attempt < 2) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      throw error;
    }
  }
}
```

### Option 4: Increase Timeout (Quick Fix)

In `BridgeInjector.ts` line 174, increase `maxWaitMs`:

```typescript
private async waitForNavToClear(maxWaitMs = 20000): Promise<void> {
  // Increased from 10000 to 20000
}
```

## Recommended Approach

**Option 1** is best because it:
1. ✅ Handles navigation automatically
2. ✅ Doesn't add unnecessary waits for non-navigating clicks
3. ✅ Uses Puppeteer's built-in navigation detection
4. ✅ Works with both full page and SPA navigations
5. ✅ Transparent to users (no API changes)

## Additional Insight: SPA vs Full Navigation

The injector handles SPA navigations differently (line 54-60):

```typescript
const onSameDoc = (evt: any) => {
  if (this.isTopFrame(evt.frameId)) {
    // SPA route change: keep context alive, just invalidate instance handle
    // DO NOT set navigationInProgress (would stall calls for 10s)
    this.bridgeObjectId = null;
  }
};
```

**SPA navigation** (`navigatedWithinDocument`):
- Context stays alive
- Only invalidates bridge instance handle
- Does NOT set `navigationInProgress`
- Snapshot should work immediately

**Full page navigation** (`frameStartedLoading`):
- Context is destroyed
- Sets `navigationInProgress = true`
- Must wait for new context to be created
- Snapshot fails until navigation completes

Your CS FIT app appears to use **full page navigation** (confirmed by the redirect counts and load times), which is why you hit this issue.

## Testing the Fix

After implementing Option 1, your flow should work:

```typescript
// Before (fails):
await click(e2);  // Returns after 500ms
await snapshot(); // ❌ Fails: navigation in progress

// After (works):
await click(e2);  // Returns after ~5.5s (waits for navigation)
await snapshot(); // ✅ Works: navigation complete
```

## Conclusion

The `snapshot()` function isn't broken - it's working correctly by refusing to capture a page mid-navigation. The issue is that `click()` doesn't wait long enough when navigation occurs. The fix is to make `click()` detect and wait for navigation, just like `navigate()` does.

