# Verdex Reliability Suite

**AI-powered test authoring with built-in reliability guardrails**

Verdex extends beyond structural DOM intelligence to catch authoring-time reliability risks that cause flakes. Using CDP-powered instrumentation and LLM-friendly reporting, Verdex helps agents guide developers toward more stable tests, better selectors, and realistic wait strategies—all before tests reach CI.

---

## Unifying Theme

> **"Verdex catches authoring-time reliability risks that cause flakes"**

Not production monitoring, not after-the-fact debugging—**proactive detection during test writing** that helps LLMs guide developers toward:
- More stable selectors (accessibility analysis)
- Better wait strategies (race condition detection)
- Realistic timeouts (performance monitoring)
- Cleaner tests (console errors, state isolation)

All features share the same architecture:
- ✅ **Zero page mutation by default** - passive observation via CDP
- ✅ **LLM-friendly reporting** - compact, structured, actionable JSON
- ✅ **Threshold-based surfacing** - only report when issues detected
- ✅ **Pattern-matched guidance** - suggest specific fixes based on common scenarios
- ✅ **Authoring-time focus** - catch issues during development, not in CI

---

## Feature 1: Race Condition & Flake Detection

### Problem Statement

Tests intermittently fail because:
- Elements become detached between selection and interaction
- Selectors match multiple elements during re-renders
- Navigation happens while interactions are pending
- Elements are visible but not yet interactive
- Async state updates invalidate selectors mid-test

These race conditions are the **#1 cause of flaky tests** and are notoriously difficult to debug.

### What Verdex Detects

#### **Element Lifecycle Issues**
- Element selected but detached before interaction
- Element replaced during React/Vue re-render
- Element covered by modal/overlay
- Element in DOM but not yet visible (opacity, display, position)

#### **Timing Issues**
- Navigation started before interaction completed
- Multiple navigations in quick succession
- Form submission triggered multiple times
- Click events on elements being animated

#### **Selector Instability**
- Selector matched N elements, then M elements
- Content-based filter no longer matches after state update
- nth() selector broken by dynamic list changes

### User-Facing API

```ts
export type RaceConditionCheck = {
  elementRef: string;
  selector: string;          // The selector that would be used
  issue: 'detached' | 'covered' | 'multiple-matches' | 'in-transition' | 'navigation-race';
  timing: {
    selected: number;        // When element was identified
    attempted: number;       // When interaction was attempted
    delta: number;           // Time between (should be low)
  };
  context: string;           // What was happening (e.g., "during navigation", "during re-render")
};

export type RaceConditionReport = {
  detected: boolean;
  checks: RaceConditionCheck[];
  recommendations: {
    waitStrategy: string;    // "waitForSelector", "waitForLoadState", etc.
    timeout: number;         // Suggested timeout in ms
    selectorImprovement?: string;  // More stable alternative
    code: string;            // Ready-to-use code snippet
  }[];
  llmGuidance: {
    severity: 'info' | 'warning' | 'critical';
    summary: string;
    pattern: string;         // "React re-render race", "Navigation timing", etc.
    confidence: 'low' | 'medium' | 'high';
  };
};

export type RaceDetectionAPI = {
  race_detection_enable(): Promise<{ enabled: true }>;
  race_detection_disable(): Promise<{ enabled: false }>;
  race_detection_report(): Promise<RaceConditionReport>;
};
```

### Example Reports

#### **Example 1: Detached Element**

```json
{
  "detected": true,
  "checks": [
    {
      "elementRef": "e3",
      "selector": "[data-testid='product-card'] button",
      "issue": "detached",
      "timing": {
        "selected": 1000,
        "attempted": 1045,
        "delta": 45
      },
      "context": "Element was removed during React re-render"
    }
  ],
  "recommendations": [
    {
      "waitStrategy": "waitForSelector with attached state",
      "timeout": 5000,
      "code": "await page.waitForSelector('[data-testid=\"product-card\"] button', { state: 'attached' });\nawait page.click('[data-testid=\"product-card\"] button');"
    }
  ],
  "llmGuidance": {
    "severity": "critical",
    "summary": "Element detached 45ms before click due to React re-render",
    "pattern": "React state update race condition",
    "confidence": "high"
  }
}
```

#### **Example 2: Selector Instability**

```json
{
  "detected": true,
  "checks": [
    {
      "elementRef": "e8",
      "selector": "button:nth(8)",
      "issue": "multiple-matches",
      "timing": {
        "selected": 1000,
        "attempted": 1020,
        "delta": 20
      },
      "context": "Selector matched 12 buttons initially, then 15 after async load"
    }
  ],
  "recommendations": [
    {
      "waitStrategy": "Use stable selector instead of nth()",
      "selectorImprovement": "[data-testid='product-card'].filter({ hasText: 'iPhone' }).getByRole('button', { name: 'Add to Cart' })",
      "code": "await page.getByTestId('product-card')\n  .filter({ hasText: 'iPhone' })\n  .getByRole('button', { name: 'Add to Cart' })\n  .click();"
    }
  ],
  "llmGuidance": {
    "severity": "warning",
    "summary": "Positional selector unstable—element count changed during interaction",
    "pattern": "Dynamic list with nth() selector",
    "confidence": "high"
  }
}
```

### Implementation Details

#### **CDP Integration**
- Listen to `Runtime.executionContextDestroyed` for navigation races
- Use `DOM.getDocument` + `DOM.querySelector` to track element lifecycle
- Monitor `DOM.setChildNodes` events for re-render detection
- Track `Page.frameNavigated` for navigation timing

#### **Detection Logic**
1. When agent calls `browser_click(ref)`, capture timestamp
2. Before executing click, re-verify element:
   - Still attached to DOM?
   - Still matches original selector?
   - Still visible and not covered?
3. If verification fails, capture race condition details
4. Provide actionable recommendation based on failure type

#### **Auto-mode** (default on)
- Silently monitors all interactions
- Only surfaces report when race detected
- Minimal overhead (~5-10ms per interaction)

---

## Feature 2: Accessibility Analysis & Selector Stability

### Problem Statement

Tests use brittle selectors (nth(), deep CSS chains) because applications have poor accessibility:
- Buttons without accessible names
- Form inputs without labels
- Missing ARIA landmarks
- No semantic structure

**Verdex can bridge the gap**: analyze accessibility while suggesting both immediate workarounds AND long-term fixes that improve both testability and user experience.

### What Verdex Detects

#### **Selector-Blocking Issues**
- Interactive elements without accessible names (forces nth() usage)
- Form inputs without associated labels (can't use getByLabel)
- Buttons with generic text ("Click here", "Submit")
- Duplicate accessible names (ambiguous targeting)

#### **Structure Issues**
- Missing ARIA landmarks (no semantic containers for scoping)
- Unlabeled regions and sections
- Poor heading hierarchy
- Missing or incorrect ARIA roles

#### **Impact on Test Quality**
- Maps accessibility gaps → selector brittleness
- Estimates selector stability score
- Shows before/after selector quality

### User-Facing API

```ts
export type A11yIssue = {
  elementRef: string;
  rule: 'button-name' | 'form-label' | 'landmark' | 'heading-order' | 'aria-role';
  severity: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  wcagLevel: 'A' | 'AA' | 'AAA';
  impact: {
    testability: 'blocks-stable-selector' | 'reduces-readability' | 'minor-impact';
    currentSelector: string;   // What you're forced to use now
    idealSelector: string;     // What you could use if fixed
  };
  fix: {
    type: 'add-attribute' | 'add-element' | 'restructure';
    suggestion: string;
    codeExample: string;
  };
};

export type A11yReport = {
  pageUrl: string;
  timestamp: number;
  totalIssues: number;
  byImpact: {
    blocksStableSelector: number;
    reducesReadability: number;
    minorImpact: number;
  };
  selectorStabilityScore: number;  // 0-100, based on available semantic anchors
  issues: A11yIssue[];
  llmGuidance: {
    summary: string;
    quickWins: string[];      // Easy fixes with high impact
    priorityOrder: string[];  // Which issues to fix first
  };
};

export type A11yAnalysisAPI = {
  a11y_analyze_page(): Promise<A11yReport>;
  a11y_analyze_element(ref: string): Promise<A11yIssue[]>;
  a11y_suggest_selector(ref: string): Promise<{
    current: string;         // Best selector possible now
    ideal: string;           // Best selector if a11y fixed
    stability: 'fragile' | 'moderate' | 'stable';
    fixRequired: A11yIssue | null;
  }>;
};
```

### Example Reports

#### **Example: Button Without Name**

```json
{
  "elementRef": "e3",
  "rule": "button-name",
  "severity": "critical",
  "description": "Button has no accessible name",
  "wcagLevel": "A",
  "impact": {
    "testability": "blocks-stable-selector",
    "currentSelector": "page.locator('button').nth(8)",
    "idealSelector": "page.getByRole('button', { name: 'Add to Cart' })"
  },
  "fix": {
    "type": "add-attribute",
    "suggestion": "Add aria-label or visible text to button",
    "codeExample": "<button aria-label=\"Add to Cart\">\n  <ShoppingCartIcon />\n</button>\n\n// Or better:\n<button>\n  <ShoppingCartIcon />\n  <span>Add to Cart</span>\n</button>"
  }
}
```

#### **Example: Page Analysis**

```json
{
  "pageUrl": "https://example.com/products",
  "totalIssues": 23,
  "byImpact": {
    "blocksStableSelector": 8,
    "reducesReadability": 12,
    "minorImpact": 3
  },
  "selectorStabilityScore": 42,
  "issues": [ /* ... */ ],
  "llmGuidance": {
    "summary": "Page has 8 accessibility issues blocking stable selectors—42% stability score",
    "quickWins": [
      "Add aria-label to 6 icon-only buttons (enables getByRole)",
      "Add data-testid to product-card container (enables scoped selectors)",
      "Associate labels with form inputs using htmlFor (enables getByLabel)"
    ],
    "priorityOrder": [
      "Fix button-name issues first (biggest selector impact)",
      "Then add form labels (enables semantic form testing)",
      "Finally improve landmark structure (enables better scoping)"
    ]
  }
}
```

### Implementation Details

#### **Integration with axe-core**
```javascript
// Inject axe-core into isolated world
// Run analysis and map results to selector impact
const results = await axe.run(document, {
  rules: {
    'button-name': { enabled: true },
    'label': { enabled: true },
    'landmark-one-main': { enabled: true },
    // ... focus on testability-impacting rules
  }
});

// Enhance with selector analysis
for (const violation of results.violations) {
  for (const node of violation.nodes) {
    const impact = analyzeTestabilityImpact(node, violation.id);
    // Generate current vs. ideal selector comparison
  }
}
```

#### **Selector Stability Scoring**
```javascript
function calculateStabilityScore(page) {
  let score = 100;
  
  // Penalty for missing testids on containers (-5 per missing)
  // Penalty for unnamed interactive elements (-10 per element)
  // Penalty for unlabeled form inputs (-8 per input)
  // Bonus for good ARIA landmark structure (+10)
  // Bonus for consistent data-testid usage (+15)
  
  return Math.max(0, Math.min(100, score));
}
```

#### **Auto-mode**
- Run analysis on first `browser_navigate`
- Cache results for page
- Re-run only when DOM significantly changes
- Surface critical issues immediately

---

## Feature 3: Performance Budget & Interaction Monitoring

### Problem Statement

Tests pass locally but fail in CI with timeouts:
- Slow API calls block interactions
- Large React re-renders freeze UI
- Animation delays not accounted for
- Resource loading slows page

Developers set arbitrary timeouts without understanding actual performance characteristics.

### What Verdex Detects

#### **Interaction Performance**
- Time from click to handler execution
- Time from input to state update
- Time from submission to navigation
- Long tasks blocking main thread

#### **Page Load Performance**
- First Contentful Paint (FCP)
- Largest Contentful Paint (LCP)
- Time to Interactive (TTI)
- Cumulative Layout Shift (CLS)

#### **Resource Timing**
- Slow API calls (> 1s)
- Large bundle downloads
- Blocking third-party scripts
- Failed resource loads

### User-Facing API

```ts
export type InteractionPerformance = {
  action: 'click' | 'type' | 'navigate' | 'submit';
  elementRef?: string;
  duration: number;
  budget: number;
  exceeded: boolean;
  breakdown: {
    apiCalls?: number;
    rendering?: number;
    scripting?: number;
    other?: number;
  };
  longTasks: Array<{
    duration: number;
    scriptUrl?: string;
  }>;
};

export type PagePerformance = {
  url: string;
  metrics: {
    fcp: number;
    lcp: number;
    tti: number;
    cls: number;
    totalLoadTime: number;
  };
  budgets: {
    fcp: number;      // 1800ms for FCP
    lcp: number;      // 2500ms for LCP
    tti: number;      // 3800ms for TTI
  };
  violations: string[];
};

export type PerformanceReport = {
  page: PagePerformance;
  interactions: InteractionPerformance[];
  recommendations: {
    type: 'increase-timeout' | 'add-wait' | 'optimize-selector' | 'mock-api';
    description: string;
    code: string;
  }[];
  llmGuidance: {
    severity: 'info' | 'warning' | 'critical';
    summary: string;
    rootCause: string;
    suggestedFixes: string[];
  };
};

export type PerformanceAPI = {
  perf_set_budgets(budgets: { interaction?: number; fcp?: number; lcp?: number }): Promise<void>;
  perf_report(): Promise<PerformanceReport>;
  perf_interaction_timing(ref: string, action: string): Promise<InteractionPerformance>;
};
```

### Example Reports

#### **Example 1: Slow Interaction**

```json
{
  "action": "click",
  "elementRef": "e5",
  "duration": 2847,
  "budget": 1000,
  "exceeded": true,
  "breakdown": {
    "apiCalls": 2100,
    "rendering": 600,
    "scripting": 147
  },
  "longTasks": [
    {
      "duration": 523,
      "scriptUrl": "app.bundle.js"
    }
  ],
  "recommendations": [
    {
      "type": "increase-timeout",
      "description": "This interaction consistently takes ~3s due to API call",
      "code": "await page.click('[data-testid=\"submit\"]', { timeout: 5000 });\nawait page.waitForResponse(resp => resp.url().includes('/api/submit'));"
    },
    {
      "type": "mock-api",
      "description": "Consider mocking the API call for faster tests",
      "code": "await page.route('**/api/submit', route => {\n  route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });\n});"
    }
  ],
  "llmGuidance": {
    "severity": "warning",
    "summary": "Click triggers 2.1s API call, consistently exceeding 1s interaction budget",
    "rootCause": "Synchronous API call blocking UI after button click",
    "suggestedFixes": [
      "Increase timeout to 5s for this specific interaction",
      "Add explicit wait for API response",
      "Consider mocking API in tests for consistency"
    ]
  }
}
```

#### **Example 2: Page Load Budget**

```json
{
  "url": "https://example.com/dashboard",
  "metrics": {
    "fcp": 2100,
    "lcp": 3800,
    "tti": 4200,
    "cls": 0.15,
    "totalLoadTime": 5600
  },
  "budgets": {
    "fcp": 1800,
    "lcp": 2500,
    "tti": 3800
  },
  "violations": [
    "FCP exceeded budget by 300ms",
    "LCP exceeded budget by 1300ms",
    "TTI exceeded budget by 400ms"
  ],
  "recommendations": [
    {
      "type": "add-wait",
      "description": "Page takes 4.2s to become interactive—default 30s timeout may be insufficient in slow CI",
      "code": "await page.goto('https://example.com/dashboard', { waitUntil: 'networkidle' });\nawait page.waitForLoadState('domcontentloaded');"
    }
  ],
  "llmGuidance": {
    "severity": "warning",
    "summary": "Page consistently slow to load (4.2s TTI)—may timeout in CI",
    "rootCause": "Large bundle size and third-party scripts blocking initial render",
    "suggestedFixes": [
      "Use explicit waitUntil strategy instead of relying on defaults",
      "Add longer timeout for this specific page",
      "Consider performance optimization of the application"
    ]
  }
}
```

### Implementation Details

#### **CDP Integration**
```javascript
// Enable performance tracking
await cdpSession.send('Performance.enable');
await cdpSession.send('PerformanceTimeline.enable', {
  eventTypes: ['largest-contentful-paint', 'layout-shift']
});

// Capture interaction timing
const startTime = Date.now();
await page.click(selector);
const metrics = await cdpSession.send('Performance.getMetrics');
const duration = Date.now() - startTime;

// Analyze long tasks
const longTasks = metrics.metrics
  .filter(m => m.name === 'TaskDuration' && m.value > 50)
  .map(task => ({ duration: task.value }));
```

#### **Budget Configuration**
```javascript
const DEFAULT_BUDGETS = {
  interaction: 1000,    // 1s for interactions
  fcp: 1800,           // 1.8s First Contentful Paint
  lcp: 2500,           // 2.5s Largest Contentful Paint
  tti: 3800,           // 3.8s Time to Interactive
  cls: 0.1,            // 0.1 Cumulative Layout Shift
};
```

#### **Auto-mode**
- Track all interactions automatically
- Report when budgets exceeded
- Suggest specific timeout adjustments
- Minimal overhead using existing CDP metrics

---

## Architecture & Integration

### Shared Infrastructure

All three features leverage the same architectural patterns:

#### **1. CDP Session Management** (already in MultiContextBrowser)
```typescript
class ReliabilityMonitor {
  private cdpSession: CDPSession;
  private enabled: boolean = true;  // Auto-enabled by default
  
  constructor(cdpSession: CDPSession) {
    this.cdpSession = cdpSession;
    this.setupListeners();
  }
  
  private async setupListeners() {
    // Race detection
    this.cdpSession.on('DOM.childNodeRemoved', this.handleNodeRemoved);
    
    // Performance monitoring
    await this.cdpSession.send('Performance.enable');
    
    // A11y analysis (on-demand, cached)
    // Inject axe-core into isolated world when needed
  }
}
```

#### **2. MultiContextBrowser Integration**
```typescript
// Add to MultiContextBrowser class
class MultiContextBrowser {
  private reliabilityMonitor?: ReliabilityMonitor;
  
  async initialize() {
    // ... existing initialization ...
    this.reliabilityMonitor = new ReliabilityMonitor(this.cdpSession);
  }
  
  // Expose MCP tools
  async race_detection_report() {
    return this.reliabilityMonitor?.getRaceReport();
  }
  
  async a11y_analyze_page() {
    return this.reliabilityMonitor?.analyzeAccessibility();
  }
  
  async perf_report() {
    return this.reliabilityMonitor?.getPerformanceReport();
  }
}
```

#### **3. LLM Guidance Engine**
```typescript
class GuidanceEngine {
  // Pattern matching for common issues
  static generateGuidance(issue: Issue): LLMGuidance {
    const patterns = {
      'react-rerender-race': {
        likelyCauses: ['Component re-rendered during interaction', ...],
        suggestedActions: ['Add waitForSelector', 'Use stable selector', ...],
      },
      'button-without-name': {
        likelyCauses: ['Icon-only button', 'Dynamic content', ...],
        suggestedActions: ['Add aria-label', 'Add visible text', ...],
      },
      // ... more patterns
    };
    
    return matchPattern(issue, patterns);
  }
}
```

### Default Behavior (Auto-mode)

All features enabled by default with zero configuration:

```typescript
// Agent writes test normally
await browser_navigate(url);           // → Perf tracking starts
await browser_click("e3");             // → Race detection + perf monitoring

// If issues detected above thresholds, automatic report surfaces:
// "⚠️ Detected race condition: element detached 45ms before click"
// "💡 Suggestion: await page.waitForSelector(..., { state: 'attached' })"
```

### Opt-out for Advanced Users

```typescript
// Disable if not wanted (though overhead is minimal)
await reliability_configure({
  raceDetection: false,
  a11yAnalysis: false,
  perfMonitoring: true,  // Keep only performance
});
```

---

## Rollout Plan

### Phase 1: Race Condition Detection (MVP)
**Priority**: Highest impact, leverages existing ref tracking

**Deliverables**:
- Element detachment detection
- Basic navigation race detection
- Simple recommendations (wait strategies)
- MCP tool: `race_detection_report()`

**Timeline**: 2-3 weeks

### Phase 2: Performance Monitoring
**Priority**: High value, relatively easy with CDP APIs

**Deliverables**:
- Interaction timing tracking
- Page load metrics (FCP, LCP, TTI)
- Budget configuration
- MCP tools: `perf_report()`, `perf_set_budgets()`

**Timeline**: 2 weeks

### Phase 3: Accessibility Analysis
**Priority**: High value, requires axe-core integration

**Deliverables**:
- axe-core integration in isolated world
- Selector stability scoring
- Before/after selector comparison
- MCP tools: `a11y_analyze_page()`, `a11y_suggest_selector()`

**Timeline**: 3-4 weeks

### Phase 4: Enhanced Guidance & Auto-mode
**Priority**: Polish and UX refinement

**Deliverables**:
- Pattern-matched guidance for all features
- Auto-enable all features by default
- Threshold-based reporting
- `*_explain()` tools for deep dives

**Timeline**: 2 weeks

---

## Success Metrics

### User Adoption
- % of sessions with reliability features enabled
- % of reports that lead to test modifications
- User feedback on guidance quality

### Technical Metrics
- False positive rate (< 5% target)
- Overhead per interaction (< 10ms target)
- Report generation time (< 100ms target)

### Impact Metrics
- Reduction in test flakiness (measure retry rates)
- Improvement in selector stability (measure nth() usage decline)
- Faster authoring (time from start to working test)

---

## Positioning & Messaging

### Tagline
**"Verdex: AI-powered test authoring with built-in reliability guardrails"**

### Key Messages

1. **Catch flakes before CI**
   - "Stop debugging intermittent failures in CI. Verdex detects race conditions, timing issues, and selector instability while you write tests."

2. **AI guides you to better tests**
   - "When issues are detected, your AI assistant provides specific fixes based on proven patterns—not generic suggestions."

3. **Zero configuration**
   - "Reliability monitoring runs automatically. No setup, no overhead, just better tests."

4. **Makes apps better**
   - "Accessibility analysis doesn't just improve your tests—it makes your app more usable for everyone."

### Competitive Positioning

| Feature | Playwright | Cypress | **Verdex** |
|---------|-----------|---------|---------|
| Selector intelligence | Inspector | Studio | ✅ AI-guided exploration |
| Flake detection | ❌ Manual | ❌ Manual | ✅ Automatic |
| A11y → Test quality | ❌ Separate | ❌ Separate | ✅ Integrated |
| Performance insights | ❌ Manual | ❌ Separate tool | ✅ Automatic |
| AI-native reporting | ❌ | ❌ | ✅ LLM-optimized |

---

## Developer Experience

### Example: Full Authoring Session

```
Human: "Write a test that adds iPhone to cart"

Agent: [enables Verdex]
→ browser_navigate("https://shop.example.com")
→ get_ancestors(ref="e3")
→ browser_click("e3")

Verdex (auto): ⚠️ Race condition detected!
{
  "issue": "detached",
  "summary": "Element removed during React re-render",
  "recommendation": "Add waitForSelector with attached state"
}

Agent: "I found the Add to Cart button but detected a race condition—
       the element is being removed during re-renders. 
       
       Let me write the test with proper waiting:
       
       await page.waitForSelector('[data-testid=\"product-card\"]', 
         { state: 'attached' });
       await page.getByTestId('product-card')
         .filter({ hasText: 'iPhone' })
         .getByRole('button', { name: 'Add to Cart' })
         .click();
       
       I've also noticed the button has no accessible name—
       adding aria-label would make this selector more stable."
```

---

## Risk & Mitigations

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| False positives in race detection | Medium | Start conservative; tune thresholds based on feedback |
| Performance overhead | Low | CDP metrics are cheap; cache a11y results |
| axe-core bundle size | Low | Load on-demand only when a11y analysis requested |
| CDP API compatibility | Medium | Graceful degradation; feature detection |
| Guidance accuracy | High | Pattern library validated against real-world issues |

### Product Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Feature overload | Medium | Auto-mode ensures zero friction; only surface when needed |
| Scope creep | High | Stay focused on authoring-time; no production monitoring |
| User confusion | Low | Clear LLM guidance; agents handle complexity |
| Maintenance burden | Medium | Shared infrastructure; well-tested patterns |

---

## Testing Strategy

### Unit Tests
- Pattern matching engine for guidance
- Threshold detection logic
- Report generation and formatting
- CDP event handling

### Integration Tests
```javascript
describe('Race Detection', () => {
  it('detects element detachment during click', async () => {
    await page.goto('http://localhost:3000/flaky-button');
    const report = await race_detection_report();
    expect(report.detected).toBe(true);
    expect(report.checks[0].issue).toBe('detached');
    expect(report.recommendations[0].waitStrategy).toContain('waitForSelector');
  });
  
  it('detects selector instability', async () => {
    await page.goto('http://localhost:3000/dynamic-list');
    // Trigger dynamic content change
    await page.click('[data-testid="load-more"]');
    const report = await race_detection_report();
    expect(report.checks[0].issue).toBe('multiple-matches');
  });
});

describe('A11y Analysis', () => {
  it('detects buttons without accessible names', async () => {
    await page.goto('http://localhost:3000/icon-buttons');
    const report = await a11y_analyze_page();
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        rule: 'button-name',
        severity: 'critical'
      })
    );
  });
  
  it('suggests selector improvements', async () => {
    const suggestion = await a11y_suggest_selector('e3');
    expect(suggestion.stability).toBe('fragile');
    expect(suggestion.ideal).toContain('getByRole');
  });
});

describe('Performance Monitoring', () => {
  it('detects slow interactions', async () => {
    await page.goto('http://localhost:3000/slow-api');
    await page.click('[data-testid="submit"]');
    const report = await perf_report();
    expect(report.interactions[0].exceeded).toBe(true);
    expect(report.recommendations).toContainEqual(
      expect.objectContaining({
        type: 'increase-timeout'
      })
    );
  });
});
```

### E2E Tests with Real Scenarios
- Actual flaky test from open-source projects
- Performance-sensitive pages (large SPAs)
- Accessibility-challenged UIs
- Validate LLM guidance quality

---

## Documentation Requirements

### For Users
1. **Getting Started Guide**
   - How reliability features work
   - When reports surface
   - How to interpret guidance

2. **Configuration Guide**
   - Budget customization
   - Threshold tuning
   - Opt-out options

3. **Best Practices**
   - Using reliability reports to improve tests
   - Addressing accessibility for better selectors
   - Performance-aware test authoring

### For AI Agents
1. **Tool Descriptions** (in MCP manifest)
   - When to use each reliability tool
   - How to interpret reports
   - Pattern library for common fixes

2. **Prompt Engineering**
   - How to surface issues to users
   - Code generation from recommendations
   - Progressive disclosure (summary → details)

---

## Future Enhancements (Post-MVP)

### Advanced Race Detection
- Mutation observer patterns
- Scroll-into-view timing
- Animation/transition awareness
- Multi-step interaction chains

### Enhanced Accessibility
- Visual regression with accessibility impact
- Color contrast analysis
- Keyboard navigation testing
- Screen reader compatibility

### Performance Deep Dives
- Memory leak correlation (links to leak detection feature!)
- Bundle analysis integration
- Network waterfall analysis
- Third-party script impact

### Test Quality Metrics
- Selector stability score over time
- Flake rate trending
- Coverage of accessibility anchors
- Performance budget compliance

---

## Open Questions

1. **Thresholds**: What deltas should trigger reports?
   - Start conservative, adjust based on feedback
   - Make configurable per project

2. **Pattern Library**: How to maintain guidance accuracy?
   - Community contributions
   - Feedback loop from LLM responses
   - Regular updates based on framework changes

3. **Report Frequency**: How often to surface issues?
   - Only on new/changed issues?
   - Digest mode (summary at end of session)?
   - Real-time vs. on-demand?

4. **Integration Points**: Should Verdex write test files directly?
   - Current: Agent interprets and writes code
   - Future: Option to generate test scaffold automatically?

---

## Conclusion

The Reliability Suite positions Verdex as more than a selector tool—it's a comprehensive authoring assistant that catches problems before they reach CI.

### Why This Works

1. **Addresses real pain points** - Flaky tests are the #1 complaint
2. **Leverages existing capabilities** - CDP access, ref tracking, isolated worlds
3. **Perfect for LLMs** - Structured, actionable, pattern-based
4. **Improves with use** - Pattern library grows, guidance improves
5. **Zero friction** - Auto-enabled, threshold-based surfacing

### Strategic Value

- **Differentiation**: No other tool combines selector intelligence + reliability guardrails
- **Stickiness**: Once developers rely on this, they won't go back
- **Expansion**: Natural bridge to test quality metrics, CI integration
- **Network effects**: Pattern library improves with community usage

### Next Steps

1. ✅ Review and approve plan
2. ⏭️ Prioritize Phase 1 (Race Detection) for prototyping
3. ⏭️ Build pattern library for common frameworks
4. ⏭️ Design MCP tool interfaces
5. ⏭️ Implement MVP and gather feedback

---

**This positions Verdex at the forefront of AI-assisted test authoring—not just generating code, but ensuring it's reliable from day one.**
