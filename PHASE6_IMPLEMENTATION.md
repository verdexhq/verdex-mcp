## Phase 6: Interaction Routing (2-3 hours)

**Risk**: ✅ **LOW** - Uses refIndex from Phase 5, straightforward routing logic  
**Goal**: Route interactions (click, type, structural analysis) to correct frames using refIndex

---

## 🎯 Core Integration: Completing Multi-Frame Support

Phase 6 completes our multi-frame journey by enabling interactions with elements across frames:
- **Phase 3**: Frame discovery and bridge injection
- **Phase 4**: Frame resolution (iframe ref → frameId)
- **Phase 5**: Snapshot expansion with frame-qualified refs
- **Now**: Interaction routing using refIndex

**The Flow:**
```
1. User gets snapshot with frame-qualified refs (e1, f1_e1, f2_e1, etc.)
2. User calls click(f1_e1) on element in child frame
3. parseRef() looks up f1_e1 in refIndex → { frameId: "ABC123", localRef: "e1" }
4. click() routes to frameId "ABC123" with localRef "e1"
5. Bridge in that frame handles the click
```

**Key Insight:** All refs (main and child) are in refIndex for consistent lookup.

---

## ⚠️ Pre-Implementation Investigation (REQUIRED)

**We need to validate Phase 5 refIndex is working before we use it.**

### Assumption 1: refIndex exists and has correct structure

Phase 5 should populate `context.refIndex` with entries mapping refs to frames.

### Assumption 2: refIndex survives between snapshot and interaction

The refIndex should be available on the context for lookups.

### Investigation Test

Create `tests/phase6-prerequisites.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../src/runtime/MultiContextBrowser";

test.describe("Phase 6 Prerequisites", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.initialize();
  });

  test.afterEach(async () => {
    await browser.close();
  });

  test("PREREQUISITE: refIndex exists after snapshot", async () => {
    const html = `
      <button>Main Button</button>
      <iframe srcdoc="<button>Child Button</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    await browser.snapshot();
    
    const context = await (browser as any)._roleContexts.get("default");
    const refIndex = context.refIndex;
    
    expect(refIndex).toBeDefined();
    expect(refIndex).toBeInstanceOf(Map);
    expect(refIndex.size).toBeGreaterThan(0);
    console.log(`✓ RefIndex exists with ${refIndex.size} entries`);
  });

  test("PREREQUISITE: refIndex has correct structure", async () => {
    const html = `
      <button id="main">Main</button>
      <iframe srcdoc="<button id='child'>Child</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();
    
    const context = await (browser as any)._roleContexts.get("default");
    const refIndex = context.refIndex;
    
    // Get a main frame ref
    const mainRef = snapshot.text.match(/Main.*\[ref=(e\d+)\]/)?.[1];
    expect(mainRef).toBeDefined();
    
    const mainEntry = refIndex.get(mainRef!);
    expect(mainEntry).toBeDefined();
    expect(mainEntry).toHaveProperty("frameId");
    expect(mainEntry).toHaveProperty("localRef");
    expect(mainEntry.frameId).toBe(context.mainFrameId);
    expect(mainEntry.localRef).toBe(mainRef);
    console.log(`✓ Main ref structure: ${JSON.stringify(mainEntry)}`);
    
    // Get a child frame ref
    const childRef = snapshot.text.match(/Child.*\[ref=(f\d+_e\d+)\]/)?.[1];
    expect(childRef).toBeDefined();
    
    const childEntry = refIndex.get(childRef!);
    expect(childEntry).toBeDefined();
    expect(childEntry).toHaveProperty("frameId");
    expect(childEntry).toHaveProperty("localRef");
    expect(childEntry.frameId).not.toBe(context.mainFrameId);
    expect(childEntry.localRef).toMatch(/^e\d+$/);
    console.log(`✓ Child ref structure: ${JSON.stringify(childEntry)}`);
  });

  test("PREREQUISITE: refIndex persists after snapshot", async () => {
    const html = `
      <button>Main</button>
      <iframe srcdoc="<button>Child</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();
    
    const context = await (browser as any)._roleContexts.get("default");
    const refIndexBefore = context.refIndex;
    const sizeBefore = refIndexBefore.size;
    
    // Simulate some time passing
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // RefIndex should still be there
    const refIndexAfter = context.refIndex;
    expect(refIndexAfter).toBe(refIndexBefore); // Same object
    expect(refIndexAfter.size).toBe(sizeBefore);
    console.log("✓ RefIndex persists on context");
  });

  test("PREREQUISITE: new snapshot replaces refIndex", async () => {
    const html1 = `<button>Page 1</button>`;
    const html2 = `<button>Page 2</button><button>Page 2 Extra</button>`;
    
    await browser.navigate(`data:text/html,${encodeURIComponent(html1)}`);
    await browser.snapshot();
    
    const context = await (browser as any)._roleContexts.get("default");
    const refIndex1 = context.refIndex;
    const size1 = refIndex1.size;
    
    await browser.navigate(`data:text/html,${encodeURIComponent(html2)}`);
    await browser.snapshot();
    
    const refIndex2 = context.refIndex;
    const size2 = refIndex2.size;
    
    // New snapshot should create new refIndex
    expect(size2).toBeGreaterThan(size1);
    console.log(`✓ RefIndex updated: ${size1} → ${size2} entries`);
  });
});
```

### Run Investigation

```bash
npm test -- tests/phase6-prerequisites.spec.ts
```

### Decision Point ✅

- **ALL 4 tests PASS** → Proceed with Phase 6 implementation
- **refIndex missing** → Phase 5 didn't store refIndex on context
- **Wrong structure** → Phase 5 refIndex format is incorrect
- **Doesn't persist** → Timing issue with context access

**Do not proceed until all 4 prerequisite tests pass.**

---

## Step 6.1: Add parseRef Method

**File**: `src/runtime/MultiContextBrowser.ts`

Add this method after `expandIframes()` (around line 627):

```typescript
/**
 * Parse a global ref into { frameId, localRef } using the snapshot-built refIndex.
 * All refs (main frame and child frames) are in refIndex for consistent lookup.
 * 
 * @param ref - Global ref from snapshot (e1, f1_e1, f2_e1, etc.)
 * @param context - Role context containing refIndex
 * @returns Frame ID and local ref for routing interactions
 * @throws Error if ref is not in refIndex (stale or invalid)
 */
private parseRef(
  ref: string,
  context: RoleContext
): { frameId: string; localRef: string } {
  // Check if refIndex exists (should be populated by snapshot())
  if (!context.refIndex) {
    throw new Error(
      "No refIndex found. Take a snapshot first before interacting with elements."
    );
  }

  // Lookup in refIndex (includes both main frame and child frame refs)
  const entry = context.refIndex.get(ref);
  if (entry) {
    return { frameId: entry.frameId, localRef: entry.localRef };
  }

  // If not found, ref is stale or invalid
  throw new Error(
    `Unknown element reference: ${ref}. ` +
    `Ref may be stale after navigation. Take a new snapshot to get fresh refs.`
  );
}
```

### Build

```bash
npm run build
```

**Gate**: Build should succeed. Method is added but not yet called.

---

## Step 6.2: Test parseRef Directly

Create `tests/interaction-routing.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../src/runtime/MultiContextBrowser";

test.describe("Interaction Routing", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.initialize();
  });

  test.afterEach(async () => {
    await browser.close();
  });

  test("parseRef resolves main frame refs", async () => {
    const html = `<button id="main-btn">Main Button</button>`;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();
    
    const mainRef = snapshot.text.match(/Main Button.*\[ref=(e\d+)\]/)?.[1];
    expect(mainRef).toBeDefined();
    
    const context = await (browser as any)._roleContexts.get("default");
    const parsed = (browser as any).parseRef(mainRef!, context);
    
    expect(parsed).toBeDefined();
    expect(parsed.frameId).toBe(context.mainFrameId);
    expect(parsed.localRef).toBe(mainRef);
    console.log(`✓ Parsed main ref: ${mainRef} → frameId=${parsed.frameId.slice(0, 8)}..., localRef=${parsed.localRef}`);
  });

  test("parseRef resolves child frame refs", async () => {
    const html = `
      <iframe srcdoc="<button id='child-btn'>Child Button</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();
    
    const childRef = snapshot.text.match(/Child Button.*\[ref=(f\d+_e\d+)\]/)?.[1];
    expect(childRef).toBeDefined();
    
    const context = await (browser as any)._roleContexts.get("default");
    const parsed = (browser as any).parseRef(childRef!, context);
    
    expect(parsed).toBeDefined();
    expect(parsed.frameId).not.toBe(context.mainFrameId);
    expect(parsed.localRef).toMatch(/^e\d+$/);
    console.log(`✓ Parsed child ref: ${childRef} → frameId=${parsed.frameId.slice(0, 8)}..., localRef=${parsed.localRef}`);
  });

  test("parseRef throws clear error for invalid ref", async () => {
    const html = `<button>Test</button>`;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    await browser.snapshot();
    
    const context = await (browser as any)._roleContexts.get("default");
    
    expect(() => {
      (browser as any).parseRef("invalid_ref", context);
    }).toThrow(/Unknown element reference.*stale.*snapshot/i);
    
    console.log("✓ Invalid ref throws clear error");
  });

  test("parseRef throws error when no snapshot taken", async () => {
    const html = `<button>Test</button>`;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    // No snapshot() call
    
    const context = await (browser as any)._roleContexts.get("default");
    
    expect(() => {
      (browser as any).parseRef("e1", context);
    }).toThrow(/No refIndex.*snapshot first/i);
    
    console.log("✓ No snapshot error is clear");
  });
});
```

### Run Test

```bash
npm test -- tests/interaction-routing.spec.ts
```

**Gate**: All 4 tests should pass. parseRef correctly resolves refs and handles errors.

---

## Step 6.3: Update click() Method

**File**: `src/runtime/MultiContextBrowser.ts`

Find the `click()` method (around line 680) and replace it:

```typescript
async click(ref: string): Promise<void> {
  const context = await this.ensureCurrentRoleContext();
  
  // Parse ref to get frame and local ref
  const { frameId, localRef } = this.parseRef(ref, context);

  // Set up navigation listener BEFORE clicking (prevents race condition)
  const navigationPromise = context.page
    .waitForNavigation({ waitUntil: "networkidle2", timeout: 1000 })
    .catch((error) => {
      // Timeout is expected if click doesn't navigate
      if (/timeout/i.test(error.message || "")) return null;
      throw error;
    });

  try {
    // Route to correct frame!
    await context.bridgeInjector.callBridgeMethod(
      context.cdpSession,
      "click",
      [localRef],
      frameId
    );
    await navigationPromise;
  } catch (error) {
    // Ensure navigation promise settles
    await navigationPromise.catch(() => {});
    throw error;
  }
}
```

### Build

```bash
npm run build
```

**Gate**: Build should succeed.

---

## Step 6.4: Test click() in Main Frame

Add to `tests/interaction-routing.spec.ts`:

```typescript
  test("clicks button in main frame", async () => {
    const html = `
      <button id="test-btn" onclick="window.clicked = true">Click Me</button>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();
    
    const btnRef = snapshot.text.match(/Click Me.*\[ref=(e\d+)\]/)?.[1];
    expect(btnRef).toBeDefined();
    console.log(`Found button ref: ${btnRef}`);
    
    // Click it
    await browser.click(btnRef!);
    
    // Verify side effect
    const context = await (browser as any)._roleContexts.get("default");
    const clicked = await context.page.evaluate(() => (window as any).clicked);
    
    expect(clicked).toBe(true);
    console.log("✓ Clicked button in main frame");
  });

  test("clicks button inside iframe using frame-qualified ref", async () => {
    const html = `
      <button id="main-btn">Main Button</button>
      <iframe srcdoc="
        <button id='iframe-btn' onclick='window.clicked = true'>Iframe Button</button>
      "></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();
    
    console.log("\n=== SNAPSHOT ===");
    console.log(snapshot.text);
    console.log("================\n");
    
    // Find iframe button ref (frame-qualified)
    const iframeRef = snapshot.text.match(/Iframe Button.*\[ref=(f\d+_e\d+)\]/)?.[1];
    expect(iframeRef).toBeDefined();
    console.log(`Found iframe button ref: ${iframeRef}`);
    
    // Click it (should route to child frame)
    await browser.click(iframeRef!);
    
    // Verify side effect in iframe
    const context = await (browser as any)._roleContexts.get("default");
    const clicked = await context.page.evaluate(() => {
      const iframe = document.querySelector('iframe') as HTMLIFrameElement;
      return (iframe.contentWindow as any)?.clicked === true;
    });
    
    expect(clicked).toBe(true);
    console.log("✓ Clicked button in iframe using frame-qualified ref");
  });
```

### Run Test

```bash
npm test -- tests/interaction-routing.spec.ts
```

**Gate**: Both click tests should pass. Interaction routing works for main and child frames.

---

## Step 6.5: Update type() Method

**File**: `src/runtime/MultiContextBrowser.ts`

Find the `type()` method (around line 715) and replace it:

```typescript
async type(ref: string, text: string): Promise<void> {
  const context = await this.ensureCurrentRoleContext();
  
  // Parse ref to get frame and local ref
  const { frameId, localRef } = this.parseRef(ref, context);

  // Route to correct frame!
  await context.bridgeInjector.callBridgeMethod(
    context.cdpSession,
    "type",
    [localRef, text],
    frameId
  );
}
```

### Build

```bash
npm run build
```

**Gate**: Build should succeed.

---

## Step 6.6: Test type() in Frames

Add to `tests/interaction-routing.spec.ts`:

```typescript
  test("types into input in main frame", async () => {
    const html = `<input type="text" id="test-input" />`;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();
    
    const inputRef = snapshot.text.match(/textbox.*\[ref=(e\d+)\]/)?.[1];
    expect(inputRef).toBeDefined();
    
    await browser.type(inputRef!, "Hello World");
    
    // Verify value
    const context = await (browser as any)._roleContexts.get("default");
    const value = await context.page.evaluate(
      () => (document.getElementById("test-input") as HTMLInputElement)?.value
    );
    
    expect(value).toBe("Hello World");
    console.log("✓ Typed into input in main frame");
  });

  test("types into input inside iframe", async () => {
    const html = `
      <iframe srcdoc="<input type='text' id='iframe-input' />"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();
    
    console.log("\n=== SNAPSHOT ===");
    console.log(snapshot.text);
    console.log("================\n");
    
    // Find iframe input ref (frame-qualified)
    const inputRef = snapshot.text.match(/textbox.*\[ref=(f\d+_e\d+)\]/)?.[1];
    expect(inputRef).toBeDefined();
    console.log(`Found iframe input ref: ${inputRef}`);
    
    // Type into it (should route to child frame)
    await browser.type(inputRef!, "Hello from iframe");
    
    // Verify value in iframe
    const context = await (browser as any)._roleContexts.get("default");
    const value = await context.page.evaluate(() => {
      const iframe = document.querySelector('iframe') as HTMLIFrameElement;
      const input = iframe.contentDocument?.getElementById('iframe-input') as HTMLInputElement;
      return input?.value;
    });
    
    expect(value).toBe("Hello from iframe");
    console.log("✓ Typed into input in iframe");
  });
```

### Run Test

```bash
npm test -- tests/interaction-routing.spec.ts
```

**Gate**: All type tests should pass. Type routing works across frames.

---

## Step 6.7: Update Structural Analysis Methods

**File**: `src/runtime/MultiContextBrowser.ts`

Update these three methods to use `parseRef()`:

### resolve_container

Find around line 740:

```typescript
async resolve_container(ref: string): Promise<any> {
  const context = await this.ensureCurrentRoleContext();
  
  // Parse ref to get frame and local ref
  const { frameId, localRef } = this.parseRef(ref, context);

  // Route to correct frame!
  return await context.bridgeInjector.callBridgeMethod(
    context.cdpSession,
    "resolve_container",
    [localRef],
    frameId
  );
}
```

### inspect_pattern

Find around line 755:

```typescript
async inspect_pattern(ref: string, ancestorLevel: number): Promise<any> {
  const context = await this.ensureCurrentRoleContext();
  
  // Parse ref to get frame and local ref
  const { frameId, localRef } = this.parseRef(ref, context);

  // Route to correct frame!
  return await context.bridgeInjector.callBridgeMethod(
    context.cdpSession,
    "inspect_pattern",
    [localRef, ancestorLevel],
    frameId
  );
}
```

### extract_anchors

Find around line 775:

```typescript
async extract_anchors(ref: string, ancestorLevel: number): Promise<any> {
  const context = await this.ensureCurrentRoleContext();
  
  // Parse ref to get frame and local ref
  const { frameId, localRef } = this.parseRef(ref, context);

  // Route to correct frame!
  return await context.bridgeInjector.callBridgeMethod(
    context.cdpSession,
    "extract_anchors",
    [localRef, ancestorLevel],
    frameId
  );
}
```

### Build

```bash
npm run build
```

**Gate**: Build should succeed.

---

## Step 6.8: Test Structural Analysis in Frames

Add to `tests/interaction-routing.spec.ts`:

```typescript
  test("resolve_container works in main frame", async () => {
    const html = `
      <div id="container">
        <button id="btn">Test</button>
      </div>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();
    
    const btnRef = snapshot.text.match(/button Test.*\[ref=(e\d+)\]/)?.[1];
    expect(btnRef).toBeDefined();
    
    const result = await browser.resolve_container(btnRef!);
    
    expect(result.target.tagName.toLowerCase()).toBe("button");
    expect(result.ancestors[0].attributes.id).toBe("container");
    console.log("✓ resolve_container works in main frame");
  });

  test("resolve_container works inside iframe", async () => {
    const html = `
      <iframe srcdoc="
        <div id='iframe-container'>
          <button id='iframe-btn'>Iframe Button</button>
        </div>
      "></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();
    
    const btnRef = snapshot.text.match(/Iframe Button.*\[ref=(f\d+_e\d+)\]/)?.[1];
    expect(btnRef).toBeDefined();
    console.log(`Found iframe button ref: ${btnRef}`);
    
    const result = await browser.resolve_container(btnRef!);
    
    expect(result.target.tagName.toLowerCase()).toBe("button");
    expect(result.ancestors[0].attributes.id).toBe("iframe-container");
    console.log("✓ resolve_container works in iframe");
  });

  test("inspect_pattern works inside iframe", async () => {
    const html = `
      <iframe srcdoc="
        <ul>
          <li>Item 1</li>
          <li>Item 2</li>
          <li>Item 3</li>
        </ul>
      "></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();
    
    const itemRef = snapshot.text.match(/Item 2.*\[ref=(f\d+_e\d+)\]/)?.[1];
    expect(itemRef).toBeDefined();
    
    const result = await browser.inspect_pattern(itemRef!, 1);
    
    expect(result).toBeDefined();
    expect(result.siblings).toBeDefined();
    expect(result.siblings.length).toBeGreaterThan(0);
    console.log("✓ inspect_pattern works in iframe");
  });

  test("extract_anchors works inside iframe", async () => {
    const html = `
      <iframe srcdoc="
        <div id='parent'>
          <button>Child Button</button>
          <a href='#'>Child Link</a>
        </div>
      "></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();
    
    const divRef = snapshot.text.match(/generic.*\[ref=(f\d+_e\d+)\]/)?.[1];
    expect(divRef).toBeDefined();
    
    const result = await browser.extract_anchors(divRef!, 0);
    
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
    console.log(`✓ extract_anchors works in iframe (found ${result.length} anchors)`);
  });
```

### Run Test

```bash
npm test -- tests/interaction-routing.spec.ts
```

**Gate**: All structural analysis tests should pass.

---

## Step 6.9: Test Stale Ref Handling

Add to `tests/interaction-routing.spec.ts`:

```typescript
  test("throws clear error for stale refs after navigation", async () => {
    const html1 = `<iframe srcdoc="<button>Button 1</button>"></iframe>`;
    const html2 = `<iframe srcdoc="<button>Button 2</button>"></iframe>`;

    await browser.navigate(`data:text/html,${encodeURIComponent(html1)}`);
    const snapshot1 = await browser.snapshot();

    // Get a ref from first page
    const oldRef = snapshot1.text.match(/\[ref=(f1_e\d+)\]/)?.[1];
    expect(oldRef).toBeDefined();
    console.log(`Got ref from first page: ${oldRef}`);

    // Navigate to new page (invalidates old refs)
    await browser.navigate(`data:text/html,${encodeURIComponent(html2)}`);
    await browser.snapshot(); // New snapshot, new refIndex

    // Try to use old ref
    await expect(browser.click(oldRef!)).rejects.toThrow(
      /Unknown element reference.*stale.*snapshot/i
    );
    
    console.log("✓ Stale ref throws clear error");
  });

  test("throws error when interacting before snapshot", async () => {
    const html = `<button>Test</button>`;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    // No snapshot() call
    
    await expect(browser.click("e1")).rejects.toThrow(
      /No refIndex.*snapshot first/i
    );
    
    console.log("✓ No-snapshot error is clear");
  });
```

### Run Test

```bash
npm test -- tests/interaction-routing.spec.ts
```

**Gate**: Error handling tests should pass. Clear error messages guide users.

---

## Step 6.10: Run Full Test Suite

```bash
npm test
```

**Gate**: All existing tests should still pass + new interaction routing tests.

---

## Step 6.11: Visual Demo Test

Create `tests/interaction-routing-demo.spec.ts`:

```typescript
import { test } from "@playwright/test";
import { MultiContextBrowser } from "../src/runtime/MultiContextBrowser";

test.describe("Interaction Routing Demo", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.initialize();
  });

  test.afterEach(async () => {
    await browser.close();
  });

  test("demo: complete multi-frame interaction workflow", async () => {
    const html = `
      <h1>Main Page</h1>
      <input type="text" id="main-input" placeholder="Main input" />
      <button id="main-btn" onclick="alert('Main clicked')">Main Button</button>
      
      <iframe srcdoc="
        <h2>Sidebar Frame</h2>
        <input type='text' id='sidebar-input' placeholder='Sidebar input' />
        <button id='sidebar-btn' onclick='console.log(&quot;Sidebar clicked&quot;)'>Sidebar Button</button>
        
        <iframe srcdoc='
          <h3>Nested Frame</h3>
          <input type=&quot;text&quot; id=&quot;nested-input&quot; placeholder=&quot;Nested input&quot; />
          <button id=&quot;nested-btn&quot;>Nested Button</button>
        '></iframe>
      "></iframe>
      
      <iframe srcdoc="
        <h2>Content Frame</h2>
        <button id='content-btn'>Content Button</button>
      "></iframe>
    `;
    
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();
    
    console.log("\n" + "=".repeat(70));
    console.log("MULTI-FRAME INTERACTION DEMO");
    console.log("=".repeat(70));
    console.log(snapshot.text);
    console.log("=".repeat(70));
    console.log(`Total elements: ${snapshot.elementCount}`);
    console.log("=".repeat(70) + "\n");
    
    // Extract refs for each frame
    const mainInputRef = snapshot.text.match(/Main input.*\[ref=(e\d+)\]/)?.[1];
    const mainBtnRef = snapshot.text.match(/Main Button.*\[ref=(e\d+)\]/)?.[1];
    const sidebarInputRef = snapshot.text.match(/Sidebar input.*\[ref=(f\d+_e\d+)\]/)?.[1];
    const sidebarBtnRef = snapshot.text.match(/Sidebar Button.*\[ref=(f\d+_e\d+)\]/)?.[1];
    const nestedInputRef = snapshot.text.match(/Nested input.*\[ref=(f\d+_e\d+)\]/)?.[1];
    const nestedBtnRef = snapshot.text.match(/Nested Button.*\[ref=(f\d+_e\d+)\]/)?.[1];
    const contentBtnRef = snapshot.text.match(/Content Button.*\[ref=(f\d+_e\d+)\]/)?.[1];
    
    console.log("\n📋 EXTRACTED REFS:");
    console.log(`  Main input: ${mainInputRef}`);
    console.log(`  Main button: ${mainBtnRef}`);
    console.log(`  Sidebar input: ${sidebarInputRef}`);
    console.log(`  Sidebar button: ${sidebarBtnRef}`);
    console.log(`  Nested input: ${nestedInputRef}`);
    console.log(`  Nested button: ${nestedBtnRef}`);
    console.log(`  Content button: ${contentBtnRef}\n`);
    
    // Demonstrate interactions across frames
    console.log("🎯 INTERACTION TESTS:");
    
    if (mainInputRef) {
      await browser.type(mainInputRef, "Main frame text");
      console.log("  ✓ Typed into main frame input");
    }
    
    if (sidebarInputRef) {
      await browser.type(sidebarInputRef, "Sidebar frame text");
      console.log("  ✓ Typed into sidebar frame input (f1)");
    }
    
    if (nestedInputRef) {
      await browser.type(nestedInputRef, "Nested frame text");
      console.log("  ✓ Typed into nested frame input (f2 - nested under f1)");
    }
    
    // Structural analysis in different frames
    console.log("\n🔍 STRUCTURAL ANALYSIS:");
    
    if (sidebarBtnRef) {
      const container = await browser.resolve_container(sidebarBtnRef);
      console.log(`  ✓ resolve_container in sidebar frame: ${container.target.tagName}`);
    }
    
    if (nestedBtnRef) {
      const container = await browser.resolve_container(nestedBtnRef);
      console.log(`  ✓ resolve_container in nested frame: ${container.target.tagName}`);
    }
    
    console.log("\n" + "=".repeat(70));
    console.log("✅ MULTI-FRAME INTERACTION ROUTING COMPLETE!");
    console.log("=".repeat(70) + "\n");
  });
});
```

### Run Demo

```bash
npm test -- tests/interaction-routing-demo.spec.ts
```

**Gate**: Demo should run successfully showing interactions across all frames.

---

## Success Gate ✅

**All tests must pass:**
- ✅ Prerequisites validate refIndex structure
- ✅ parseRef resolves main and child frame refs
- ✅ click() works in main and child frames
- ✅ type() works in main and child frames
- ✅ resolve_container works in all frames
- ✅ inspect_pattern works in all frames
- ✅ extract_anchors works in all frames
- ✅ Stale ref handling provides clear errors
- ✅ All existing tests still pass
- ✅ Visual demo shows complete workflow

**If any fail:**
- **parseRef errors** → Check refIndex structure from Phase 5
- **Interactions fail** → Check frameId routing in callBridgeMethod
- **Wrong frame targeted** → Check parseRef logic
- **Structural tools fail** → Check method signatures and frameId parameter

**Time**: 2-3 hours  
**Output**: Complete multi-frame interaction support!

---

## 🎉 What We Built

Phase 6 completes multi-frame support by routing all interactions through refIndex:

**Before Phase 6:**
```typescript
// Could only interact with main frame elements
await browser.click("e1");  // Main frame only
```

**After Phase 6:**
```typescript
// Can interact with elements in any frame
await browser.click("e1");      // Main frame
await browser.click("f1_e1");   // Child frame 1
await browser.click("f2_e1");   // Nested frame 2

// All operations work across frames
await browser.type("f1_e2", "text in iframe");
const container = await browser.resolve_container("f1_e3");
const pattern = await browser.inspect_pattern("f2_e1", 1);
```

**Key Features:**
- ✅ Transparent frame routing via parseRef()
- ✅ All interaction methods updated (click, type)
- ✅ All structural analysis methods updated
- ✅ Clear error messages for stale refs
- ✅ No changes needed to bridge code
- ✅ Backward compatible with main frame refs

**Architecture:**
```
User calls click(f1_e1)
    ↓
parseRef(f1_e1, context)
    ↓
refIndex.get(f1_e1) → { frameId: "ABC123", localRef: "e1" }
    ↓
callBridgeMethod(cdp, "click", ["e1"], "ABC123")
    ↓
Bridge in frame ABC123 handles click on e1
```

**Next Steps:**
- Merge multi-frame support branch
- Update documentation
- Consider adding hover() and other interaction methods
- Consider adding frame-aware screenshot capture

---

## Phase 6 Complete! 🚀

**Multi-frame support is now fully operational across all Verdex operations.**

