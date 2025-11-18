# Multi-Frame Support: Current State Analysis

**Date**: November 18, 2025  
**Author**: Codebase Analysis  
**Purpose**: Document current Verdex capabilities vs. requirements for cross-origin iframe support (e.g., Stripe checkout flows)

---

## Executive Summary

**Current State**: Verdex MCP **does not support iframe content traversal or interaction**. The bridge is only injected into the main frame, and iframe elements are treated as opaque containers.

**Required State**: To handle complete checkout flows with embedded payment iframes (Stripe, PayPal, etc.), Verdex needs multi-frame support similar to Playwright MCP's approach.

**Gap**: Approximately **4-6 files** need modification, with an estimated **500-700 lines** of new/modified code.

---

## Current Architecture

### 1. Bridge Injection (Single Frame Only)

**File**: `src/runtime/BridgeInjector.ts`

**Current Behavior**:
- Injects isolated world into **main frame only**
- Uses `mainFrameId` parameter to target top-level frame
- No frame discovery or child frame handling

```typescript
// Lines 131-141: Creates isolated world for main frame only
async injectOnceIntoCurrentDoc(cdp: CDPSession): Promise<void> {
  const { executionContextId } = await cdp.send("Page.createIsolatedWorld", {
    frameId: this.mainFrameId!,  // ← Only main frame
    worldName: this.worldName,
    grantUniveralAccess: false,
  });
  // ... inject bundle
}
```

**Listeners**:
- `Runtime.executionContextCreated` - Only matches main frame context
- `Page.navigatedWithinDocument` - Only handles main frame SPA navigation
- `Page.frameNavigated` - Only resets state for main frame

**Key Limitation**: No frame discovery, no per-frame injection, no frame lifecycle management.

---

### 2. Snapshot Generation (Main Frame Only)

**File**: `src/browser/core/SnapshotGenerator.ts`

**Current Behavior**:
- Starts traversal from `document.body` (main frame's body)
- No special handling for `<iframe>` elements
- Iframes appear as regular elements with role (if ARIA role assigned) or are skipped

```typescript
// Line 59: Starts from main document only
const rootChildren = this.buildAriaTree(document.body, true);
```

**When encountering iframes**:
- `buildAriaTree()` treats `<iframe>` as a regular element
- No attempt to access `iframe.contentDocument`
- No recursive traversal into iframe contents
- Result: Iframe contents are **invisible** to the snapshot

**Test Evidence** (`tests/bridge-lifecycle.spec.ts`, lines 414-429):
```typescript
// Iframe content should be captured (if bridge handles iframes)
// This is the key test - does the snapshot actually see inside iframes?
const hasIframe1Content =
  snapshot.text.includes("Iframe 1") &&
  snapshot.text.includes("Iframe Button 1");

// Log what we found for debugging
if (!hasIframe1Content || !hasIframe2Content) {
  console.log(
    "Snapshot does not include iframe content - this may be expected browser security behavior"
  );
}
```

**Key Limitation**: No iframe content traversal, no frame-aware snapshot generation.

---

### 3. Element References (Main Frame Only)

**File**: `src/browser/types/elements.ts`

**Current Structure**:
```typescript
export type ElementInfo = {
  element: Element;
  tagName: string;
  role: string;
  name: string;
  attributes: Record<string, string>;
  // frameId?: string;  ← MISSING: No frame tracking
};
```

**Reference Format**:
- Main frame elements: `e1`, `e2`, `e3`, ...
- **No frame-qualified refs**: No `f1e1`, `f2e3` format
- Single `elements` Map in bridge with no frame disambiguation

**Key Limitation**: Cannot distinguish elements from different frames, no frame-qualified ref format.

---

### 4. Interaction Routing (Main Frame Assumed)

**File**: `src/runtime/MultiContextBrowser.ts`

**Current Behavior**:
```typescript
// Lines 400-446: Click assumes main frame
async click(ref: string): Promise<void> {
  const context = await this.ensureCurrentRoleContext();
  
  // No ref parsing for frame identification
  // Direct call to main bridge
  await context.bridgeInjector.callBridgeMethod(
    context.cdpSession,
    "click",
    [ref]  // ← Passed as-is, no frame routing
  );
}
```

**All interaction methods** (`click`, `type`, `resolve_container`, `inspect_pattern`, `extract_anchors`):
- Assume element is in main frame
- No ref parsing to extract frame ID
- No frame routing logic

**Key Limitation**: Cannot interact with iframe elements even if refs existed.

---

### 5. Structural Analysis (Main Frame Only)

**File**: `src/browser/core/StructuralAnalyzer.ts`

**Current Behavior**:
```typescript
// Line 38-41: Walks up parent chain
let current = targetInfo.element.parentElement;
let level = 1;

while (current && current !== document.body) {
  // ... build ancestor info
  current = current.parentElement;
}
```

**Assumes**:
- All elements are in main document
- `document.body` is the root
- Parent traversal never crosses frame boundaries

**For iframe elements**:
- Would walk up to main frame's document.body
- Cannot analyze structure within iframe context
- Cross-frame parent relationships are impossible

**Key Limitation**: Structural tools don't work across frame boundaries.

---

## What Playwright MCP Does (The Target)

Based on the Playwright MCP implementation shared by the user:

### Frame Traversal During Snapshot

**Playwright's approach** (`packages/playwright-core/src/server/page.ts:1038-1061`):

1. **Detect iframe markers** in initial snapshot
2. **For each iframe marker**:
   - Use `frame.selectors.resolveFrameForSelector()` to get child Frame object
   - **Recursively call** `snapshotFrameForAI()` on child frame
   - Assign frame ordinal (`f1`, `f2`, etc.)
   - **Merge child snapshot** with parent snapshot (with indentation)

**Result**: Complete accessibility tree including all iframe contents, with frame-qualified refs.

### Key Difference

| Aspect | Verdex (Current) | Playwright MCP |
|--------|-----------------|----------------|
| Frame discovery | None | `page.frames()` |
| Bridge injection | Main frame only | Per-frame injection |
| Snapshot traversal | Main document only | Recursive frame expansion |
| Element refs | `e1`, `e2` | `e1` (main), `f1e1` (iframe) |
| Interaction | Main frame only | Frame-aware routing |
| Cross-origin | Not supported | **Fully supported** |

---

## Required Changes for Multi-Frame Support

### Phase 1: Frame Discovery and Management

**File**: `src/runtime/MultiContextBrowser.ts`

**Add**:
- Frame discovery using `page.frames()`
- Frame ordinal mapping (`Map<string, number>`)
- Frame lifecycle listeners (`frameattached`, `framenavigated`, `framedetached`)
- Frame-to-bridge mapping (`Map<string, FrameBridgeInfo>`)

**New types**:
```typescript
type FrameBridgeInfo = {
  frame: Frame;
  frameId: string;
  ordinal: number;
  bridgeInjector: BridgeInjector;
  contextId: number;
};
```

**Estimated**: ~150 lines

---

### Phase 2: Per-Frame Bridge Injection

**File**: `src/runtime/BridgeInjector.ts`

**Modify**:
- Remove main frame restriction from `setupAutoInjection()`
- Accept `frameId` parameter (instead of `mainFrameId`)
- Handle frame-specific context creation
- Update listeners to be frame-aware

**File**: `src/runtime/MultiContextBrowser.ts`

**Add**:
- `injectBridgeIntoFrame(frame, ordinal)` method
- `discoverAndInjectFrames()` method called after navigation
- Frame lifecycle handlers to inject into new frames

**Estimated**: ~100 lines

---

### Phase 3: Snapshot Generation with Frame Expansion

**File**: `src/browser/core/SnapshotGenerator.ts`

**Add**:
1. **Iframe detection** in `buildAriaTree()`:
   ```typescript
   if (element.tagName === 'IFRAME') {
     return this.buildIframeTree(element as HTMLIFrameElement, isVisible);
   }
   ```

2. **Iframe tree builder** `buildIframeTree()`:
   - Create iframe container node with ref
   - Try to access `iframe.contentDocument`
   - Recursively call `buildAriaTree()` on iframe body
   - Apply frame prefix to all refs in subtree
   - Handle cross-origin gracefully

3. **Frame-qualified ref generation**:
   - Accept `framePrefix` parameter (e.g., "f1")
   - Generate refs as `${framePrefix}_e${counter}` or `e${counter}`
   - Store frame context in element info

**Alternatively (Playwright's approach)**:

**File**: `src/runtime/MultiContextBrowser.ts`

**Add**:
- `expandIframeMarkers(snapshot, frameMap)` method
- For each iframe marker in snapshot:
  - Find corresponding Frame object
  - Call `snapshotFrame(frameId, prefix)` via bridge
  - Merge child snapshot with proper indentation

**Estimated**: ~150 lines (either approach)

---

### Phase 4: Frame-Qualified Element Refs

**File**: `src/browser/types/elements.ts`

**Modify**:
```typescript
export type ElementInfo = {
  element: Element;
  tagName: string;
  role: string;
  name: string;
  attributes: Record<string, string>;
  frameId?: string;  // NEW: track which frame element is in
};
```

**File**: `src/browser/core/SnapshotGenerator.ts`

**Modify**:
- `createAriaNode()` to detect element's owner frame
- Generate frame-qualified refs: `f1_e5`, `f2_e12`
- Store `frameId` in ElementInfo
- Helper: `getFrameId(element)` to determine frame ordinal

**Estimated**: ~50 lines

---

### Phase 5: Frame-Aware Interaction Routing

**File**: `src/runtime/MultiContextBrowser.ts`

**Add**:
1. **Ref parser**:
   ```typescript
   private parseRef(ref: string): { frameId: string | null, localRef: string } {
     const match = ref.match(/^(f\d+)_e(\d+)$/);
     if (match) {
       return { frameId: match[1], localRef: `e${match[2]}` };
     }
     return { frameId: null, localRef: ref };
   }
   ```

2. **Frame routing**:
   - Parse ref to extract frame ordinal
   - Look up Frame object and its bridge injector
   - Route call to correct frame's bridge
   - Convert ref back to local format for bridge

**Modify**:
- `click()`, `type()`, `resolve_container()`, `inspect_pattern()`, `extract_anchors()`
- All methods need ref parsing and frame routing

**Estimated**: ~80 lines

---

### Phase 6: Testing

**File**: `tests/iframe-support.spec.ts` (new)

**Tests needed**:
- Same-origin iframe snapshot capture
- Cross-origin iframe detection (graceful handling)
- Frame-qualified ref generation
- Interaction with iframe elements
- Nested iframe handling
- Multiple iframes on same page
- Structural tools on iframe elements
- Frame lifecycle (dynamic iframes)

**Estimated**: ~250 lines

---

## Implementation Approaches: Two Options

### Option A: Single Bridge with Frame Context (Original Plan)

**Architecture**:
- One bridge instance in main frame
- Bridge uses `iframe.contentDocument` to access child frames
- Single `elements` Map with frame-qualified refs
- All interaction happens through main bridge

**Pros**:
- Simpler architecture (one bridge)
- No frame-to-bridge mapping needed
- DOM traversal works naturally (parent/child relationships)

**Cons**:
- Relies on `iframe.contentDocument` (may have cross-origin issues)
- All element storage in one Map (potential conflicts)
- Frame detection logic in browser (less control from Node.js)

---

### Option B: Per-Frame Bridge (Playwright's Approach)

**Architecture**:
- Separate bridge instance for each frame
- Each bridge maintains its own `elements` Map with local refs (`e1`, `e2`, ...)
- Node.js layer maintains frame-to-bridge mapping
- Ref format: `f1e5` → "frame 1, element e5 in that frame's bridge"

**Pros**:
- Works reliably with cross-origin iframes (proven by Playwright)
- Clean separation of concerns (each frame is isolated)
- Frame lifecycle handled by Puppeteer's Frame API
- Better control from Node.js layer

**Cons**:
- More complex architecture (multiple bridges)
- Requires frame-to-bridge mapping maintenance
- Ref translation needed at Node.js layer
- More lifecycle management code

**Recommendation**: **Option B (Per-Frame Bridge)** is the proven approach used by Playwright MCP and handles cross-origin iframes reliably.

---

## Estimated Complexity

### Code Changes

| Component | Lines Added/Modified | Files |
|-----------|---------------------|-------|
| Frame discovery & management | ~150 | MultiContextBrowser.ts |
| Per-frame bridge injection | ~100 | BridgeInjector.ts, MultiContextBrowser.ts |
| Snapshot frame expansion | ~150 | SnapshotGenerator.ts or MultiContextBrowser.ts |
| Frame-qualified refs | ~50 | elements.ts, SnapshotGenerator.ts |
| Interaction routing | ~80 | MultiContextBrowser.ts |
| Tests | ~250 | iframe-support.spec.ts (new) |
| **Total** | **~780 lines** | **6 files** |

### Risk Assessment

**Low Risk**:
- ✅ Frame discovery via `page.frames()` (Puppeteer built-in)
- ✅ Per-frame bridge injection (similar to current main frame injection)
- ✅ Ref parsing and routing (straightforward string manipulation)

**Medium Risk**:
- ⚠️ Frame lifecycle management (need thorough testing)
- ⚠️ Snapshot expansion recursion (potential infinite loops)
- ⚠️ Cross-origin handling (need graceful fallbacks)

**High Risk**:
- 🔴 Performance with many iframes (potential scalability issue)
- 🔴 Nested iframe depth limits (need to prevent stack overflow)
- 🔴 Frame detachment during interaction (race conditions)

---

## Testing Strategy

### Unit Tests

1. **Frame discovery**: Mock page with multiple frames, verify ordinal assignment
2. **Ref parsing**: Test `parseRef()` with various ref formats
3. **Frame-qualified ref generation**: Test `getFrameId()` and ref creation

### Integration Tests

1. **Same-origin iframe snapshot**: Verify iframe contents appear in snapshot
2. **Cross-origin iframe handling**: Verify graceful degradation (no crash)
3. **Interaction routing**: Click/type in iframe elements, verify correct frame
4. **Structural tools**: Run resolve_container on iframe element, verify ancestors within frame
5. **Nested iframes**: Test 2-3 levels of nesting
6. **Multiple iframes**: Test page with 3+ iframes, verify distinct refs

### E2E Tests

1. **Stripe test checkout flow**: Navigate to staging + Stripe iframe, verify LLM can see and interact
2. **Dynamic iframe injection**: Test pages that add iframes after initial load
3. **Frame navigation**: Test iframe that navigates to new URL, verify bridge persistence

---

## Open Questions

### 1. Frame Ordinal Stability

**Question**: Do frame ordinals remain stable across page navigations?

**Implications**:
- If ordinals change, refs become stale
- May need frame ID-based refs instead of ordinal-based

**Mitigation**: Store frame metadata (URL, name) to re-match frames after navigation

### 2. Cross-Origin Access in Automation Mode

**Question**: Does `grantUniversalAccess: true` actually work for cross-origin iframes in Puppeteer?

**Research needed**: Test with real Stripe iframe to confirm

**Fallback**: If not, provide metadata-only approach for cross-origin frames

### 3. Frame Detachment Timing

**Question**: What happens if iframe is removed during interaction (e.g., between snapshot and click)?

**Mitigation**: Validate frame existence before interaction, throw clear error

### 4. Snapshot Size with Many Iframes

**Question**: How does snapshot size scale with 10+ iframes?

**Mitigation**: 
- Implement iframe depth limit (default: 2-3 levels)
- Provide config option to skip iframes beyond certain depth
- Lazy frame expansion (only expand marked iframes on demand)

---

## Success Criteria

To consider multi-frame support "complete", Verdex must:

1. ✅ **Discover all frames** on a page (same-origin and cross-origin)
2. ✅ **Inject bridge** into each accessible frame
3. ✅ **Generate snapshot** that includes iframe contents (with frame-qualified refs)
4. ✅ **Route interactions** to correct frame based on ref
5. ✅ **Handle structural tools** within iframe context
6. ✅ **Gracefully handle** cross-origin iframes (metadata, no crash)
7. ✅ **Support Stripe test checkout** flow (real-world validation)
8. ✅ **Pass all existing tests** (no regressions)
9. ✅ **Pass new iframe tests** (comprehensive coverage)

---

## Next Steps

### If Implementing

1. **Start with Option B (Per-Frame Bridge)** - proven approach
2. **Phase 1 first**: Frame discovery and ordinal mapping
3. **Test with simple same-origin iframe** before tackling cross-origin
4. **Validate with Stripe test mode** before considering "done"

### If Not Implementing (Current Workaround)

Document the limitation clearly:
- Verdex does not support iframe content exploration
- For cross-origin iframes, LLM should generate `frameLocator()` code directly
- Provide example patterns for common iframe scenarios (Stripe, PayPal, etc.)

---

## Appendix: Playwright MCP Frame Expansion Algorithm

Based on user's shared code:

```typescript
// Playwright's approach (simplified)
async function snapshotFrameForAI(frame, frameOrdinal, frameIds) {
  // 1. Generate initial snapshot of this frame
  const lines = await generateSnapshot(frame);
  
  // 2. Find iframe markers in snapshot
  const result = [];
  for (const line of lines) {
    const match = line.match(/^(\s*)- iframe (?:\[active\] )?\[ref=([^\]]*)\]/);
    
    if (!match) {
      result.push(line);
      continue;
    }
    
    // 3. Resolve iframe marker to actual Frame object
    const iframeRef = match[2];
    const childFrame = await resolveFrameForRef(iframeRef);
    
    if (childFrame) {
      // 4. Recursively snapshot child frame
      const childOrdinal = frameIds.length + 1;
      frameIds.push(childFrame._id);
      const childSnapshot = await snapshotFrameForAI(childFrame, childOrdinal, frameIds);
      
      // 5. Merge with indentation
      result.push(line + ':');
      for (const childLine of childSnapshot) {
        result.push('  ' + childLine);  // Indent child content
      }
    } else {
      // Frame not accessible
      result.push(line);
    }
  }
  
  return result;
}
```

**Key insight**: Snapshot generation happens in **two passes**:
1. **First pass**: Each frame generates its own snapshot (iframes appear as markers)
2. **Second pass**: Node.js expands iframe markers by recursively calling snapshot on child frames

This approach cleanly separates concerns:
- Browser code: Generate snapshot of current frame only
- Node.js code: Orchestrate multi-frame traversal and merging

---

## Conclusion

Verdex MCP currently **does not support iframe content exploration**, which blocks LLM-driven testing of modern checkout flows with embedded payment iframes (Stripe, PayPal, etc.).

**To achieve parity with Playwright MCP**, Verdex needs:
- Per-frame bridge injection (~6 files, ~780 lines of code)
- Frame-aware snapshot generation with recursive expansion
- Frame-qualified element references (f1e5, f2e3)
- Interaction routing based on frame-qualified refs

**The implementation is feasible** and follows proven patterns from Playwright MCP. The main technical challenge is frame lifecycle management and graceful handling of cross-origin restrictions.

**Expected timeline**: 3-5 days for experienced developer familiar with Puppeteer CDP and the Verdex codebase.

