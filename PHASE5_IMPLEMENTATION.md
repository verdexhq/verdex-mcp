## Phase 5: Snapshot Expansion (2-3 hours)

**Risk**: ⚠️ **MEDIUM** - Integrates Phase 3 (discovery) and Phase 4 (resolution)  
**Goal**: Recursively expand iframe markers to show complete multi-frame snapshots

---

## 🎯 Core Integration: Bringing It All Together

Phase 5 integrates our previous work:
- **Phase 3**: Frame discovery and bridge injection
- **Phase 4**: Frame resolution (iframe ref → frameId)
- **Now**: Recursive snapshot expansion with ref rewriting

**The Flow:**
```
1. Snapshot main frame → "- iframe [ref=e2]"
2. Resolve e2 → frameId (using Phase 4)
3. Snapshot child frame → "- button [ref=e1]"
4. Rewrite refs: e1 → f1_e1 (frame-qualified)
5. Indent and merge into parent
6. Recursively expand any child iframes
```

---

## ⚠️ Pre-Implementation Investigation (REQUIRED)

**We need to validate Phase 3 is working before we integrate.**

### Assumption 1: Bridges exist in child frames after navigation

Phase 3 should have set up automatic frame discovery. Let's verify it works.

### Assumption 2: We can snapshot child frames directly

We need to confirm `callBridgeMethod` works on child frameIds.

### Investigation Test

Create `tests/phase5-prerequisites.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../src/runtime/MultiContextBrowser";

test.describe("Phase 5 Prerequisites", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.initialize();
  });

  test.afterEach(async () => {
    await browser.close();
  });

  test("PREREQUISITE: child frames have bridges after navigation", async () => {
    const html = `
      <button>Main</button>
      <iframe srcdoc="<button>Child</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    
    const context = await (browser as any)._roleContexts.get("default");
    const cdp = context.cdpSession;
    
    // Get frame tree
    const { frameTree } = await cdp.send('Page.getFrameTree');
    console.log(`Main frame: ${frameTree.frame.id}`);
    console.log(`Child frames: ${frameTree.childFrames?.length || 0}`);
    
    expect(frameTree.childFrames).toBeDefined();
    expect(frameTree.childFrames.length).toBeGreaterThan(0);
    
    // Check main frame has bridge
    const mainState = context.bridgeInjector.getFrameState(
      cdp,
      frameTree.frame.id
    );
    expect(mainState?.bridgeObjectId).toBeTruthy();
    console.log("✓ Main frame has bridge");
    
    // Check child frame has bridge
    const childFrameId = frameTree.childFrames[0].frame.id;
    const childState = context.bridgeInjector.getFrameState(
      cdp,
      childFrameId
    );
    expect(childState?.bridgeObjectId).toBeTruthy();
    console.log(`✓ Child frame ${childFrameId} has bridge`);
  });

  test("PREREQUISITE: can snapshot child frame directly", async () => {
    const html = `
      <button>Main</button>
      <iframe srcdoc="<button>Child Button</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    
    const context = await (browser as any)._roleContexts.get("default");
    const cdp = context.cdpSession;
    
    // Get child frameId
    const { frameTree } = await cdp.send('Page.getFrameTree');
    const childFrameId = frameTree.childFrames[0].frame.id;
    
    // Try to snapshot the child frame directly
    const childSnapshot = await context.bridgeInjector.callBridgeMethod(
      cdp,
      "snapshot",
      [],
      childFrameId
    );
    
    console.log("\n=== CHILD FRAME SNAPSHOT ===");
    console.log(childSnapshot.text);
    console.log("============================\n");
    
    expect(childSnapshot.text).toBeTruthy();
    expect(childSnapshot.text).toContain("Child Button");
    console.log("✓ Can snapshot child frames directly");
  });

  test("PREREQUISITE: resolveFrameFromRef works end-to-end", async () => {
    const html = `
      <button>Main</button>
      <iframe srcdoc="<button>Child</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();
    
    // Get iframe ref from main snapshot
    const iframeRef = snapshot.text.match(/iframe.*\[ref=(e\d+)\]/)?.[1];
    expect(iframeRef).toBeDefined();
    console.log(`Found iframe ref: ${iframeRef}`);
    
    const context = await (browser as any)._roleContexts.get("default");
    
    // Resolve it
    const frameInfo = await (browser as any).resolveFrameFromRef(
      context,
      context.mainFrameId,
      iframeRef!
    );
    
    expect(frameInfo).toBeDefined();
    expect(frameInfo.frameId).toBeTruthy();
    console.log(`✓ Resolved to frameId: ${frameInfo.frameId}`);
    
    // Verify it's actually a child frame
    const { frameTree } = await context.cdpSession.send('Page.getFrameTree');
    const childFrameIds = frameTree.childFrames.map((c: any) => c.frame.id);
    expect(childFrameIds).toContain(frameInfo.frameId);
    console.log("✓ frameId is valid child frame");
  });
});
```

### Run Investigation

```bash
npm test -- tests/phase5-prerequisites.spec.ts
```

### Decision Point ✅

- **ALL 3 tests PASS** → Proceed with Phase 5 implementation
- **Child frames missing bridges** → Phase 3 (frame discovery) needs fixing
- **Cannot snapshot child frames** → Check `callBridgeMethod` frame parameter
- **resolveFrameFromRef fails** → Phase 4 has issues

**Do not proceed until all 3 prerequisite tests pass.**

---

## Step 5.1: Add Type Imports (if needed)

**File**: `src/runtime/MultiContextBrowser.ts`

Check if `GlobalRefIndex` and `RefIndexEntry` are imported from `./types`. If not, add them to the imports at the top:

```typescript
import {
  RoleContext,
  RoleConfig,
  GlobalRefIndex,
  RefIndexEntry,
} from "./types";
```

### Build and verify types

```bash
npm run build
```

**Gate**: Build should succeed with no type errors.

---

## Step 5.2: Add Iframe Expansion Method (Part 1 - Non-Recursive)

**File**: `src/runtime/MultiContextBrowser.ts`

Add this method after `resolveFrameFromRef()` (around line 508):

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
      const childSnapshot = await context.bridgeInjector.callBridgeMethod<{
        text: string;
        elementCount: number;
      }>(
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

### Build

```bash
npm run build
```

**Gate**: Build should succeed. Method is added but not yet called.

---

## Step 5.3: Update snapshot() Method to Use Expansion

**File**: `src/runtime/MultiContextBrowser.ts`

Find the current `snapshot()` method (around line 510) and replace it:

```typescript
async snapshot(): Promise<Snapshot> {
  try {
    const context = await this.ensureCurrentRoleContext();

    // Get main frame snapshot (with iframe markers from bridge)
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
      0, // ordinal counter starts at 0
      refIndex
    );

    // Store refIndex on context for interaction routing (Phase 6)
    context.refIndex = refIndex;

    return {
      text: expanded.text,
      elementCount: mainSnapshot.elementCount + expanded.elementCount,
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

### Build

```bash
npm run build
```

**Gate**: Build should succeed.

---

## Step 5.4: Test Basic Iframe Expansion

Create `tests/iframe-snapshot-expansion.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../src/runtime/MultiContextBrowser";

test.describe("Iframe Snapshot Expansion", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.initialize();
  });

  test.afterEach(async () => {
    await browser.close();
  });

  test("expands single iframe content in snapshot", async () => {
    const html = `
      <button>Main Button</button>
      <iframe srcdoc="<button>Child Button</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();
    
    console.log("\n=== EXPANDED SNAPSHOT ===");
    console.log(snapshot.text);
    console.log("=========================\n");
    
    // GATE 1: Should contain both main and child content
    expect(snapshot.text).toContain("Main Button");
    expect(snapshot.text).toContain("Child Button");
    console.log("✓ Contains both main and child content");
    
    // GATE 2: Child button should have frame-qualified ref
    expect(snapshot.text).toMatch(/Child Button.*\[ref=f1_e\d+\]/);
    console.log("✓ Child refs are frame-qualified (f1_eN)");
    
    // GATE 3: Should have iframe with children indicator (colon)
    expect(snapshot.text).toMatch(/iframe.*\[ref=e\d+\]:/);
    console.log("✓ Iframe has children indicator (:)");
    
    // GATE 4: Child content should be indented
    const childButtonLine = snapshot.text.split('\n').find(l => l.includes('Child Button'));
    expect(childButtonLine).toMatch(/^\s+/); // Starts with whitespace
    console.log("✓ Child content is indented");
  });

  test("handles empty iframe gracefully", async () => {
    const html = `
      <button>Main</button>
      <iframe src="about:blank"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();
    
    console.log("\n=== EMPTY IFRAME ===");
    console.log(snapshot.text);
    console.log("====================\n");
    
    // Should handle gracefully - either expand empty or show unavailable
    expect(snapshot.text).toContain("Main");
    expect(snapshot.text).toMatch(/iframe.*\[ref=e\d+\]/);
    console.log("✓ Empty iframe handled gracefully");
  });
});
```

### Run Test

```bash
npm test -- tests/iframe-snapshot-expansion.spec.ts
```

**Gate**: Tests should pass. If not:
- Check that `resolveFrameFromRef` is being called correctly
- Check that child frame snapshots work
- Check ref rewriting regex
- Check indentation logic

---

## Step 5.5: Test Multiple Iframes

Add to `tests/iframe-snapshot-expansion.spec.ts`:

```typescript
  test("handles multiple sibling iframes", async () => {
    const html = `
      <button>Main</button>
      <iframe srcdoc="<button>Frame 1</button>"></iframe>
      <iframe srcdoc="<button>Frame 2</button>"></iframe>
      <iframe srcdoc="<button>Frame 3</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();
    
    console.log("\n=== MULTIPLE IFRAMES ===");
    console.log(snapshot.text);
    console.log("========================\n");
    
    // GATE: Should contain all frame content
    expect(snapshot.text).toContain("Main");
    expect(snapshot.text).toContain("Frame 1");
    expect(snapshot.text).toContain("Frame 2");
    expect(snapshot.text).toContain("Frame 3");
    console.log("✓ Contains all frame content");
    
    // GATE: Should have distinct frame prefixes (f1, f2, f3)
    expect(snapshot.text).toMatch(/Frame 1.*\[ref=f1_e\d+\]/);
    expect(snapshot.text).toMatch(/Frame 2.*\[ref=f2_e\d+\]/);
    expect(snapshot.text).toMatch(/Frame 3.*\[ref=f3_e\d+\]/);
    console.log("✓ Each frame has distinct prefix (f1, f2, f3)");
  });
```

### Run Test

```bash
npm test -- tests/iframe-snapshot-expansion.spec.ts
```

**Gate**: Should pass. Validates frame ordinal counter works correctly.

---

## Step 5.6: Test Nested Iframes

Add to `tests/iframe-snapshot-expansion.spec.ts`:

```typescript
  test("handles nested iframes recursively", async () => {
    const html = `
      <button>Main</button>
      <iframe srcdoc="
        <button>Level 1</button>
        <iframe srcdoc='<button>Level 2</button>'></iframe>
      "></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();
    
    console.log("\n=== NESTED IFRAMES ===");
    console.log(snapshot.text);
    console.log("======================\n");
    
    // GATE: Should contain all levels
    expect(snapshot.text).toContain("Main");
    expect(snapshot.text).toContain("Level 1");
    expect(snapshot.text).toContain("Level 2");
    console.log("✓ Contains all nesting levels");
    
    // GATE: Should have nested frame prefixes (f1 for level 1, f2 for level 2)
    expect(snapshot.text).toMatch(/Level 1.*\[ref=f1_e\d+\]/);
    expect(snapshot.text).toMatch(/Level 2.*\[ref=f2_e\d+\]/);
    console.log("✓ Nested frames have correct prefixes");
    
    // GATE: Level 2 should be more indented than Level 1
    const level1Line = snapshot.text.split('\n').find(l => l.includes('Level 1'));
    const level2Line = snapshot.text.split('\n').find(l => l.includes('Level 2'));
    const level1Indent = level1Line?.match(/^(\s*)/)?.[1].length || 0;
    const level2Indent = level2Line?.match(/^(\s*)/)?.[1].length || 0;
    expect(level2Indent).toBeGreaterThan(level1Indent);
    console.log(`✓ Indentation: Level 1 (${level1Indent}) < Level 2 (${level2Indent})`);
  });
```

### Run Test

```bash
npm test -- tests/iframe-snapshot-expansion.spec.ts
```

**Gate**: Should pass. Validates recursion and nested indentation works correctly.

---

## Step 5.7: Test Ref Index Building

Add to `tests/iframe-snapshot-expansion.spec.ts`:

```typescript
  test("builds correct refIndex for frame-qualified refs", async () => {
    const html = `
      <button id="main-btn">Main Button</button>
      <iframe srcdoc="<button id='child-btn'>Child Button</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();
    
    const context = await (browser as any)._roleContexts.get("default");
    const refIndex = context.refIndex;
    
    console.log("\n=== REF INDEX ===");
    console.log("Entries:", refIndex.size);
    for (const [ref, entry] of refIndex.entries()) {
      console.log(`  ${ref} -> frameId: ${entry.frameId}, localRef: ${entry.localRef}`);
    }
    console.log("=================\n");
    
    // GATE: refIndex should exist
    expect(refIndex).toBeDefined();
    expect(refIndex.size).toBeGreaterThan(0);
    console.log(`✓ RefIndex has ${refIndex.size} entries`);
    
    // GATE: Main frame refs should map to main frameId
    const mainButtonRef = snapshot.text.match(/Main Button.*\[ref=(e\d+)\]/)?.[1];
    if (mainButtonRef) {
      const entry = refIndex.get(mainButtonRef);
      expect(entry).toBeDefined();
      expect(entry?.frameId).toBe(context.mainFrameId);
      expect(entry?.localRef).toBe(mainButtonRef);
      console.log(`✓ Main ref ${mainButtonRef} maps to main frame`);
    }
    
    // GATE: Child frame refs should map to child frameId
    const childButtonRef = snapshot.text.match(/Child Button.*\[ref=(f1_e\d+)\]/)?.[1];
    if (childButtonRef) {
      const entry = refIndex.get(childButtonRef);
      expect(entry).toBeDefined();
      expect(entry?.frameId).not.toBe(context.mainFrameId);
      expect(entry?.localRef).toMatch(/^e\d+$/); // Local ref without prefix
      console.log(`✓ Child ref ${childButtonRef} maps to child frame (local: ${entry?.localRef})`);
    }
  });
```

### Run Test

```bash
npm test -- tests/iframe-snapshot-expansion.spec.ts
```

**Gate**: Should pass. Validates refIndex is built correctly for Phase 6 (interaction routing).

---

## Step 5.8: Run Full Test Suite

```bash
npm test
```

**Gate**: All existing tests should still pass + new iframe expansion tests.

---

## Step 5.9: Visual Verification Test

Create `tests/iframe-visual-demo.spec.ts` for manual inspection:

```typescript
import { test } from "@playwright/test";
import { MultiContextBrowser } from "../src/runtime/MultiContextBrowser";

test.describe("Iframe Visual Demo", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.initialize();
  });

  test.afterEach(async () => {
    await browser.close();
  });

  test("visual demo: complex nested iframe structure", async () => {
    const html = `
      <h1>Main Page</h1>
      <button>Main Action</button>
      
      <iframe srcdoc="
        <h2>Sidebar</h2>
        <button>Sidebar Button</button>
        <iframe srcdoc='<button>Nested Nav</button>'></iframe>
      "></iframe>
      
      <iframe srcdoc="
        <h2>Content Area</h2>
        <button>Content Button 1</button>
        <button>Content Button 2</button>
      "></iframe>
      
      <footer>
        <iframe srcdoc='<button>Footer Action</button>'></iframe>
      </footer>
    `;
    
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();
    
    console.log("\n" + "=".repeat(60));
    console.log("COMPLEX NESTED IFRAME SNAPSHOT");
    console.log("=".repeat(60));
    console.log(snapshot.text);
    console.log("=".repeat(60));
    console.log(`Total elements: ${snapshot.elementCount}`);
    console.log("=".repeat(60) + "\n");
    
    // Manual verification:
    // - All content visible?
    // - Proper indentation?
    // - Frame refs correct (f1, f2, f3, f4)?
    // - Nested iframe (f2) properly nested under f1?
  });
});
```

### Run Visual Demo

```bash
npm test -- tests/iframe-visual-demo.spec.ts
```

**Gate**: Manually review output for correctness. Should look clean and hierarchical.

---

## Success Gate ✅

**All tests must pass:**
- ✅ Single iframe expansion works
- ✅ Multiple sibling iframes work
- ✅ Nested iframes work recursively
- ✅ Ref index is built correctly
- ✅ All existing tests still pass
- ✅ Visual demo looks correct

**If any fail:**
- **Missing child content** → Check `resolveFrameFromRef` and frame discovery
- **Wrong ref prefixes** → Check frame ordinal counter logic
- **Indentation wrong** → Check indentation calculation
- **refIndex empty** → Check ref rewriting and index population

**Time**: 2-3 hours  
**Output**: Complete multi-frame snapshots with frame-qualified refs!

---

## 🎉 What We Built

Phase 5 creates **hierarchical multi-frame snapshots** like this:

```
- generic [active]
  - heading Main Page [level=1]
    - text: Main Page
  - button Main Action [ref=e1]
    - text: Main Action
  - iframe [ref=e2]:
    - generic [active]
      - heading Sidebar [level=2]
        - text: Sidebar
      - button Sidebar Button [ref=f1_e1]
        - text: Sidebar Button
      - iframe [ref=f1_e2]:
        - button Nested Nav [ref=f2_e1]
          - text: Nested Nav
  - iframe [ref=e3]:
    - generic [active]
      - heading Content Area [level=2]
        - text: Content Area
      - button Content Button 1 [ref=f3_e1]
      - button Content Button 2 [ref=f3_e2]
```

**Key Features:**
- ✅ All frames visible in single snapshot
- ✅ Frame-qualified refs (f1_e1, f2_e1, etc.)
- ✅ Proper hierarchical indentation
- ✅ RefIndex maps global refs to frame context
- ✅ Handles nested, multiple, and empty iframes

**Next Phase**: Use refIndex to route interactions to correct frames!

---

