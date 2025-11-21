# Test Organization

Tests are organized by functional area:

## 📁 Directory Structure

- **integration/** - Full stack E2E tests (MCP server + browser)
- **runtime/** - MultiContextBrowser & navigation lifecycle tests  
- **bridge/** - Bridge injection, lifecycle, and configuration tests
- **multi-frame/** - Frame discovery, resolution, and iframe tests
- **features/** - Feature-specific tests (structural analysis, error handling, etc.)
- **performance/** - Performance, load, and stress tests
- **regression/** - Fixed flaky tests and bug regression tests
- **archive/** - Deprecated/investigation tests
- **utils/** - Shared test utilities

## 🚀 Running Tests by Category

```bash
# Run all integration tests
npx playwright test tests/integration/

# Run all multi-frame tests
npx playwright test tests/multi-frame/

# Run performance tests
npx playwright test tests/performance/

# Run everything except archive
npx playwright test tests/ --ignore-snapshots tests/archive/
```

## 📊 Test Count by Category

| Category | Tests | Focus |
|----------|-------|-------|
| integration | 3 | End-to-end MCP workflows |
| runtime | 4 | Navigation & role management |
| bridge | 4 | Bridge lifecycle & injection |
| multi-frame | 7 | Frame handling & iframes |
| features | 4 | Structural analysis & features |
| performance | 3 | Load, stress, memory tests |
| regression | 2 | Flaky test fixes |
| archive | 1 | Old investigation tests |

**Total: 28 active test files**
