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

## Key Design Decisions

### Why ManualPromise?

ManualPromise allows event handlers to resolve promises that are awaited elsewhere in the code. This enables purely event-driven coordination without polling or timeouts.

**Example**: Frame injection
```typescript
// Create promise that will be resolved by CDP event
const promise = new ManualPromise<void>();

// CDP event handler resolves it
cdp.on("Runtime.executionContextCreated", () => {
  promise.resolve();
});

// Elsewhere, we can await it
await promise;
```

### Why Isolated Worlds?

Isolated worlds (via CDP's isolated execution contexts) ensure the bridge code:
- Can't be tampered with by page JavaScript
- Doesn't pollute the page's global scope
- Survives same-document navigation (SPA routing)

### Why RefIndex?

The RefIndex maps global refs (like `f2_e5`) to their frame location. This enables:
- O(1) ref resolution (no DOM traversal needed)
- Proper routing of interactions to correct frames
- Stale ref detection after navigation

### Why Event-Driven vs Polling?

Event-driven approach provides:
- **Zero latency**: Instant response to state changes
- **No race conditions**: Events fire in predictable order
- **Lower CPU usage**: No busy-waiting loops
- **Better reliability**: Browser tells us exactly when things happen

## Performance Considerations

### Bridge Bundle Size

The bridge code is bundled and injected into every frame:
- Current size: ~21KB minified
- Kept minimal to reduce injection overhead
- No external dependencies

### Frame Injection Strategy

Frames are injected **lazily**:
- Main frame: Injected on page load
- Child frames: Injected only when first accessed
- Reduces unnecessary work for hidden/unused iframes

### Snapshot Generation

Snapshots use breadth-first traversal:
- Respects `maxDepth` limit to prevent deep recursion
- Filters hidden elements early
- Caches element refs in Map for O(1) lookup

## Future Improvements

Identified during architecture review:

1. **Retry strategies** - Add exponential backoff for transient frame errors
2. **Error recovery hooks** - Allow custom error handlers per role
3. **Performance monitoring** - Track injection times and failures
4. **Structured logging** - Replace console.* with structured logger
5. **Error reporting** - Send errors to monitoring service

## Related Documentation

- `TESTING.md` - Testing strategy and test organization

