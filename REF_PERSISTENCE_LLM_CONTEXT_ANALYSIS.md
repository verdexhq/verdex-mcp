# Ref Persistence: Error Handling for LLM Tool Calls

## The Real Question

When an LLM calls an MCP tool like `get_ancestors(ref="e25")`, what's the MOST USEFUL response when the ref is invalid?

---

## Current State Analysis

### Inconsistent Error Handling (Problem!)

**extract_anchors** (Good! 👍)
```typescript
export type AnchorsResult = {
  error?: string;           // ← Optional error field!
  ancestorAt: {...} | null;
  descendants: AnchorInfo[];
  totalDescendants: number;
  maxDepthReached: number;
};
```

Returns structured data with optional error:
```json
{
  "error": "Element e25 not found",
  "ancestorAt": null,
  "descendants": [],
  "totalDescendants": 0,
  "maxDepthReached": 0
}
```

**resolve_container** (Bad! 👎)
```typescript
export type ContainerResult = {
  target: {...};
  ancestors: ContainerInfo[];
};

// Returns: ContainerResult | null  ← No error field!
```

Returns `null` on error - handler must guess why:
```typescript
if (!result) {
  return { content: [{ text: "Element e25 not found" }] };
  // But WHY? Not found? Removed? Level too high?
}
```

**inspect_pattern** (Bad! 👎)
```typescript
export type PatternResult = {
  ancestorLevel: number;
  containerAt: {...};
  targetSiblingIndex: number | null;
  siblings: PatternInfo[];
};

// Returns: PatternResult | null  ← No error field!
```

Same problem - `null` gives no context about failure.

---

## Three Approaches Compared

### Option 1: Throw Errors (Plan's Proposal)

```typescript
// Bridge method
resolve_container(ref: string): ContainerResult {
  validateElement(ref); // throws!
  const analyzer = new StructuralAnalyzer(this);
  return analyzer.resolveContainer(ref);
}
```

**LLM Experience:**
```
Tool: get_ancestors
Arguments: {"ref": "e25"}
Result: ERROR - "Element e25 not found. Try browser_snapshot() to refresh."
```

**Pros:**
- Clear error messages
- Fails fast
- LLM gets actionable guidance

**Cons:**
- ❌ Inconsistent with `extract_anchors` pattern
- ❌ Forces handlers to use try/catch
- ❌ Error context is just a string (no structured data)
- ❌ MCP framework may not preserve full error details

---

### Option 2: Return Null (Current)

```typescript
resolve_container(ref: string): ContainerResult | null {
  const info = this.bridge.elements.get(ref);
  if (!info) return null;
  // ...
}
```

**LLM Experience:**
```
Tool: get_ancestors
Arguments: {"ref": "e25"}
Result: "Element e25 not found (Role: default)"
```

**Pros:**
- Simple to implement
- Handler can format custom messages

**Cons:**
- ❌ No context about WHY it failed
- ❌ Handler must guess the reason
- ❌ Inconsistent with `extract_anchors`
- ❌ LLM can't distinguish error types

---

### Option 3: Return Error Objects (BEST! ⭐)

```typescript
export type ContainerResult = {
  // Success case
  target: {
    ref: string;
    tagName: string;
    text: string;
  };
  ancestors: ContainerInfo[];
} | {
  // Error case (like AnchorsResult!)
  error: string;
  errorType?: 'not_found' | 'removed' | 'level_too_high';
  target: null;
  ancestors: [];
  suggestion?: string;
};
```

**LLM Experience:**
```json
{
  "error": "Element e25 not found in current snapshot",
  "errorType": "not_found",
  "target": null,
  "ancestors": [],
  "suggestion": "Try calling browser_snapshot() to refresh refs"
}
```

**Pros:**
- ✅ **Structured error context** - LLM knows exactly what went wrong
- ✅ **Consistent** with `extract_anchors` pattern
- ✅ **Actionable guidance** in the response
- ✅ **Type-safe** - TypeScript knows all fields
- ✅ **No exceptions** - clean control flow
- ✅ **MCP-friendly** - returns data, not errors

**Cons:**
- Requires type changes (but they're good changes!)

---

## Recommendation: Use Error Objects

### Why This Is Best For LLMs

**1. Structured Context**
The LLM can programmatically understand the error:
```json
{
  "error": "Element e25 was removed from DOM",
  "errorType": "removed",
  "suggestion": "Take a new snapshot() to refresh refs"
}
```

**2. Consistent Pattern**
All three methods return the same shape:
- `extract_anchors` ← Already has `error?`
- `resolve_container` ← Add `error?`
- `inspect_pattern` ← Add `error?`

**3. Better Than Exceptions**
MCP tools should return data, not throw. This lets the LLM:
- See the full error context
- Get actionable suggestions
- Distinguish between error types
- Continue workflow intelligently

**4. Handler Simplicity**
```typescript
async handleGetAncestors(args: { ref: string }) {
  const result = await this.browser.resolve_container(ref);
  
  // Simple check - no try/catch!
  if (result.error) {
    return {
      content: [{
        type: "text",
        text: `❌ ${result.error}\n💡 ${result.suggestion}`
      }]
    };
  }
  
  // Format success case
  return { content: [{ type: "text", text: formatResult(result) }] };
}
```

---

## Implementation Changes

### 1. Update Type Definitions

**src/shared-types.ts** (Update ContainerResult and PatternResult):

```typescript
export type ContainerResult = {
  error?: string;           // Optional error message
  errorType?: 'not_found' | 'removed' | 'disconnected';
  suggestion?: string;      // What the LLM should do next
  target: {
    ref: string;
    tagName: string;
    text: string;
  } | null;                 // null when error
  ancestors: ContainerInfo[];
};

export type PatternResult = {
  error?: string;
  errorType?: 'not_found' | 'removed' | 'level_too_high';
  suggestion?: string;
  ancestorLevel: number;
  containerAt: {
    tagName: string;
    attributes: Attributes;
  } | null;                 // null when error
  targetSiblingIndex: number | null;
  siblings: PatternInfo[];
};
```

### 2. Update StructuralAnalyzer

**src/browser/core/StructuralAnalyzer.ts**:

```typescript
resolveContainer(ref: string): ContainerResult {
  const targetInfo = this.bridge.elements.get(ref);
  
  if (!targetInfo) {
    return {
      error: "Element not found in current snapshot",
      errorType: "not_found",
      suggestion: "Call browser_snapshot() to refresh refs",
      target: null,
      ancestors: []
    };
  }
  
  if (!targetInfo.element.isConnected) {
    return {
      error: `Element ${ref} (${targetInfo.role} "${targetInfo.name}") was removed from DOM`,
      errorType: "removed",
      suggestion: "Take a new snapshot() to get updated refs",
      target: null,
      ancestors: []
    };
  }
  
  // Success case - compute ancestors
  const ancestors: ContainerInfo[] = [];
  // ... existing logic
  
  return {
    target: {
      ref: ref,
      tagName: targetInfo.tagName.toLowerCase(),
      text: targetInfo.element.textContent?.trim() || ""
    },
    ancestors: ancestors
  };
}

inspectPattern(ref: string, ancestorLevel: number): PatternResult {
  const targetInfo = this.bridge.elements.get(ref);
  
  if (!targetInfo) {
    return {
      error: "Element not found in current snapshot",
      errorType: "not_found",
      suggestion: "Call browser_snapshot() to refresh refs",
      ancestorLevel: ancestorLevel,
      containerAt: null,
      targetSiblingIndex: null,
      siblings: []
    };
  }
  
  if (!targetInfo.element.isConnected) {
    return {
      error: `Element ${ref} was removed from DOM`,
      errorType: "removed",
      suggestion: "Take a new snapshot() to get updated refs",
      ancestorLevel: ancestorLevel,
      containerAt: null,
      targetSiblingIndex: null,
      siblings: []
    };
  }
  
  // Climb to ancestor level
  let container: Element | null = targetInfo.element;
  for (let i = 0; i < ancestorLevel; i++) {
    if (!container?.parentElement || container.parentElement === document.body) {
      return {
        error: `Ancestor level ${ancestorLevel} is too high - reached document.body`,
        errorType: "level_too_high",
        suggestion: "Try a lower ancestor level (use resolve_container to see available levels)",
        ancestorLevel: ancestorLevel,
        containerAt: null,
        targetSiblingIndex: null,
        siblings: []
      };
    }
    container = container.parentElement;
  }
  
  // Success case - analyze siblings
  // ... existing logic
}
```

### 3. Update Bridge Methods (Remove validateElement)

**src/browser/bridge/BridgeFactory.ts**:

```typescript
static create(config: BridgeConfig = {}): IBridge {
  const bridge: IBridge = {
    elements: new Map<string, ElementInfo>(),
    counter: 0,

    snapshot(): SnapshotResult {
      const generator = new SnapshotGenerator(this, config);
      return generator.generate();
    },

    click(ref: string): void {
      const info = this.elements.get(ref);
      if (!info) {
        throw new Error(`Element ${ref} not found. Try browser_snapshot() to refresh.`);
      }
      if (!info.element.isConnected) {
        this.elements.delete(ref);
        delete (info.element as any)._verdexRef;
        throw new Error(
          `Element ${ref} (${info.role} "${info.name}") was removed from DOM. ` +
          `Take a new snapshot() to refresh refs.`
        );
      }
      (info.element as HTMLElement).click();
    },

    type(ref: string, text: string): void {
      const info = this.elements.get(ref);
      if (!info) {
        throw new Error(`Element ${ref} not found. Try browser_snapshot() to refresh.`);
      }
      if (!info.element.isConnected) {
        this.elements.delete(ref);
        delete (info.element as any)._verdexRef;
        throw new Error(
          `Element ${ref} was removed from DOM. ` +
          `Take a new snapshot() to refresh refs.`
        );
      }
      const el = info.element as HTMLInputElement | HTMLTextAreaElement;
      el.focus();
      el.value = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },

    clearAllRefs(): void {
      for (const info of this.elements.values()) {
        delete (info.element as any)._verdexRef;
      }
      this.elements.clear();
      this.counter = 0;
    },

    // Analysis methods just pass through - no validation!
    resolve_container(ref: string): ContainerResult {
      const analyzer = new StructuralAnalyzer(this, config);
      return analyzer.resolveContainer(ref);
    },

    inspect_pattern(ref: string, ancestorLevel: number): PatternResult {
      const analyzer = new StructuralAnalyzer(this, config);
      return analyzer.inspectPattern(ref, ancestorLevel);
    },

    extract_anchors(ref: string, ancestorLevel: number): AnchorsResult {
      const analyzer = new StructuralAnalyzer(this, config);
      return analyzer.extractAnchors(ref, ancestorLevel);
    },

    getAttributes(element: Element): Record<string, string> {
      return DOMAnalyzer.getAllAttributes(element);
    },
  };

  return bridge;
}
```

### 4. Update Handlers (Simpler!)

**src/server/handlers/AnalysisHandlers.ts**:

```typescript
async handleGetAncestors(args: { ref: string }) {
  const { ref } = args;
  const result = await this.browser.resolve_container(ref);
  
  // Check for error
  if (result.error) {
    return {
      content: [{
        type: "text",
        text: `❌ ${result.error}\n\n💡 Suggestion: ${result.suggestion}\n\n(Role: ${this.browser.getCurrentRole()})`
      }]
    };
  }
  
  // Format success case (existing code)
  let output = `Ancestry analysis for element ${ref}...\n`;
  // ... rest of formatting logic unchanged
}

async handleGetSiblings(args: { ref: string; ancestorLevel: number }) {
  const { ref, ancestorLevel } = args;
  const result = await this.browser.inspect_pattern(ref, ancestorLevel);
  
  // Check for error
  if (result.error) {
    return {
      content: [{
        type: "text",
        text: `❌ ${result.error}\n\n💡 Suggestion: ${result.suggestion}\n\n(Role: ${this.browser.getCurrentRole()})`
      }]
    };
  }
  
  // Format success case (existing code)
  // ... rest unchanged
}

async handleGetDescendants(args: { ref: string; ancestorLevel: number }) {
  const { ref, ancestorLevel } = args;
  const result = await this.browser.extract_anchors(ref, ancestorLevel);
  
  // Already has error field! Just check it
  if (result.error) {
    return {
      content: [{
        type: "text",
        text: `❌ ${result.error}\n\n(Role: ${this.browser.getCurrentRole()})`
      }]
    };
  }
  
  // Format success case (existing code)
  // ... rest unchanged
}
```

### 5. Update Interface

**src/browser/types/bridge.ts**:

```typescript
export type IBridge = {
  elements: Map<string, ElementInfo>;
  counter: number;

  // Core functionality
  snapshot(): SnapshotResult;
  click(ref: string): void;        // ← Throws on error
  type(ref: string, text: string): void;  // ← Throws on error
  clearAllRefs(): void;

  // Structural analysis - returns error objects, never throws
  resolve_container(ref: string): ContainerResult;
  inspect_pattern(ref: string, ancestorLevel: number): PatternResult;
  extract_anchors(ref: string, ancestorLevel: number): AnchorsResult;

  // Utility methods
  getAttributes(element: Element): Record<string, string>;
};
```

---

## Key Design Decisions

### Why throw for click/type but return errors for analysis?

**click() and type() are ACTIONS:**
- Should fail fast if element is gone
- LLM should be interrupted immediately
- Exception is appropriate

**resolve_container/inspect_pattern are QUERIES:**
- LLM is exploring and learning
- Errors are expected (trying different levels, refs)
- Structured error response helps LLM adjust strategy
- Continues conversation flow

---

## Benefits Summary

### For LLMs Using MCP Tools:

✅ **Rich error context** - knows exactly what went wrong
✅ **Actionable suggestions** - knows what to try next
✅ **Type discrimination** - can distinguish error types programmatically
✅ **Consistent patterns** - all three analysis methods work the same way
✅ **No interruptions** - exploration continues smoothly

### For Developers:

✅ **No try/catch needed** - handlers just check `result.error`
✅ **Type safety** - TypeScript enforces proper handling
✅ **Easier debugging** - structured errors are easier to log
✅ **Consistent with extract_anchors** - one pattern for all

---

## Migration Impact

**Files to Change:**
1. `src/shared-types.ts` - Add error fields to ContainerResult, PatternResult
2. `src/browser/core/StructuralAnalyzer.ts` - Return error objects instead of null
3. `src/browser/bridge/BridgeFactory.ts` - Remove validateElement from analysis methods, keep for click/type
4. `src/browser/types/bridge.ts` - Update method signatures (remove | null)
5. `src/server/handlers/AnalysisHandlers.ts` - Check result.error instead of !result

**Tests to Update:**
- Any tests checking for `null` returns
- Add tests verifying error object structure
- Add tests for error suggestions

**Breaking Changes:**
- ⚠️ Return type changes from `T | null` to `T` (with error field)
- ⚠️ Callers must check `result.error` instead of `if (!result)`
- ✅ Less breaking than throwing exceptions!

---

## Conclusion

**BEST APPROACH: Return Error Objects (Option 3)**

This gives LLMs:
- Structured context about failures
- Actionable guidance for next steps
- Smooth exploration workflow
- Consistent patterns across all tools

This gives developers:
- Simpler handler code (no try/catch)
- Better debugging (structured errors)
- Type safety (compiler helps)
- Clean separation: actions throw, queries return errors

**Recommendation:** Update the ref persistence plan to use error objects instead of null returns or thrown exceptions for the analysis methods.

