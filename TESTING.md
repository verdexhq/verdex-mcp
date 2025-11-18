# Testing Guide for Verdex MCP

## Overview

Verdex MCP has a comprehensive E2E test suite that ensures reliability across all components. All tests run automatically on GitHub Actions for every PR.

## Quick Start

```bash
# Run all tests
npm test

# Run specific test file
npx playwright test tests/bridge-lifecycle.spec.ts

# Run in headed mode (see browser)
npx playwright test --headed

# Run with debug
npx playwright test --debug
```

## Test Suite Structure

### Critical Tests (Must Pass)
- **MCP Server Integration** (`mcp-server-integration.spec.ts`) - Tests all 10 MCP tools
- **Role Management** (`role-management.spec.ts`) - Multi-role browser isolation
- **Navigation Lifecycle** (`navigation-lifecycle.spec.ts`) - Navigation behavior
- **Bridge Lifecycle** (`bridge-lifecycle.spec.ts`) - Bridge persistence across navigations

### High Priority Tests
- **Error Handling** (`error-handling.spec.ts`) - Error messages and propagation
- **Structural Analysis** (`structural-analysis.spec.ts`) - DOM exploration tools

### Medium Priority Tests
- **Bundled Bridge** (`bundled-bridge.spec.ts`) - Bridge injection mechanism
- **Snapshot Generator** (`snapshot-generator.spec.ts`) - Accessibility tree generation
- **CSS & YAML** (`css-and-yaml.spec.ts`) - Content edge cases

**Total Duration**: ~2-3 minutes for full suite

## Writing Tests

### Test Pattern

```typescript
import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../src/runtime/MultiContextBrowser.js";

test.describe("Feature Name", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.initialize();
  });

  test.afterEach(async () => {
    await browser.close();  // Critical: Always cleanup
  });

  test("should do specific thing", async () => {
    // Use data URLs for fast, reliable tests
    await browser.navigate("data:text/html,<button>Test</button>");
    
    const snapshot = await browser.snapshot();
    expect(snapshot.text).toContain("Test");
  });
});
```

### Best Practices

1. **✅ Always cleanup** - Call `browser.close()` in `afterEach`
2. **✅ Use data URLs** - Faster and more reliable than external sites
3. **✅ Test one concept** - One assertion per test
4. **✅ Clear descriptions** - Test names should explain what they verify
5. **✅ Avoid timeouts** - Use proper awaits instead of `setTimeout`

### Anti-Patterns

- **❌ External dependencies** - Don't rely on real websites (except example.com for demos)
- **❌ Hardcoded waits** - Use `await` instead of `setTimeout`
- **❌ Shared state** - Each test should be independent
- **❌ No cleanup** - Always close browser to prevent leaks

## CI/CD

### GitHub Actions

Tests run automatically on:
- Every push to `main` or `develop`
- Every pull request
- Manual workflow dispatch

**Status Badge**: ![Test Suite](https://github.com/verdexhq/verdex-mcp/actions/workflows/test.yml/badge.svg)

### What CI Runs

1. **Full Test Suite** - All tests via `./tests/run-pr-tests.sh`
2. **Smoke Test** - Critical tests only (fast fail)

Both jobs run in parallel for faster feedback.

## npm Publish Safety

The `prepublishOnly` script ensures tests pass before publishing:

```json
{
  "scripts": {
    "prepublishOnly": "npm run build && npm test"
  }
}
```

**This prevents broken versions from reaching npm!**

## Debugging Failed Tests

### View Test Report

```bash
# Generate HTML report
npx playwright test

# View report
npx playwright show-report
```

### Run Single Test

```bash
# By file
npx playwright test tests/bridge-lifecycle.spec.ts

# By line number
npx playwright test tests/bridge-lifecycle.spec.ts:62

# By name pattern
npx playwright test -g "should inject bridge"
```

### Debug Mode

```bash
# Playwright Inspector
npx playwright test --debug

# Headed mode (see browser)
npx playwright test --headed

# Verbose output
npx playwright test --reporter=list
```

## Performance Standards

Recent optimizations (Nov 2024):
- **Click operations**: 5.5s → 1.0s (4.5s improvement)
- **Bridge lifecycle tests**: Now pass in ~22s (was timing out at 30s+)
- **Full test suite**: ~2-3 minutes

### Key Performance Fixes

Changed click behavior for better performance:
- Timeout: 5s → 1s (faster for non-navigating clicks)
- Network idle: `networkidle0` → `networkidle2` (more forgiving)
- Removed redundant 500ms post-click wait

## Troubleshooting

### Tests Timing Out

**Symptom**: Tests exceed 30s timeout  
**Solution**: Use data URLs instead of real websites

```typescript
// ❌ Slow
await browser.navigate("https://external-site.com");

// ✅ Fast
await browser.navigate("data:text/html,<button>Test</button>");
```

### Memory Leaks

**Symptom**: Tests slow down or crash  
**Solution**: Ensure `afterEach` always calls `browser.close()`

```typescript
test.afterEach(async () => {
  await browser.close();  // CRITICAL!
});
```

### Flaky Tests

**Symptom**: Tests pass/fail inconsistently  
**Solution**: Remove hardcoded timeouts, use proper awaits

```typescript
// ❌ Flaky
await new Promise(resolve => setTimeout(resolve, 1000));

// ✅ Reliable
await browser.navigate(url);  // Waits for network idle automatically
```

## Contributing Tests

When adding new functionality:

1. **Add tests** for the new feature
2. **Run full suite** to ensure no regressions
3. **Update documentation** if test patterns change
4. **Follow existing patterns** in test files

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

## Resources

- **Detailed Test Docs**: See `tests/README.md`
- **Contributing Guide**: [CONTRIBUTING.md](CONTRIBUTING.md)
- **Playwright Docs**: https://playwright.dev/docs/intro

---

**Questions?** Open a [discussion](https://github.com/verdexhq/verdex-mcp/discussions) or [issue](https://github.com/verdexhq/verdex-mcp/issues).

