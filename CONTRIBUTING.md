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

### 📖 LLM Instructions (Skills & Rules)

Help improve how LLMs use Verdex:

- Refine selector patterns based on real-world usage
- Add decision trees for tool selection
- Document new workflows you discover
- Create specialized guides for specific scenarios
- Keep Skills and Cursor Rules synchronized

**Important**: Changes to instruction layer don't require tool changes!

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

## Contributing to the Instruction Layer vs. Tool Layer

Verdex follows a **decoupled architecture** that separates tool implementation from LLM instructions:

### 🔧 Tool Layer (Core Verdex MCP)

**Location**: `src/`, `tests/`  
**What it is**: The actual MCP tools for browser automation

This layer is **AI-assistant agnostic** and provides:
- Browser management (`browser_initialize`, `browser_navigate`)
- DOM exploration (`resolve_container`, `inspect_pattern`, `extract_anchors`)
- Interaction tools (`browser_click`, `browser_type`)

**Contributing here**: Follow standard TypeScript/testing workflow above

---

### 📚 Instruction Layer (Skills & Cursor Rules)

**Location**: `SKILL.md`, `guides/`, `.cursor/rules/` (if using Cursor)  
**What it is**: Guidance that teaches LLMs how to use the tools effectively

This layer is **LLM-specific** and provides:
- Workflow patterns (explore → select → test)
- Best practices (Container → Content → Role pattern)
- Progressive disclosure strategy
- Common pitfalls and solutions

**We provide two formats:**

1. **Anthropic Skills** (for Claude Code, Claude Desktop)
   - `SKILL.md` - Main entry point
   - `guides/workflow-discovery.md` - Exploration techniques
   - `guides/selector-writing.md` - Selector patterns
   - `guides/playwright-patterns.md` - Test writing

2. **Cursor Rules** (for Cursor IDE)
   - `.cursor/rules/` - Workspace-level rules
   - Same content, different loading mechanism

---

### Why This Matters

✅ **Portability**: The same Verdex MCP tools work with Claude, GPT-4, or any future AI assistant

✅ **Flexibility**: You can customize instructions for your team without touching tool code

✅ **Evolution**: Tools can improve independently from instruction methods

✅ **Community**: Others can create instruction sets for different use cases or AI platforms

---

### Contributing to Instructions

**When updating instruction layer:**

1. Maintain consistency across both formats (Skills + Cursor Rules)
2. Test with actual LLM interactions
3. Focus on progressive disclosure (don't overwhelm with all info at once)
4. Include decision trees to guide when to use what
5. Provide concrete examples, not abstract principles

**Example contributions:**
- Add new selector patterns discovered in real usage
- Improve decision trees for tool selection
- Add troubleshooting sections for common issues
- Create specialized guides for specific app types (SPAs, legacy apps, etc.)

**File locations to update:**
- `SKILL.md` - Update core skill if changing overall workflow
- `guides/*.md` - Update specific guides for detailed changes
- `.cursor/rules/` (if present) - Keep in sync with Skills format

---

## Architecture & Design Reference

### Current Documentation

For understanding the current system architecture:

- **`ARCHITECTURE.md`** - System architecture overview
  - Layer architecture (Browser → Runtime → Server → MCP)
  - Event-driven patterns (ManualPromise, CDP coordination)
  - Multi-frame element addressing
  - Memory management and cleanup

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

