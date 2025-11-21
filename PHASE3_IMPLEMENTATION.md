## Phase 3: Frame Discovery (1-2 hours)

**Risk**: ⚠️ **MEDIUM** - Needs Phase 2 working  
**Goal**: Automatically discover and inject bridges into all frames after navigation

### Step 3.1: Add Frame Discovery Methods

**File**: `src/runtime/MultiContextBrowser.ts`

Add these methods (around line 360, after the `navigate()` method ends):

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
    
    // Mark context as navigated (injector handles bridge lifecycle)
    context.hasNavigated = true;
    
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
    await browser.initialize();
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
    
    const context = await (browser as any)._roleContexts.get("default");
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
    
    const context = await (browser as any)._roleContexts.get("default");
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