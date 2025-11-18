# Contributing to Verdex MCP

Thank you for your interest in contributing to Verdex MCP! 🎉

## Quick Start

```bash
# 1. Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/verdex-mcp.git
cd verdex-mcp

# 2. Install dependencies
npm install

# 3. Install Playwright browsers
npx playwright install chromium

# 4. Build the project
npm run build

# 5. Run tests to verify setup
npm test
```

## Development Workflow

### Making Changes

1. **Create a branch** for your feature/fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** in the `src/` directory

3. **Build** to compile TypeScript:
   ```bash
   npm run build
   ```

4. **Run tests** to ensure nothing broke:
   ```bash
   npm test
   ```

5. **Run the full PR test suite** (recommended):
   ```bash
   npm run test:pr
   ```

### Testing Your Changes

We have comprehensive E2E tests to ensure quality:

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

**Test files location**: `tests/`  
**Test documentation**: See `tests/README.md` for detailed information

### Code Style

- TypeScript strict mode enabled
- Use meaningful variable names
- Add comments for complex logic
- Follow existing code patterns

## Pull Request Process

### Before Submitting

1. ✅ **All tests pass**: `npm test`
2. ✅ **Build succeeds**: `npm run build`
3. ✅ **No TypeScript errors**: Check during build
4. ✅ **Tests added** for new features
5. ✅ **Documentation updated** if needed

### PR Checklist

- [ ] Tests pass locally (`npm test`)
- [ ] New tests added for new functionality
- [ ] Documentation updated (if applicable)
- [ ] PR description explains what and why
- [ ] Commits are clear and focused
- [ ] No merge conflicts with main branch

### PR Guidelines

**Good PR Title Examples:**
- ✅ `feat: Add support for iframe exploration`
- ✅ `fix: Resolve bridge injection race condition`
- ✅ `docs: Update multi-role configuration examples`
- ✅ `perf: Optimize click operation timeout`

**PR Description Should Include:**
- **What** changed
- **Why** it was needed
- **How** to test it
- **Related issues** (if any)

### CI/CD

When you submit a PR, GitHub Actions will automatically:
- ✅ Run the full test suite
- ✅ Run critical smoke tests
- ✅ Build the project
- ✅ Report any failures

**All checks must pass before merging.**

## Types of Contributions

### 🐛 Bug Fixes

Found a bug? Great!

1. Check if an issue exists
2. If not, [create one](https://github.com/verdexhq/verdex-mcp/issues/new)
3. Fork, fix, and submit a PR
4. Reference the issue in your PR

### ✨ New Features

Want to add a feature?

1. [Open a discussion](https://github.com/verdexhq/verdex-mcp/discussions) first
2. Get feedback from maintainers
3. Implement with tests
4. Submit PR with documentation

### 📚 Documentation

Documentation improvements are always welcome!

- Fix typos
- Clarify confusing sections
- Add examples
- Improve code comments

### 🧪 Tests

Help improve test coverage:

- Add edge case tests
- Add performance tests
- Improve test clarity
- Document test patterns

## Development Tips

### Running in Dev Mode

```bash
# Watch mode for bridge bundle
npm run bundle:watch

# Run in development mode
npm run dev
```

### Testing with a Real MCP Client

```bash
# Build first
npm run build

# Run the MCP server
node dist/index.js

# Or with sample role configuration
node dist/index.js \
  --role admin /path/to/admin-auth.json https://admin.example.com
```

### Debugging Tests

```bash
# Run single test in headed mode
npx playwright test tests/your-test.spec.ts --headed

# Use Playwright Inspector
PWDEBUG=1 npx playwright test tests/your-test.spec.ts

# View test report
npx playwright show-report
```

## Project Structure

```
verdex-mcp/
├── src/
│   ├── browser/          # Bridge code (runs in browser)
│   │   ├── core/         # Snapshot generation, analysis
│   │   ├── bridge/       # Bridge factory
│   │   └── utils/        # DOM utilities
│   ├── runtime/          # Node runtime code
│   │   ├── MultiContextBrowser.ts  # Main browser manager
│   │   ├── BridgeInjector.ts       # Bridge injection logic
│   │   └── bridge-bundle.ts        # Bundled bridge code
│   ├── server/           # MCP server implementation
│   │   ├── handlers/     # Tool handlers
│   │   └── tools/        # Tool definitions
│   └── index.ts          # Entry point
├── tests/                # E2E test suite
├── demo/                 # Demo pages and examples
└── dist/                 # Compiled output (generated)
```

## Test Categories

Our tests are organized by priority:

### Critical Tests (Must Pass)
- `mcp-server-integration.spec.ts` - MCP API surface
- `role-management.spec.ts` - Multi-role isolation
- `navigation-lifecycle.spec.ts` - Navigation behavior
- `bridge-lifecycle.spec.ts` - Bridge persistence

### High Priority Tests
- `error-handling.spec.ts` - Error messages
- `structural-analysis.spec.ts` - DOM exploration

### Medium Priority Tests
- `bundled-bridge.spec.ts` - Bridge injection
- `snapshot-generator.spec.ts` - Accessibility tree
- `css-and-yaml.spec.ts` - Content edge cases

**See `tests/README.md` for detailed test documentation.**

## Common Issues

### Tests Timing Out

**Cause**: Network-dependent navigation  
**Fix**: Use data URLs for test HTML:
```typescript
await browser.navigate("data:text/html,<button>Test</button>");
```

### Build Errors

**Issue**: TypeScript compilation errors  
**Fix**: Run `npm install` again, check Node version (>=18)

### Test Failures After Changes

**Issue**: Changed behavior broke existing tests  
**Fix**: Update tests if behavior change is intentional, or fix your code if not

## Getting Help

- **Questions?** [Start a Discussion](https://github.com/verdexhq/verdex-mcp/discussions)
- **Bug?** [Open an Issue](https://github.com/verdexhq/verdex-mcp/issues)
- **Need clarification?** Comment on relevant issue/PR

## Code of Conduct

Be respectful and constructive:
- ✅ Be welcoming to newcomers
- ✅ Respect different viewpoints
- ✅ Accept constructive criticism
- ✅ Focus on what's best for the community
- ❌ No harassment or trolling
- ❌ No spam or self-promotion

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.

---

**Thank you for contributing to Verdex MCP!** 🚀

Every contribution, no matter how small, helps make this project better for the entire community.

