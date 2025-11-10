# Verdex Ref Caching: Design Document

## Executive Summary

**Problem:** Verdex currently destroys all element references (refs) on every snapshot, breaking multi-step exploration workflows and creating a confusing experience for AI agents.

**Solution:** Implement smart ref caching that persists element references across snapshots within the same page session, with automatic cleanup of stale refs.

**Impact:** Enables conversational, multi-step DOM exploration without ref invalidation, dramatically improving usability for AI-driven testing workflows.

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [The Problem](#the-problem)
3. [User Impact](#user-impact)
4. [Proposed Solution](#proposed-solution)
5. [Implementation Plan](#implementation-plan)
6. [API Changes](#api-changes)
7. [Edge Cases](#edge-cases)
8. [Testing Strategy](#testing-strategy)
9. [Rollout Plan](#rollout-plan)

---

## Current State Analysis

### Architecture Overview

Verdex operates as an MCP (Model Context Protocol) server that injects a bridge into browser pages via CDP (Chrome DevTools Protocol). The flow is:

```
Claude AI Agent
    ↓ (MCP calls)
VerdexMCPServer
    ↓
MultiContextBrowser (manages Puppeteer)
    ↓ (CDP)
BridgeInjector (isolated world)
    ↓
Bridge (in-page JavaScript)
    ↓
SnapshotGenerator / StructuralAnalyzer
```

### Current Ref Lifecycle

**File:** `src/browser/core/SnapshotGenerator.ts`

```typescript
generate(): SnapshotResult {
  console.log("Starting snapshot...");
  
  try {
    // ❌ PROBLEM: Destroys all refs on every snapshot
    this.bridge.elements.clear();
    this.bridge.counter = 0;
    this.visited.clear();
    
    // Build new tree with new refs
    const rootChildren = this.buildAriaTree(document.body, true);
    // ... rest of generation
  }
}
```

**Behavior:**
- Every call to `snapshot()` clears the entire `elements` Map
- Counter resets to 0
- Previously assigned refs (e1, e2, e3...) become invalid
- New refs assigned starting from e1 again

### When Snapshots Are Called

1. **After navigation:** `browser_navigate(url)` → auto-calls `snapshot()`
2. **Manual refresh:** `browser_snapshot()` → explicit snapshot
3. **After clicks/interactions:** Often followed by `browser_snapshot()` to see updated state

---

## The Problem

### Problem 1: Refs Break Across Snapshots

**Scenario:**
```typescript
// Step 1: Initial snapshot
browser_navigate("https://app.com")
// Returns: button "Add to Cart" [ref=e25]

// Step 2: Claude wants to explore e25
resolve_container("e25")  // ✅ Works

// Step 3: Page interaction
browser_click("e25")      // Modal opens

// Step 4: Claude wants updated view
browser_snapshot()
// ❌ CLEARS all refs! e25 no longer exists

// Step 5: Try to continue exploration
inspect_pattern("e25", 2) // ❌ FAILS: "Element e25 not found"
```

**Why this fails:**
- `browser_snapshot()` calls `SnapshotGenerator.generate()`
- `generate()` clears `this.bridge.elements` Map
- e25 is deleted
- Subsequent calls fail

### Problem 2: Non-Deterministic Ref Assignment

**Scenario:**
```typescript
// Initial snapshot
browser_snapshot()
// Returns: button "Login" [ref=e10]

// Another snapshot (no DOM changes)
browser_snapshot()
// Returns: button "Login" [ref=e10]  (might be e8 now!)
```

**Issue:** Same element gets different refs depending on:
- Order of DOM traversal
- What other elements appear/disappear
- Timing of async rendering

### Problem 3: Conversational Context Loss

In MCP, Claude expects persistence within a conversation:

```
Claude: "Navigate to the page"
Verdex: "Here's the page. Button 'Submit' is ref=e15"

Claude: "Tell me about e15's container"
Verdex: "Element e15 not found" ❌

Claude: "But you just told me about e15!"
```

This breaks the conversational flow MCP is designed for.

---

## User Impact

### Broken Workflows

#### Workflow 1: Multi-Step Element Analysis
```typescript
// ❌ BROKEN TODAY
1. navigate(url) → "button [ref=e25]"
2. resolve_container("e25") → ✅ works
3. inspect_pattern("e25", 2) → ✅ works  
4. snapshot() → refresh view
5. extract_anchors("e25", 1) → ❌ FAILS (e25 cleared)
```

#### Workflow 2: Dynamic Page Exploration
```typescript
// ❌ BROKEN TODAY
1. navigate(url) → "modal trigger [ref=e12]"
2. click("e12") → modal opens
3. snapshot() → see modal content
4. resolve_container("e12") → ❌ FAILS (want to understand trigger context)
```

#### Workflow 3: Iterative Debugging
```typescript
// ❌ BROKEN TODAY
1. navigate(url) → "button [ref=e8]"
2. click("e8") → error state
3. snapshot() → see error
4. inspect_pattern("e8", 3) → ❌ FAILS (want to debug e8's context)
```

### User Frustration Points

1. **"Why did my ref disappear?"** - No clear mental model for ref lifetime
2. **"I can't explore incrementally"** - Must complete all exploration before any interaction
3. **"Refs keep changing"** - Same element has different refs across snapshots
4. **"Forced linear workflow"** - Can't go back to explore previous elements

---

## Proposed Solution

### Design Principle

**Refs should persist for the lifetime of a page session, surviving snapshots but not navigation.**

### Core Concept: Element Identity Tracking

Instead of clearing refs, we:
1. **Track which elements have refs** using DOM element identity
2. **Reuse refs** for same elements across snapshots
3. **Clean up stale refs** when elements are removed from DOM
4. **Reset on navigation** to ensure clean slate for new pages

### Implementation Strategy

#### Phase 1: Ref Persistence

**File:** `src/browser/core/SnapshotGenerator.ts`

```typescript
export class SnapshotGenerator {
  private bridge: IBridge;
  private config: BridgeConfig;
  private visited = new Set<Node>();
  private seenThisSnapshot = new Set<string>(); // NEW

  generate(): SnapshotResult {
    console.log("Starting snapshot...");

    try {
      // ✅ DON'T clear elements - keep refs persistent
      // this.bridge.elements.clear(); // REMOVED
      
      // ✅ DON'T reset counter - continue from last ref
      // this.bridge.counter = 0; // REMOVED
      
      this.visited.clear();
      this.seenThisSnapshot.clear(); // NEW: Track refs seen in this snapshot

      // Build the tree (will reuse existing refs)
      const rootChildren = this.buildAriaTree(document.body, true);
      
      // Create virtual root
      const rootNode: AriaNode = {
        role: "WebArea",
        name: "",
        children: rootChildren,
        element: document.body,
      };

      // Optimize generic roles
      this.normalizeGenericRoles(rootNode);
      
      // Clean up stale refs AFTER building tree
      this.cleanupStaleRefs(); // NEW

      // Render to text
      const lines: string[] = [];
      this.renderTree(rootNode, lines, "");

      return {
        text: lines.join("\n"),
        elementCount: this.bridge.elements.size,
      };
    } catch (error) {
      console.error("Snapshot error:", error);
      return {
        text: `Error: ${(error as Error).message}`,
        elementCount: 0,
      };
    }
  }

  /**
   * NEW: Find existing ref for an element
   */
  private findExistingRef(element: Element): string | null {
    for (const [ref, info] of this.bridge.elements.entries()) {
      if (info.element === element) {
        return ref;
      }
    }
    return null;
  }

  /**
   * MODIFIED: Create AriaNode with ref reuse
   */
  private createAriaNode(element: Element): AriaNode | null {
    const role = AriaUtils.getRole(element);
    if (!role || role === "presentation" || role === "none") {
      return null;
    }

    const name = AriaUtils.getName(element);
    const ariaProperties = AriaUtils.getAriaProperties(element, role);

    // Skip generic inline elements with only text content
    if (role === "generic") {
      const style = window.getComputedStyle(element);
      const isInline =
        style.display === "inline" || style.display === "inline-block";
      if (
        isInline &&
        element.childNodes.length === 1 &&
        element.childNodes[0].nodeType === Node.TEXT_NODE
      ) {
        return null;
      }
    }

    const ariaNode: AriaNode = {
      role,
      name,
      children: [],
      element,
      ...ariaProperties,
    };

    this.extractElementProperties(element, ariaNode);

    // ✅ NEW: Check if element already has a ref
    if (AriaUtils.isInteractive(element, role)) {
      const existingRef = this.findExistingRef(element);
      
      if (existingRef) {
        // Reuse existing ref
        ariaNode.ref = existingRef;
        this.seenThisSnapshot.add(existingRef);
        
        // Update element info (in case properties changed)
        const elementInfo: ElementInfo = {
          element: element,
          tagName: element.tagName,
          role: role,
          name: name,
          attributes: this.bridge.getAttributes(element),
        };
        this.bridge.elements.set(existingRef, elementInfo);
      } else {
        // Create new ref for new element
        const ref = `e${++this.bridge.counter}`;
        ariaNode.ref = ref;
        this.seenThisSnapshot.add(ref);

        const elementInfo: ElementInfo = {
          element: element,
          tagName: element.tagName,
          role: role,
          name: name,
          attributes: this.bridge.getAttributes(element),
        };

        this.bridge.elements.set(ref, elementInfo);
      }
    }

    return ariaNode;
  }

  /**
   * NEW: Clean up refs for elements no longer in DOM
   */
  private cleanupStaleRefs(): void {
    const refsToDelete: string[] = [];

    for (const [ref, info] of this.bridge.elements.entries()) {
      // If ref wasn't seen in this snapshot AND element not in DOM
      if (!this.seenThisSnapshot.has(ref) && !document.body.contains(info.element)) {
        refsToDelete.push(ref);
      }
    }

    // Delete stale refs
    for (const ref of refsToDelete) {
      this.bridge.elements.delete(ref);
    }

    if (refsToDelete.length > 0) {
      console.log(`Cleaned up ${refsToDelete.length} stale refs:`, refsToDelete);
    }
  }

  /**
   * NEW: Clear all refs (called on navigation)
   */
  clearAllRefs(): void {
    this.bridge.elements.clear();
    this.bridge.counter = 0;
    this.visited.clear();
    this.seenThisSnapshot.clear();
    console.log("All refs cleared (navigation)");
  }
}
```

#### Phase 2: Bridge Interface Update

**File:** `src/browser/types/bridge.ts`

```typescript
export interface IBridge {
  elements: Map<string, ElementInfo>;
  counter: number;
  getAttributes(element: Element): Record<string, string>;
  
  // NEW method
  clearAllRefs(): void;
}
```

**File:** `src/browser/bridge/BridgeFactory.ts`

```typescript
export class Bridge implements IBridge {
  elements = new Map<string, ElementInfo>();
  counter = 0;
  
  // ... existing methods
  
  // NEW: Clear all refs (for navigation)
  clearAllRefs(): void {
    this.elements.clear();
    this.counter = 0;
    if (this.snapshotGenerator) {
      this.snapshotGenerator.clearAllRefs();
    }
  }
}
```

#### Phase 3: Navigation Hook

**File:** `src/runtime/MultiContextBrowser.ts`

```typescript
async navigate(url: string): Promise<Snapshot> {
  const startTime = Date.now();
  
  try {
    const context = await this.ensureCurrentRoleContext();
    
    // Perform navigation
    const response = await context.page.goto(url, {
      waitUntil: "networkidle0",
    });
    
    // ✅ NEW: Clear all refs after navigation (fresh page)
    await context.bridgeInjector.callBridgeMethod(
      context.cdpSession,
      "clearAllRefs",
      []
    );
    
    context.hasNavigated = true;
    
    // Get snapshot (with fresh refs starting from e1)
    const snapshot = await this.snapshot();
    
    // Add navigation metadata
    snapshot.navigation = {
      success: true,
      requestedUrl: url,
      finalUrl: context.page.url(),
      pageTitle: await context.page.title(),
      // ...
    };
    
    return snapshot;
  } catch (error) {
    // ...
  }
}
```

---

## API Changes

### Backward Compatible Changes

#### No Breaking Changes
All existing MCP tool calls remain unchanged:
- `browser_initialize()` - no change
- `browser_navigate(url)` - no change
- `browser_snapshot()` - no change
- `browser_click(ref)` - no change
- `resolve_container(ref)` - works better (refs persist)
- `inspect_pattern(ref, level)` - works better (refs persist)
- `extract_anchors(ref, level)` - works better (refs persist)

#### New Behavior (Transparent Improvement)
- **Refs persist across snapshots** on same page
- **Refs reset on navigation** (clean slate for new page)
- **Stale refs automatically cleaned** when elements removed

### New Internal Method

```typescript
// Bridge method (not exposed to MCP)
clearAllRefs(): void
```

**Purpose:** Called internally by `navigate()` to reset refs for new pages.

**Not exposed to AI:** This is an internal implementation detail.

---

## Edge Cases

### Case 1: Element Moves in DOM

**Scenario:** Element changes position but stays in DOM

```html
<!-- Before -->
<div id="container1">
  <button>Submit</button> <!-- ref=e5 -->
</div>

<!-- After: Button moved -->
<div id="container2">
  <button>Submit</button> <!-- Should still be ref=e5 -->
</div>
```

**Solution:** ✅ Element identity tracked by DOM node reference
- `findExistingRef()` uses `info.element === element`
- DOM node reference stays same even if moved
- ref=e5 persists correctly

### Case 2: Element Removed and Re-Added

**Scenario:** Element completely removed from DOM then re-added

```javascript
const button = document.querySelector('button'); // ref=e5
button.remove();  // Removed from DOM
document.body.appendChild(button); // Re-added
```

**Solution:** ✅ Ref persists because same DOM node
- DOM node object identity preserved
- ref=e5 still valid

### Case 3: Element Replaced with Clone

**Scenario:** Element replaced with `.cloneNode()`

```javascript
const original = document.querySelector('button'); // ref=e5
const clone = original.cloneNode(true);
original.replaceWith(clone); // New DOM node!
```

**Solution:** ✅ New ref assigned
- Clone is different DOM node object
- `findExistingRef()` won't find it
- Gets new ref (e.g., e42)
- Old ref=e5 cleaned up (not in DOM)

### Case 4: SPA Navigation (No Page Reload)

**Scenario:** Single Page App changes route without reload

```javascript
// Route: /home → refs e1-e20
// Route: /dashboard → completely different DOM
```

**Solution:** ⚠️ Refs accumulate (ACCEPTABLE)
- Old refs cleaned up when not in DOM
- New refs assigned for new content
- Counter continues (e21, e22, e23...)
- **Alternative:** Could expose `clearAllRefs()` as MCP tool for SPA navigation

### Case 5: Lazy-Loaded Content

**Scenario:** Infinite scroll, virtual lists

```html
<!-- Scroll position 0: items 1-20 -->
<div ref=e5>Item 1</div>
<!-- ... -->

<!-- Scroll down: items 1-20 unmounted, 21-40 mounted -->
<div ref=e25>Item 21</div>
```

**Solution:** ✅ Works correctly
- Old refs (e5-e24) cleaned up when unmounted
- New refs (e25-e44) assigned to new items
- If scroll back up, items 1-20 get NEW refs (different DOM nodes)

### Case 6: React Reconciliation

**Scenario:** React re-renders component, may reuse or replace DOM nodes

```jsx
// Before render
<button key="submit">Submit</button> // ref=e10

// After re-render
<button key="submit">Submit</button> // Same ref or new?
```

**Solution:** ✅ Depends on React's behavior
- If React reuses DOM node → same ref=e10
- If React creates new node → new ref assigned, old cleaned
- **Works correctly in both cases**

### Case 7: Shadow DOM Traversal

**Scenario:** Element inside Shadow DOM

```html
<custom-element>
  #shadow-root
    <button>Click</button> <!-- ref=e15 -->
</custom-element>
```

**Solution:** ✅ Already supported
- `buildChildrenTree()` traverses shadow roots (line 366-371)
- Refs assigned normally inside shadow DOM
- Persist same as regular DOM

### Case 8: iframe Content

**Scenario:** Element inside iframe (not yet supported)

```html
<iframe src="/payment">
  <!-- Content here not accessible currently -->
</iframe>
```

**Solution:** ⚠️ Not supported yet (see Priority 1 feature)
- Current implementation doesn't traverse iframes
- Future enhancement needed

---

## Testing Strategy

### Unit Tests

**File:** `tests/ref-caching.spec.ts` (new)

```typescript
import { test, expect } from "@playwright/test";

test.describe("Ref Caching", () => {
  test("refs persist across snapshots", async ({ page }) => {
    await page.goto("file://" + process.cwd() + "/demo/demo-page.html");
    
    // First snapshot
    const snapshot1 = await page.evaluate(() => {
      return window.verdexBridge.snapshot();
    });
    
    // Find a button ref
    const buttonRef = snapshot1.text.match(/button.*\[ref=(e\d+)\]/)?.[1];
    expect(buttonRef).toBeTruthy();
    
    // Second snapshot (no DOM changes)
    const snapshot2 = await page.evaluate(() => {
      return window.verdexBridge.snapshot();
    });
    
    // Same button should have same ref
    expect(snapshot2.text).toContain(`[ref=${buttonRef}]`);
  });
  
  test("refs cleared on navigation", async ({ page }) => {
    await page.goto("file://" + process.cwd() + "/demo/demo-page.html");
    
    const snapshot1 = await page.evaluate(() => {
      return window.verdexBridge.snapshot();
    });
    
    // Navigate to different page
    await page.goto("file://" + process.cwd() + "/demo/demo-scenario-2-semantic.html");
    
    const snapshot2 = await page.evaluate(() => {
      return window.verdexBridge.snapshot();
    });
    
    // Refs should restart from e1
    expect(snapshot2.text).toMatch(/\[ref=e1\]/);
  });
  
  test("stale refs cleaned up when element removed", async ({ page }) => {
    await page.goto("file://" + process.cwd() + "/demo/demo-page.html");
    
    // Get initial snapshot
    const snapshot1 = await page.evaluate(() => {
      return window.verdexBridge.snapshot();
    });
    
    const initialCount = snapshot1.elementCount;
    
    // Remove some elements
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      buttons[0]?.remove();
      buttons[1]?.remove();
    });
    
    // Take another snapshot
    const snapshot2 = await page.evaluate(() => {
      return window.verdexBridge.snapshot();
    });
    
    // Element count should decrease
    expect(snapshot2.elementCount).toBeLessThan(initialCount);
  });
  
  test("same element keeps same ref after DOM move", async ({ page }) => {
    await page.goto("file://" + process.cwd() + "/demo/demo-page.html");
    
    // Get initial snapshot
    const snapshot1 = await page.evaluate(() => {
      return window.verdexBridge.snapshot();
    });
    
    // Find a button and its ref
    const buttonRef = snapshot1.text.match(/button "Search" \[ref=(e\d+)\]/)?.[1];
    
    // Move the button in DOM
    await page.evaluate(() => {
      const button = document.querySelector('button');
      const newContainer = document.createElement('div');
      document.body.appendChild(newContainer);
      newContainer.appendChild(button!);
    });
    
    // Take snapshot
    const snapshot2 = await page.evaluate(() => {
      return window.verdexBridge.snapshot();
    });
    
    // Same button should have same ref
    expect(snapshot2.text).toMatch(new RegExp(`button "Search".*\\[ref=${buttonRef}\\]`));
  });
});
```

### Integration Tests

**File:** `tests/mcp-ref-workflow.spec.ts` (new)

```typescript
test("multi-step exploration workflow", async ({ page }) => {
  // Simulates Claude's workflow via MCP
  
  // 1. Navigate
  await initialize();
  const nav = await navigate("file://.../demo-page.html");
  
  // 2. Extract a ref
  const buttonRef = extractRef(nav.snapshot, "Add to Cart");
  
  // 3. Explore container
  const container = await resolveContainer(buttonRef);
  expect(container).toBeTruthy();
  
  // 4. Take another snapshot (simulate page update check)
  const snapshot = await takeSnapshot();
  
  // 5. Continue exploring SAME ref (should work!)
  const pattern = await inspectPattern(buttonRef, 2);
  expect(pattern).toBeTruthy();
  
  // 6. Extract anchors (should still work!)
  const anchors = await extractAnchors(buttonRef, 1);
  expect(anchors).toBeTruthy();
});
```

### Manual Testing Checklist

- [ ] Navigate to page → take snapshot → verify refs start at e1
- [ ] Take multiple snapshots → verify refs stay consistent
- [ ] Click element → take snapshot → verify old refs still work
- [ ] Navigate to new page → verify refs reset to e1
- [ ] Remove elements → take snapshot → verify stale refs cleaned
- [ ] Test with SPA (React Router) → verify behavior
- [ ] Test with dynamic content (modals, dropdowns) → verify refs persist
- [ ] Test with Shadow DOM components → verify refs work

---

## Rollout Plan

### Phase 1: Core Implementation (Week 1)

**Day 1-2:** SnapshotGenerator updates
- Implement `findExistingRef()`
- Modify `createAriaNode()` to reuse refs
- Add `cleanupStaleRefs()`
- Add `clearAllRefs()`

**Day 3:** Bridge interface update
- Update Bridge type definitions
- Implement `clearAllRefs()` in Bridge

**Day 4:** Navigation integration
- Add `clearAllRefs()` call in `navigate()`
- Test navigation behavior

**Day 5:** Testing
- Write unit tests
- Manual testing
- Fix any edge cases

### Phase 2: Validation & Documentation (Week 2)

**Day 1-2:** Integration testing
- Test with real MCP workflows
- Test with various page types
- Performance testing

**Day 3:** Documentation
- Update CHANGELOG.md
- Update README.md with ref caching behavior
- Update SKILL.md if needed

**Day 4:** Review & polish
- Code review
- Performance optimization if needed
- Final testing

**Day 5:** Release
- Tag release (e.g., v0.2.0)
- Publish npm package
- Update examples

### Monitoring After Release

**Week 1-2:** Watch for issues
- Monitor GitHub issues
- Check for unexpected behavior reports
- Performance monitoring

**Week 3-4:** Iterate if needed
- Address any bugs found
- Optimize if performance issues
- Enhance documentation based on user feedback

---

## Performance Considerations

### Memory Usage

**Before:**
- Refs cleared every snapshot: O(1) memory, always small Map

**After:**
- Refs accumulate during page session: O(n) where n = max elements on page
- **Mitigation:** Stale cleanup keeps it bounded
- **Worst case:** Complex SPA with thousands of elements = ~10KB of refs

**Verdict:** ✅ Acceptable overhead for massive usability gain

### CPU Usage

**Before:**
- Clear Map: O(1)
- Build new tree: O(n)

**After:**
- Find existing refs: O(m) where m = current ref count
- Build tree: O(n)
- Cleanup stale: O(m)

**Worst case:** O(n × m) if checking every element against every ref
**Optimization:** Pre-index refs by element: O(1) lookup

```typescript
// Optimization: Build element→ref index
private buildRefIndex(): Map<Element, string> {
  const index = new Map<Element, string>();
  for (const [ref, info] of this.bridge.elements.entries()) {
    index.set(info.element, ref);
  }
  return index;
}
```

**Verdict:** ✅ Negligible impact, can optimize if needed

---

## Alternatives Considered

### Alternative 1: Session-Based Refs

**Idea:** Refs valid only within a "session", manually controlled by AI

```typescript
browser_start_session()  // Refs persist
browser_end_session()    // Refs cleared
```

**Pros:**
- Explicit control
- Clear boundaries

**Cons:**
- ❌ Adds complexity to AI workflow
- ❌ Easy to forget `end_session()`
- ❌ Not intuitive

**Verdict:** ❌ Rejected - too complex for AI

### Alternative 2: Ref Versioning

**Idea:** Version refs like `e5v1`, `e5v2` when element changes

**Pros:**
- Can track element changes over time

**Cons:**
- ❌ Confusing ref names
- ❌ Still need to know which version to use
- ❌ Doesn't solve core problem

**Verdict:** ❌ Rejected - doesn't help usability

### Alternative 3: UUID-Based Refs

**Idea:** Use UUIDs instead of sequential numbers

```typescript
ref="e_3f5a9b2c"
```

**Pros:**
- Globally unique
- Never reused

**Cons:**
- ❌ Harder to remember for AI
- ❌ Longer text (token cost)
- ❌ Doesn't solve ref persistence

**Verdict:** ❌ Rejected - doesn't solve problem, adds cost

### Alternative 4: XPath-Based References

**Idea:** Use XPath as element identifier

```typescript
ref="/html/body/div[2]/button[1]"
```

**Pros:**
- No state to manage
- Works across snapshots

**Cons:**
- ❌ Extremely fragile (DOM changes break paths)
- ❌ Long strings (high token cost)
- ❌ Not human-readable

**Verdict:** ❌ Rejected - worse than current approach

---

## Success Metrics

### Before Implementation (Current State)

- Refs valid: **Only until next snapshot** ❌
- Multi-step workflow success: **~30%** (breaks frequently)
- User confusion: **High** ("Why did my ref disappear?")
- Token efficiency: **Good** (short refs)

### After Implementation (Target)

- Refs valid: **Entire page session** ✅
- Multi-step workflow success: **~95%** (only fails on navigation)
- User confusion: **Low** (intuitive behavior)
- Token efficiency: **Good** (short refs maintained)

### Measurable Goals

1. **Zero ref invalidation** within same page session (excluding navigation)
2. **95%+ workflow completion** for multi-step explorations
3. **<5% memory overhead** for ref caching
4. **No performance regression** in snapshot generation time

---

## Future Enhancements

### Enhancement 1: Explicit Session Control

Add optional MCP tool for SPA navigation:

```typescript
browser_reset_refs()  // Clear all refs manually
```

**Use case:** After SPA route change, AI can reset refs for clean slate

### Enhancement 2: Ref History

Track ref history for debugging:

```typescript
browser_ref_history("e25")
// Returns: Created in snapshot #1, used 5 times, still valid
```

### Enhancement 3: Smart Counter Reset

Reset counter when page is "mostly new":

```typescript
if (newElementCount > oldElementCount * 0.8) {
  // Page is mostly new content, reset counter
  this.bridge.counter = 0;
}
```

**Use case:** Long session with many SPA navigations, counter gets high

---

## Playwright Comparison & Lessons Learned

### Key Architectural Insights from Playwright

After analyzing Playwright's `ariaSnapshot.ts` implementation, several optimizations and design patterns emerged:

#### 1. ✅ **ADOPT: Store Refs on DOM Elements**

**Playwright approach:**
```typescript
(ariaNode.element as any)._ariaRef = ariaRef;
```

**Why this is better:**
- O(1) lookup instead of O(n) Map iteration
- Survives between snapshots automatically
- Simpler implementation

**Updated Verdex approach:**
```typescript
private findExistingRef(element: Element): string | null {
  return (element as any)._verdexRef || null;  // O(1) lookup!
}

private assignRef(element: Element, ref: string): void {
  (element as any)._verdexRef = ref;  // Store on element
  this.bridge.elements.set(ref, elementInfo);
}
```

**Decision:** ✅ **ADOPT IMMEDIATELY** - Clear performance win, no downside

---

#### 2. ✅ **ADOPT: Bidirectional Maps**

**Playwright approach:**
```typescript
elements: Map<string, Element>;  // ref → Element
refs: Map<Element, string>;      // Element → ref
```

**Why this is better:**
- Fast lookups in both directions
- Eliminates need for iteration in structural analysis
- Minimal memory overhead

**Updated Verdex approach:**
```typescript
export interface IBridge {
  elements: Map<string, ElementInfo>;     // ref → ElementInfo
  refsByElement: Map<Element, string>;    // Element → ref (NEW!)
  counter: number;
}
```

**Decision:** ✅ **ADOPT IMMEDIATELY** - Performance optimization, straightforward

---

#### 3. 🤔 **EVALUATE: Semantic Validation vs Identity Tracking**

**Playwright approach:**
```typescript
// Invalidate ref if role OR name changes
if (ariaRef.role !== role || ariaRef.name !== name) {
  createNewRef();
}
```

**Tradeoff Analysis:**

| Approach | Pros | Cons | Best For |
|----------|------|------|----------|
| **Identity Only** (Verdex planned) | • Refs survive state changes<br>• Natural for conversational flow<br>• AI can reference e25 after interactions | • Element semantic identity can change<br>• "Submit" button becoming "Loading..." keeps same ref | Multi-step workflows where AI follows element through state changes |
| **Semantic Validation** (Playwright) | • Refs match semantic identity<br>• New state = new ref (clearer)<br>• More conservative/safer | • Refs break on loading states<br>• Breaks conversational flow<br>• AI loses reference during interactions | Snapshot assertions where semantic stability matters |
| **Hybrid** (Validate role only) | • Refs survive text changes<br>• Catches major changes (div→button)<br>• Balanced approach | • More complexity<br>• Need to define "major change" | Production apps with dynamic text |

**Real-world scenario:**
```typescript
// AI explores add-to-cart button
resolve_container("e25")  // <button>Add to Cart</button>

// User clicks, button updates
<button>Adding...</button>  // Same element, different text

// AI wants to continue exploring
inspect_pattern("e25", 2)

// Identity: ✅ Works (same ref)
// Semantic: ❌ Fails (new ref assigned)
// Hybrid: ✅ Works (button→button, role same)
```

**Recommendation for Verdex:**

**START with Identity-only** (simplest, matches your conversational use case), then **ADD Hybrid mode as option** if users report issues:

```typescript
interface BridgeConfig {
  refStabilityMode?: 'identity' | 'hybrid';  // Default: 'identity'
}

// In createAriaNode (only if hybrid mode enabled):
if (this.config.refStabilityMode === 'hybrid') {
  const storedInfo = this.bridge.elements.get(existingRef);
  if (storedInfo?.role !== role) {
    // Major change (role), issue new ref
    createNewRef();
  }
  // Name change OK (loading states, etc)
}
```

**Decision:** ✅ **Start with Identity-only**, add Hybrid as v0.3.0 enhancement

---

#### 4. ✅ **KEEP: Navigation-Based Counter Reset**

**Playwright approach:**
```typescript
let lastRef = 0;  // Module-level, NEVER resets
// refs: e1, e2, ... e847, e848, e999...
```

**Verdex approach:**
```typescript
clearAllRefs() {
  this.bridge.counter = 0;  // Reset on navigation
  // New page: e1, e2, e3... (fresh start)
}
```

**Tradeoff Analysis:**

| Approach | Playwright (Never Reset) | Verdex (Reset on Nav) |
|----------|-------------------------|----------------------|
| **Token efficiency** | ❌ High numbers in snapshots | ✅ Low numbers always |
| **AI readability** | ❌ "button [ref=e1847]" | ✅ "button [ref=e5]" |
| **Mental model** | Neutral (refs are opaque IDs) | ✅ New page = fresh refs |
| **Long SPA sessions** | ❌ Counter grows unbounded | ✅ Can reset manually |
| **Implementation** | ✅ Simpler (do nothing) | Requires nav hook |

**Why Playwright doesn't reset:**
- Their use case: programmatic test assertions (`page.locator('[aria-ref=e1847]')`)
- Numbers don't matter for code
- Simpler (no special handling)

**Why Verdex SHOULD reset:**
- Your use case: AI reading/reasoning about snapshots
- Lower numbers = better token efficiency
- "New page = fresh start" matches human intuition
- Debugging is easier with e1-e20 vs e847-e867

**Decision:** ✅ **KEEP your reset strategy** - appropriate for AI use case

---

#### 5. 🤔 **CONSIDER: Optional Counter Persistence for SPAs**

**Challenge:** Long SPA sessions where user wants continuity across "route changes"

**Example:**
```typescript
// User on /dashboard, refs e1-e30
navigate('/profile')  // New route, but same SPA

// Option A: Reset (current plan) → refs e1-e20 (fresh)
// Option B: Continue → refs e31-e50 (continuous)
```

**Tradeoff:**
- **Reset:** Clean slate, lower numbers, clear boundaries
- **Continue:** Refs from /dashboard stay valid if cached (rare)

**Recommendation:** Keep reset as default, add **optional control**:

```typescript
// Expose as MCP tool for advanced users
browser_reset_refs(options?: { keepCounter?: boolean })

// Most users: just reset everything
// Advanced: preserve counter for SPA continuity
```

**Decision:** ✅ **Reset by default**, add optional flag in v0.3.0

---

#### 6. ✅ **ENHANCE: Active Cleanup Strategy**

**Playwright approach:**
- No explicit cleanup
- Relies on garbage collection when elements removed
- Module-level refs persist until page unload

**Verdex approach:**
- Active `cleanupStaleRefs()` 
- Removes refs when elements leave DOM
- Explicit memory management

**Why Verdex approach is BETTER:**

| Aspect | Playwright | Verdex |
|--------|-----------|---------|
| Long sessions | Counter grows forever | Counter resets, refs cleaned |
| Memory leaks | Possible (refs on removed elements) | Prevented (active cleanup) |
| Debugging | Stale refs invisible | Clear logging |
| SPA apps | Memory accumulates | Stays bounded |

**Decision:** ✅ **KEEP your cleanup** - more robust for long sessions

---

### Updated Implementation (Final Design)

```typescript
export class SnapshotGenerator {
  private bridge: IBridge;
  private config: BridgeConfig;
  private visited = new Set<Node>();
  private seenThisSnapshot = new Set<string>();

  generate(): SnapshotResult {
    // ✅ Keep refs persistent across snapshots
    this.visited.clear();
    this.seenThisSnapshot.clear();
    
    const rootChildren = this.buildAriaTree(document.body, true);
    this.cleanupStaleRefs();
    
    // ... render tree
  }

  // ✅ IMPROVED: O(1) lookup using DOM property
  private findExistingRef(element: Element): string | null {
    return (element as any)._verdexRef || null;
  }

  private createAriaNode(element: Element): AriaNode | null {
    const role = AriaUtils.getRole(element);
    if (!role || role === "presentation" || role === "none") return null;

    const name = AriaUtils.getName(element);
    const ariaNode: AriaNode = { role, name, children: [], element };

    if (AriaUtils.isInteractive(element, role)) {
      // ✅ Fast O(1) lookup
      const existingRef = (element as any)._verdexRef;
      
      if (existingRef) {
        // Identity-based reuse (start simple)
        ariaNode.ref = existingRef;
        this.seenThisSnapshot.add(existingRef);
        
        // Update metadata
        const elementInfo: ElementInfo = {
          element, tagName: element.tagName, role, name,
          attributes: this.bridge.getAttributes(element),
        };
        this.bridge.elements.set(existingRef, elementInfo);
        this.bridge.refsByElement.set(element, existingRef);
      } else {
        // New ref
        const ref = `e${++this.bridge.counter}`;
        (element as any)._verdexRef = ref;  // ✅ Store on element
        ariaNode.ref = ref;
        this.seenThisSnapshot.add(ref);
        
        const elementInfo: ElementInfo = { /* ... */ };
        this.bridge.elements.set(ref, elementInfo);
        this.bridge.refsByElement.set(element, ref);  // ✅ Bidirectional
      }
    }

    return ariaNode;
  }

  private cleanupStaleRefs(): void {
    const refsToDelete: string[] = [];

    for (const [ref, info] of this.bridge.elements.entries()) {
      if (!this.seenThisSnapshot.has(ref) && !document.body.contains(info.element)) {
        refsToDelete.push(ref);
      }
    }

    for (const ref of refsToDelete) {
      const info = this.bridge.elements.get(ref);
      if (info) {
        delete (info.element as any)._verdexRef;  // ✅ Clear DOM property
        this.bridge.refsByElement.delete(info.element);
      }
      this.bridge.elements.delete(ref);
    }
  }

  clearAllRefs(): void {
    // ✅ Clear everything including DOM properties
    for (const info of this.bridge.elements.values()) {
      delete (info.element as any)._verdexRef;
    }
    
    this.bridge.elements.clear();
    this.bridge.refsByElement.clear();
    this.bridge.counter = 0;
    this.visited.clear();
    this.seenThisSnapshot.clear();
  }
}
```

---

## Conclusion

Ref caching is a **critical usability improvement** for Verdex that aligns with MCP's conversational nature. The implementation is **low-risk, high-reward**:

✅ **Backward compatible** - no breaking changes
✅ **Performance optimized** - O(1) lookups via DOM properties
✅ **Simple implementation** - ~250 lines with Playwright optimizations
✅ **Huge UX improvement** - enables multi-step workflows
✅ **Better than Playwright** - active cleanup + navigation awareness
✅ **Natural behavior** - refs persist as users expect

### Implementation Priority

**Phase 1 (Week 1) - Core + Playwright Optimizations:**
- Identity-based ref persistence
- Store refs on DOM elements (_verdexRef property)
- Bidirectional maps (elements + refsByElement)
- Active cleanup
- Navigation reset

**Phase 2 (v0.3.0) - Optional Enhancements:**
- Hybrid validation mode (role-only)
- Optional counter persistence
- Performance profiling

**Recommendation:** Implement Phase 1 immediately in next minor version (v0.2.0), incorporating Playwright's performance patterns while maintaining Verdex's superior lifecycle management

