This is probably the most common question I get about Verdex. It's a fair one—Playwright is an exceptional testing framework with excellent cross-browser support, and on the surface it might seem like building on top of it would make sense. Let me walk through the technical reasoning behind choosing Puppeteer and CDP instead.

## The Short Answer

Verdex is a development-time authoring tool that needs deep, Chrome-specific control over DOM inspection and JavaScript execution contexts. Playwright is an execution-time test runner optimized for cross-browser reliability. These are fundamentally different use cases, and while Playwright does provide CDP access through `newCDPSession()`, working directly with Puppeteer/CDP offered a simpler, more natural fit for what I was building.

**A Note on Inspiration**

Before diving into the technical details, I want to be clear: Verdex owes a significant debt to Playwright's design. The accessibility tree implementation, the approach to isolated worlds, the careful attention to element lifecycle—these are all areas where I studied Playwright's codebase extensively and drew inspiration.

In many ways, Verdex aims for parity with Playwright's level of sophistication, particularly around W3C ARIA-compliant accessibility tree generation, robust handling of frame lifecycles and navigation, and isolated execution contexts. Where Verdex diverges isn't in capability but in architecture: it adds structural exploration primitives (`resolve_container`, `inspect_pattern`, `extract_anchors`) for a different purpose—authoring-time selector construction rather than execution-time test reliability.

The question this article addresses isn't "what can Verdex do that Playwright can't?" but rather "given these different goals, what foundation makes the most sense?"

## The Longer Answer: Architectural Fit

### Playwright's Locator Philosophy vs. Verdex's Requirements

Playwright's core design principle is that locators re-resolve on every action. From their documentation:

> "Every time a locator is used for an action, an up-to-date DOM element is located in the page."

This is brilliant for test execution—it ensures you're always interacting with the current state of the page and handles dynamic content gracefully.

But Verdex needs something different. During authoring sessions, I need to maintain stable ref → live DOM node mappings. When you call `resolve_container(e3)`, Verdex needs to walk up the DOM tree from that specific element and return its structural context. This requires:

- A persistent reference to the element
- Direct access to the DOM node's properties  
- The ability to traverse parent/sibling relationships synchronously

It's important to note that these persistent mappings exist only during the authoring session—they're analysis infrastructure, not test execution primitives. The test code Verdex helps you write uses Playwright's standard Locators, which re-resolve on every action. Verdex's refs live in the CDP bridge during exploration and never appear in your final test code.

Playwright's recommended approach is to use Locators, which are designed to be ephemeral and re-query on every use. While you can obtain persistent ElementHandles in Playwright, the framework actively discourages their use. As the documentation notes:

> "Handle points to a particular DOM element on page. If that element changes text or is used by React to render an entirely different component, handle is still pointing to that very stale DOM element."

ElementHandles are auto-disposed after locator actions, which makes sense for test reliability but conflicts with Verdex's need for stable references during iterative DOM exploration.

Playwright's re-resolve-every-time model is a deliberate design decision—a safeguard against the kind of "stale handle" bugs that plagued earlier Selenium-style frameworks. This is core philosophy, not a technical omission. Playwright's strength lies in stateless, reproducible interactions, not long-lived handles or out-of-band DOM graphs. Verdex's design goals—persistent, structural exploration—would therefore have meant constantly fighting against Playwright's intended lifecycle semantics.

### Working at the CDP Layer Directly

Playwright does expose CDP access through `newCDPSession()` for Chromium-based browsers. Both Playwright and Verdex build  implementations on CDP as a foundation. The difference is what they build and why.

Creating an isolated world looks almost identical in both:

```javascript
// Playwright with CDP
const client = await page.context().newCDPSession(page);
await client.send('Page.createIsolatedWorld', {
  frameId: mainFrameId,
  worldName: 'verdex-bridge',
  grantUniversalAccess: true
});

// Puppeteer with CDP  
const client = await page.createCDPSession();
const { executionContextId } = await client.send('Page.createIsolatedWorld', {
  frameId: mainFrameId,
  worldName: 'verdex-bridge',
  grantUniversalAccess: true
});
```

So why use Puppeteer? Because the complexity emerges the moment you start working with elements, and because the architectural alignment matters.

### The Element Lifecycle Mismatch

Verdex maintains a persistent `Map<string, ElementInfo>` that tracks DOM nodes across multiple analysis operations. When you call `resolve_container(ref="e3")`, Verdex needs to:

1. Resolve the ref to a stable CDP objectId
2. Call `Runtime.callFunctionOn` with that objectId in the isolated world
3. Keep that reference alive for subsequent `inspect_pattern()` and `extract_anchors()` calls
4. Control exactly what gets serialized back (progressive disclosure—only return the structural facts needed for the current query)

With Puppeteer, this is the natural workflow:

```javascript
// Stable references throughout the workflow
const { result } = await client.send('Runtime.callFunctionOn', {
  functionDeclaration: `
    function() {
      return window.verdexBridge.resolve_container(this);
    }
  `,
  objectId: elementObjectId,  // Stable reference under your control
  executionContextId: bridgeContextId,
  returnByValue: true
});

// Later: same objectId, same context, no re-resolution needed
const { result: siblings } = await client.send('Runtime.callFunctionOn', {
  functionDeclaration: 'function() { return window.verdexBridge.inspect_pattern(this, 3); }',
  objectId: elementObjectId,  // Same stable reference
  executionContextId: bridgeContextId,
  returnByValue: true
});
```

With Playwright + CDP, you're fighting the framework's core design. Playwright's Locators intentionally re-resolve on every action and auto-dispose ElementHandles to prevent stale references. This is brilliant for test reliability—stale element bugs were the bane of Selenium-style frameworks. But it's antithetical to Verdex's workflow, which requires stable, persistent references for multi-step structural exploration.

To use Playwright + CDP for Verdex's use case, you'd need to bridge between two object models: Playwright's auto-managed ElementHandles exist in its utility world, while you need manually-managed CDP objectIds in your isolated world. Converting between them requires extra evaluation calls and context switching. You'd end up using Playwright's CDP access to bypass Playwright's abstractions entirely, while carrying the overhead of those abstractions in your bundle.

### Why Puppeteer Makes Sense

With Puppeteer, everything operates at the same abstraction level—CDP primitives throughout. Verdex implements a reasonable amount of custom logic on top of these primitives (accessibility tree generation, structural analysis, token-optimized serialization, multi-role context management), but it's all built on the same foundation:

```javascript
const session = await page.target().createCDPSession();

// Create your isolated world
const { executionContextId } = await session.send('Page.createIsolatedWorld', {...});

// Inject your bridge code
await session.send('Runtime.evaluate', {
  expression: bridgeCode,
  contextId: executionContextId
});

// Use objectId for stable, multi-step operations
const { result } = await session.send('Runtime.evaluate', {
  expression: 'document.querySelector("[data-testid=product]")',
  contextId: executionContextId
});

const analysis = await session.send('Runtime.callFunctionOn', {
  objectId: result.objectId,  // Stable until you release it
  functionDeclaration: 'function() { return window.verdexBridge.fullAnalysis(this); }',
  executionContextId,
  returnByValue: true
});
```

No impedance mismatch, no fighting auto-disposal, no bridging between object models. The logic works deterministically—give it a ref, get back the structural context you need. There's also the practical consideration: puppeteer is ~2MB and CDP-native, while playwright-core is ~10MB with cross-browser abstractions Verdex never uses.

Playwright's architecture layers on top of CDP to unify Chromium, WebKit, and Gecko—write once, test everywhere. But Verdex builds Chrome-specific structural analysis intelligence directly on CDP primitives: custom ARIA tree generation, token-optimized DOM exploration, multi-role context isolation. For a Chrome-only authoring tool, Playwright's 10MB cross-browser layer and auto-resolving Locators add friction, not assistance.

Using Puppeteer isn't about capability limitations—it's about directness: working at the native protocol level without translation layers or unused abstractions.

**Element Lifecycle: Puppeteer vs Playwright**

![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/92hm1ratfjy6uf30qj3p.png)

### Isolated Worlds and Script Injection

Verdex injects bridge code into CDP isolated worlds to keep DOM analysis completely invisible to application JavaScript. This isolation prevents application scripts from interfering with analysis through overwritten globals, monkey-patched DOM APIs, or framework re-renders.

Both Playwright and Verdex use isolated execution contexts—Playwright calls them "utility worlds" internally for its own injected scripts. Playwright's `addInitScript()` has an internal parameter for world selection, but the public API doesn't expose this choice—it defaults to running in the main world, which makes sense for Playwright's use case: test scripts should interact with the page's actual JavaScript context.

Verdex needs the opposite: complete isolation from the application's JavaScript to prevent interference during analysis. Through CDP's `Page.createIsolatedWorld`, Verdex creates its own analysis environment that's invisible to the application.

Through `newCDPSession()`, I could access `Page.createIsolatedWorld` and work with isolated contexts—but again, this brings me back to: why add Playwright's abstraction layer when I'm just going to bypass it to use CDP directly?

### Multi-Role Browser Contexts: A Critical Feature

One area where working directly with CDP proved especially valuable was implementing multi-role browser contexts. This is a critical feature that Verdex makes uniquely accessible.

I was working on a marketplace application with three distinct roles that needed to interact: an admin (the application admin), a provider (the sell side), and a customer (who buys from providers).

The CTO wanted testing that maintained certain flows—the provider adds a product with a discount, the customer loads the product, then the provider changes details about the product, and those details are reflected in the customer session, and then the customer checks out.

Managing multiple authenticated sessions without state leakage is extremely difficult manually. You're tracking cookies, localStorage, sessionStorage, and trying to prevent auth leakage between roles. The cognitive overhead is substantial, and it's error-prone.

With CDP-level control, Verdex creates separate incognito browser contexts for each role, each with its own CDP session and authentication file. Each role gets proper storage and session isolation at the browser protocol level—this is true browser-level isolation, not just cookie clearing. The deterministic nature of this approach means the LLM just references roles by name without managing any of the underlying complexity:

```javascript
select_role("admin")
browser_navigate("/promotions/new")
browser_click("e1") // Creates promotion

select_role("user")
browser_navigate("/products")
// User sees the new promotion
```

The impact was immediate: multi-role e2e tests went from being tedious and error-prone to straightforward. Tests that would take an hour to write manually now took minutes with LLM assistance, and they were more reliable because the isolation was handled at the browser protocol level.

This level of multi-role orchestration, with clean isolation guarantees, is what makes complex testing scenarios tractable. It's not just a convenience feature—it's fundamental to testing modern applications where users interact with different permission levels and see different views of the same underlying data.

![Image description](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/t8r2g97sgtyfdyh6cn7n.png)

### Token Efficiency Through Progressive Disclosure

Verdex's progressive disclosure design—where structural exploration returns targeted results per query instead of dumping entire DOM trees—depends on having complete control over what gets serialized across the protocol boundary.

Both Playwright and Verdex implement custom serialization strategies, but for different purposes. Playwright's serialization serves test execution reliability; Verdex's serves a different goal: letting you discover exactly what you need, when you need it.

With direct CDP access, I control the entire serialization pipeline:

```javascript
// Bridge runs entirely in the isolated world
window.verdexBridge = {
  resolve_container(ref) {
    // Synchronous DOM traversal
    // Custom filtering for stable containers
    // Minimal JSON output
    return { target, ancestors };
  }
};
```

The bridge performs multi-step DOM analysis in-browser and returns only the structural facts needed for selector construction. This keeps computation close to the data and minimizes serialization costs. The deterministic nature of these operations means you get consistent, predictable results—no variability, no surprises.

### The Cross-Browser Constraint Doesn't Apply Here

Playwright's entire value proposition is cross-browser parity. Every feature needs to work consistently across Chromium, Firefox, and WebKit. This is absolutely the right design for a test runner—your tests should behave identically regardless of which browser executes them.

But Verdex is explicitly a development-time, Chrome-only tool. You author tests with Verdex during development, then execute those tests with Playwright across all browsers in CI. The Chrome-only constraint during authoring is acceptable because:

- Most developers use Chrome/Chromium during development anyway
- The output is standard Playwright code that runs anywhere
- Chrome-specific CDP features provide capabilities that are genuinely useful for authoring but unnecessary for execution

Maintaining strict parity across three engines forces Playwright to avoid browser-specific surface areas entirely. Verdex doesn't have this constraint, which allows it to leverage CDP-native analysis capabilities.

## What About Playwright MCP?

Playwright MCP serves a fundamentally different purpose than Verdex, and understanding this distinction requires looking at how each tool actually works with the browser.

**The Critical Difference: Runtime Execution vs Authoring Analysis**

Playwright MCP is a runtime execution tool that gives AI agents direct control over live browser sessions for immediate tasks—web scraping, form filling, test execution, and general automation. The agent issues commands and Playwright MCP executes them in real-time.

Verdex is an authoring-time analysis tool. It doesn't execute tests—it helps you write better test code. Here's the key architectural difference:

When you use Verdex, you must first navigate using Verdex's own navigation primitives:

```javascript
browser_navigate("https://example.com")  // Verdex navigation
browser_snapshot()                        // Get accessibility tree with refs
resolve_container("e3")                      // Explore DOM structure
inspect_pattern("e3", 2)                    // Examine repeating patterns
```

Those ref values (like `e3`) come from Verdex's accessibility snapshot generator, which creates stable references to DOM nodes and maintains a `Map<string, ElementInfo>` that maps refs to actual DOM elements. This mapping enables the structural exploration primitives—`resolve_container(ref)` can walk up the DOM tree because it has direct access to the underlying element.

Playwright MCP can't do this. It provides accessibility snapshots for execution decisions ("which button should I click?"), but it doesn't expose structural exploration primitives. There's no `resolve_container` tool, no way to inspect DOM hierarchy, no ability to trace an element back through nested containers. The architecture is fundamentally different—Playwright MCP's refs are for immediate interaction, not structural analysis.

### Why Accessibility Snapshots Work for Different Purposes

For Playwright MCP (runtime execution):

```
button "Add to Cart" [ref=e3]
```

That's all the agent needs to click the button or extract data. It doesn't need to know the button is nested inside `div[data-testid="product-card"]` because it's not writing test code that needs to survive refactors.

For Verdex (test authoring):

```javascript
// Start with the same accessibility snapshot
button "Add to Cart" [ref=e3]

// But then explore structure to write durable selectors
resolve_container("e3")       // Discovers the product-card container
inspect_pattern("e3", 2)     // Confirms it's one of many cards
extract_anchors("e3", 1)  // Finds unique anchors inside the card

// Result: Container-scoped selector that survives layout changes
getByTestId("product-card")
  .filter({ hasText: "iPhone 15 Pro" })
  .getByRole("button", { name: "Add to Cart" })
```

Verdex's architecture—Puppeteer, CDP isolated worlds, and direct element references—enables this structural exploration. The bridge maintains the ref-to-element mapping, the structural analyzer traverses the DOM deterministically, and the multi-role context system handles complex testing scenarios with browser-level isolation.

### How Playwright MCP Actually Works

Playwright MCP is built entirely on top of Playwright core's high-level abstractions—it uses the standard Page and Locator APIs without any direct CDP access. When you capture a snapshot in Playwright MCP:

```typescript
// Playwright MCP (from tab.ts)
const snapshot = await page._snapshotForAI();
const locator = page.locator(`aria-ref=${ref}`);
await locator.click();
```

The `aria-ref` selector is a built-in Playwright engine that resolves elements through Playwright's utility world (injected script):

```typescript
// From injectedScript.ts - Playwright core
_createAriaRefEngine() {
  const queryAll = (root: SelectorRoot, selector: string): Element[] => {
    const result = this._lastAriaSnapshot?.elements?.get(selector);
    return result && result.isConnected ? [result] : [];
  };
  return { queryAll };
}
```

The refs are stored in `this._lastAriaSnapshot?.elements` Map in Playwright's managed execution context. These refs are _regenerated on every snapshot_—they're transient handles for immediate interaction, not persistent references for multi-step analysis.

This is brilliant for runtime execution: Playwright MCP gets cross-browser support "for free" because it operates entirely through Playwright's unified abstractions. The aria-ref mechanism works identically in Chromium, Firefox, and Safari because it's implemented in Playwright's injected script, which runs in all three engines.

But for authoring-time structural exploration, this architecture has inherent limitations:

1. **No persistent references** - Refs are regenerated on every snapshot, making multi-step DOM analysis awkward
2. **No structural primitives** - There's no way to ask "what are the ancestors of e3?" or "what siblings does this element have?"
3. **Re-resolution on every action** - This is Playwright's design strength for test execution, but it's incompatible with Verdex's need for stable element references during iterative exploration

### Verdex's Inverted Model

Verdex inverts this model: it maintains persistent `ref → CDP objectId` mappings during authoring sessions. When you call `resolve_container(e3)`, Verdex:

1. Resolves `e3` to a stable CDP `objectId`
2. Calls `Runtime.callFunctionOn` with that objectId in the isolated world
3. Keeps that reference alive for subsequent `inspect_pattern()` and `extract_anchors()` calls
4. Controls exactly what gets serialized back (progressive disclosure—only return the structural facts needed for the current query)

With Puppeteer and direct CDP access, this is the natural workflow:

```javascript
// Stable references throughout the workflow
const { result } = await client.send('Runtime.callFunctionOn', {
  functionDeclaration: `
    function() {
      return window.verdexBridge.resolve_container(this);
    }
  `,
  objectId: elementObjectId,  // Stable reference under your control
  executionContextId: bridgeContextId,
  returnByValue: true
});

// Later: same objectId, same context, no re-resolution needed
const { result: siblings } = await client.send('Runtime.callFunctionOn', {
  functionDeclaration: 'function() { return window.verdexBridge.inspect_pattern(this, 3); }',
  objectId: elementObjectId,  // Same stable reference
  executionContextId: bridgeContextId,
  returnByValue: true
});
```

These mappings never appear in your final test code—they're authoring infrastructure that helps you discover and write better selectors. The test code you write with Verdex uses standard Playwright Locators, which re-resolve on every action.

### Element Lifecycle: A Tale of Two Philosophies

The diagram below illustrates the fundamental difference:

**Playwright MCP (Ephemeral References):**
```
Snapshot 1 → ref=e3 → Element A → Click happens
Snapshot 2 → ref=e3 → Element B (possibly different!)
```

Refs are regenerated each time. This prevents stale element bugs (Playwright's core strength) but makes structural analysis impractical.

**Verdex (Persistent References During Authoring):**
```
Snapshot → ref=e3 → CDP objectId → Element A
  ↓
resolve_container(e3) → Same objectId → Walk parent chain
  ↓
inspect_pattern(e3, 2) → Same objectId → Analyze siblings
  ↓
extract_anchors(e3, 1) → Same objectId → Explore children
```

Refs remain stable throughout the authoring session, enabling multi-step structural exploration. The final test code uses Playwright's standard Locators.

### Why Issue #103 Was Closed as "Not Planned"

Issue #103 in the Playwright MCP repository requested DOM visibility features, but it was closed as "not planned." This isn't a limitation—it's a deliberate design choice. Playwright MCP is optimized for cross-browser execution using accessibility semantics, not for Chrome-specific structural analysis during test authoring.

Adding structural exploration to Playwright MCP would require either:

1. **Using Playwright's ElementHandles** - But Playwright actively discourages their use and auto-disposes them after actions to prevent stale references. You'd be fighting the framework's core philosophy.

2. **Adding CDP access for Chromium** - But this defeats the purpose. Playwright MCP's value proposition is cross-browser uniformity. Adding Chrome-only features would fragment the tool's capabilities and complicate the mental model.

3. **Building a parallel ref system** - Regenerating snapshots on every structural query would be prohibitively expensive and wouldn't solve the persistent reference problem.

The architectural foundation doesn't support it, and it shouldn't. Playwright MCP isn't designed for authoring-time selector construction—it's designed for runtime browser automation.

### The Complementary Relationship

This creates a natural division of labor:

**Use Playwright MCP for:**
- Real-time browser control and automation
- Web scraping and data extraction
- Form filling and interaction
- Exploratory testing and debugging
- Running tests directly (though Playwright Test Runner is better suited for this)

**Use Verdex for:**
- Authoring complex multi-role e2e test flows
- Creating durable, refactor-resistant selectors
- Understanding DOM structure and container relationships
- Managing multiple authenticated sessions with proper isolation

**Execute with Playwright's test runner for:**
- Cross-browser reliability in CI
- Parallel test execution
- Comprehensive reporting and debugging tools

The tools solve different problems at different stages of the testing workflow. Playwright MCP excels at runtime automation with cross-browser support. Verdex excels at helping you write complex test flows and create selectors that survive refactors and DOM changes. Different problems, different architectures, complementary results.

## The Bottom Line: Foundation and Purpose

Could Playwright MCP add structural exploration? Technically, perhaps—but it would require fundamental architectural changes that would compromise its cross-browser promise or force it to work against Playwright's core design principles.

This isn't about capability—Playwright's `newCDPSession()` provides the same CDP access that Verdex uses. It's about directness: Verdex's architecture wants to work _at_ the CDP layer, while Playwright's architecture works _through_ it. Verdex implements its structural analysis primitives directly on CDP—`Runtime.callFunctionOn`, `Page.createIsolatedWorld`, persistent objectId management. Working through Playwright's abstractions would introduce impedance mismatches at every step: converting between Playwright's auto-managed ElementHandles and manually-managed CDP objectIds, fighting auto-disposal semantics, bridging between execution contexts.

The foundation matches the purpose. Playwright abstracts away browser protocols to provide cross-browser uniformity—write once, test everywhere. Verdex builds on browser protocols to provide Chrome-specific authoring intelligence—deep structural exploration that helps you write better selectors during development. No impedance mismatch, no abstraction layer to work around.

Playwright MCP chose Playwright core's abstractions because the use case demands cross-browser uniformity, reliability guarantees, and immediate execution semantics. Verdex chose Puppeteer and direct CDP access because the use case demands persistent references, fine-grained execution context control, and Chrome-specific analysis capabilities during authoring. The 2MB footprint, CDP-native APIs, and element lifecycle semantics all align with authoring-time exploration rather than test-time reliability.

You use Verdex during development to write better selectors, then execute those tests with Playwright in CI. The refs, structural analysis, and multi-role contexts exist only during authoring—your final test code is pure Playwright, running anywhere Playwright runs.

Different stages of the workflow, different architectural foundations, designed to complement each other.