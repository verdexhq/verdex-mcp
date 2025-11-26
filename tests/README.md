# Verdex MCP Test Suite

Comprehensive end-to-end tests for the Verdex MCP browser automation system.

## 📁 Organization

Tests are now organized into thematic directories. See [ORGANIZATION.md](./ORGANIZATION.md) for details.

```
tests/
├── integration/    - Full stack E2E tests
├── runtime/        - Browser & navigation tests
├── bridge/         - Bridge lifecycle tests
├── multi-frame/    - Frame & iframe tests
├── features/       - Feature-specific tests
├── performance/    - Load & stress tests
├── regression/     - Fixed bugs & flaky tests
├── archive/        - Deprecated tests
└── utils/          - Shared test utilities
```

## Overview

This test suite ensures the Verdex MCP system functions correctly across all major components:
- MCP Server API
- Multi-role browser management
- Bridge injection and lifecycle
- Navigation handling
- Structural analysis tools
- Error handling

## Test Files

### Critical Regression Tests

#### `mcp-server-integration.spec.ts`
Tests all 10 MCP server tools through the complete stack:
- `browser_initialize` - Browser initialization
- `browser_navigate` - Page navigation with metadata
- `browser_snapshot` - Accessibility tree capture
- `browser_click` - Element interaction
- `browser_type` - Input handling
- `wait_for_browser` - Timing control
- `browser_close` - Cleanup
- `resolve_container` - Container hierarchy discovery
- `inspect_pattern` - Sibling pattern analysis
- `extract_anchors` - Descendant exploration

**Why critical:** Tests the entire public API surface that LLMs use.

#### `role-management.spec.ts`
Tests multi-role browser context management:
- Role creation and switching
- Context isolation (separate cookies, storage, sessions)
- Lazy initialization
- Role cleanup
- Navigation state per role
- Element ref isolation per role

**Why critical:** Role isolation bugs could leak data between user sessions.

#### `navigation-lifecycle.spec.ts`
Tests navigation behavior and metadata capture:
- Navigation success/failure metadata
- Page title, URL, status codes
- Load time tracking
- Sequential navigations
- Bridge survival after navigation
- Click-triggered navigation
- Same-document vs cross-document navigation

**Why critical:** Navigation is the foundation of all automation workflows.

#### `bridge-lifecycle.spec.ts`
Tests bridge injection and persistence:
- Bridge survives cross-document navigation
- Bridge survives same-document navigation (SPA)
- Multiple navigation cycles
- Separate bridges per role
- Complex DOM handling
- Bridge after interactions
- Shadow DOM support

**Why critical:** Broken bridge = broken automation for all users.

#### `error-handling.spec.ts`
Tests error propagation and messaging:
- Invalid element refs
- Removed elements
- Invalid ancestor levels
- Actionable error messages
- Error propagation through stack

**Why critical:** Clear errors help LLMs recover from failures.

### Comprehensive Feature Tests

#### `structural-analysis.spec.ts`
Tests structural analysis edge cases:
- **resolve_container:** Deep nesting, shallow DOM, data attributes
- **inspect_pattern:** No siblings, many siblings, mixed types
- **extract_anchors:** Deep trees, wide trees, performance limits
- Performance on large DOMs
- Data attribute preservation (data-testid, ids)

**Why important:** Selector generation depends on accurate structural analysis.

#### `bundled-bridge.spec.ts`
Tests bridge bundle injection:
- Bridge injection on first navigation
- Version validation
- Multi-role isolation
- Survival across navigations

**Why important:** Validates the bridge injection mechanism works correctly.

#### `snapshot-generator.spec.ts`
Tests accessibility tree generation:
- Roles, props, refs
- ARIA attributes
- Shadow DOM and slots
- aria-owns hoisting
- Generic wrapper normalization
- Hidden content exclusion

**Why important:** Snapshot quality determines what LLMs can see and interact with.

#### `css-and-yaml.spec.ts`
Tests content capture edge cases:
- CSS pseudo-element content (::before, ::after)
- YAML special character escaping
- Content with colons, quotes, brackets
- Boolean-like values ("true", "false", "null")

**Why important:** Prevents parse errors in LLM consumption of snapshots.

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Tests by Category
```bash
# Integration tests
npx playwright test tests/integration/

# Multi-frame tests
npx playwright test tests/multi-frame/

# Performance tests  
npx playwright test tests/performance/

# Feature tests
npx playwright test tests/features/
```

### Run Specific Test File
```bash
npx playwright test tests/runtime/role-management.spec.ts
npx playwright test tests/runtime/navigation-lifecycle.spec.ts
npx playwright test tests/bridge/bridge-lifecycle.spec.ts
```

### Run Tests in Headed Mode (Debugging)
```bash
npx playwright test --headed
npx playwright test tests/role-management.spec.ts --headed
```

### Run Tests with Detailed Output
```bash
npx playwright test --reporter=list
```

### Run Specific Priority Tests
```bash
# Critical tests only
npx playwright test tests/mcp-server-integration.spec.ts tests/role-management.spec.ts tests/navigation-lifecycle.spec.ts tests/bridge-lifecycle.spec.ts

# High priority tests
npx playwright test tests/error-handling.spec.ts tests/structural-analysis.spec.ts
```

## Test Structure

All tests follow this structure:

```typescript
test.describe("Feature Name", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.initialize();
  });

  test.afterEach(async () => {
    await browser.close();
  });

  test("should do specific thing", async () => {
    // Arrange: Set up test conditions
    await browser.navigate("data:text/html,<button>Test</button>");

    // Act: Perform the action
    const snapshot = await browser.snapshot();

    // Assert: Verify expectations
    expect(snapshot.text).toContain("Test");
  });
});
```

## Test Quality Standards

### All Tests Must:
1. ✅ Clean up resources (close browser, delete temp files)
2. ✅ Be isolated (no dependencies between tests)
3. ✅ Be deterministic (no flaky tests)
4. ✅ Have clear failure messages
5. ✅ Test one concept per test
6. ✅ Use semantic selectors (no brittle XPath/CSS)

### Anti-Patterns to Avoid:
- ❌ Tests that depend on external services or network access
- ❌ Tests with hardcoded timeouts (use await instead)
- ❌ Tests that share state between test cases
- ❌ Tests with vague assertions (use specific expectations)
- ❌ Tests that don't clean up after themselves

## Coverage Goals

| Component | Target | Current Status |
|-----------|--------|----------------|
| MCP Server Integration | 95% | ✅ Good |
| Role Management | 95% | ✅ Excellent |
| Navigation Lifecycle | 95% | ✅ Excellent |
| Bridge Lifecycle | 95% | ✅ Excellent |
| Error Handling | 90% | ✅ Good |
| Structural Analysis | 90% | ✅ Excellent |
| Snapshot Generation | 95% | ✅ Good |
| CSS & YAML Handling | 90% | ✅ Good |

## CI/CD Integration

### GitHub Actions / CI Setup
```yaml
- name: Install dependencies
  run: npm ci

- name: Install Playwright Browsers
  run: npx playwright install --with-deps chromium

- name: Run tests
  run: npm test

- name: Upload test results
  if: failure()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

### Pre-commit Hook (Recommended)
```bash
# .git/hooks/pre-push
#!/bin/bash
echo "Running Verdex MCP tests before push..."
npm test
if [ $? -ne 0 ]; then
  echo "Tests failed. Fix them before pushing."
  exit 1
fi
```

## Debugging Failed Tests

### 1. Run in Headed Mode
```bash
npx playwright test tests/failing-test.spec.ts --headed
```

### 2. Enable Debug Mode
```bash
DEBUG=pw:api npx playwright test tests/failing-test.spec.ts
```

### 3. Use Playwright Inspector
```bash
PWDEBUG=1 npx playwright test tests/failing-test.spec.ts
```

### 4. Check HTML Report
```bash
npx playwright show-report
```

## Adding New Tests

### 1. Identify What to Test
- What functionality is being added/changed?
- What edge cases exist?
- What could break if this changes?

### 2. Choose the Right Test File
- MCP API changes → `mcp-server-integration.spec.ts`
- Role management → `role-management.spec.ts`
- Navigation behavior → `navigation-lifecycle.spec.ts`
- Bridge lifecycle → `bridge-lifecycle.spec.ts`
- Structural analysis → `structural-analysis.spec.ts`
- Error handling → `error-handling.spec.ts`

### 3. Write the Test
```typescript
test("should handle [specific scenario]", async () => {
  // Arrange
  await browser.navigate("data:text/html,<button>Test</button>");

  // Act
  const snapshot = await browser.snapshot();

  // Assert
  expect(snapshot.text).toContain("Test");
  expect(snapshot.elementCount).toBeGreaterThan(0);
});
```

### 4. Run and Verify
```bash
npx playwright test tests/your-new-test.spec.ts
```

## Test Maintenance

### When to Update Tests
- ✅ API changes (update tests to match new behavior)
- ✅ Bug fixes (add regression test)
- ✅ New features (add feature tests)
- ✅ Performance improvements (verify no regressions)

### When NOT to Update Tests
- ❌ Implementation details change (tests should test behavior, not implementation)
- ❌ Internal refactoring (tests should pass without changes)

## Performance Considerations

### Test Execution Time
- Target: < 5 minutes for full suite
- Current: ~2-3 minutes for critical tests
- Optimization: Tests run in parallel (6 workers)

### Resource Usage
- Each test gets fresh browser instance
- Browser contexts are isolated
- Cleanup happens automatically in afterEach

## Common Issues

### Tests Timing Out
**Cause:** Network-dependent navigation or slow pages

**Fix:** Use data URLs for test HTML:
```typescript
await browser.navigate("data:text/html,<button>Test</button>");
```

### Flaky Tests
**Cause:** Race conditions or timing dependencies

**Fix:** Use proper awaits and avoid hardcoded timeouts:
```typescript
// Bad
await new Promise(resolve => setTimeout(resolve, 1000));

// Good
await browser.navigate(url);  // Waits for network idle
```

### Memory Leaks
**Cause:** Not closing browser in afterEach

**Fix:** Always close browser:
```typescript
test.afterEach(async () => {
  await browser.close();  // Critical!
});
```

## Support

For questions about tests:
1. Check this README
2. Read test file comments
3. Check `TEST_COVERAGE_PLAN.md` for detailed strategy
4. Review existing test patterns

## Contributing

When adding tests:
1. Follow existing patterns
2. Add clear test descriptions
3. Include comments for complex logic
4. Ensure tests are deterministic
5. Run pre-PR validation script before submitting

---

**Last Updated:** November 2024
**Maintained By:** Verdex Team

