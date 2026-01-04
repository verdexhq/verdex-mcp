<p align="center">
  <img src="./.github/assets/verdex_logo.png" alt="Verdex Logo" width="350"/>
</p>

<p align="center"><strong>AI-First Browser Automation for Playwright Test Authoring</strong></p>

<div align="center">

[![npm version](https://img.shields.io/npm/v/@verdex/mcp.svg)](https://www.npmjs.com/package/@verdex/mcp)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Playwright](https://img.shields.io/badge/Playwright-Ready-45ba4b?logo=playwright)](https://playwright.dev/)
[![MCP](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-green.svg)](https://modelcontextprotocol.io)

</div>

---

Verdex helps AI coding assistants write robust Playwright tests. It combines:

- **MCP tools** for token-efficient DOM exploration (100-1K tokens vs 10K+ dumps)
- **Cursor rules & Claude skills** that teach LLMs modern Playwright patterns and the Container → Content → Role methodology
- **Multi-role browser isolation** for testing authenticated flows in parallel

AI assistants don't know how to write good Playwright tests or efficiently explore page structure. Verdex gives them both the tools and the knowledge.

---

## The Difference

**Without Verdex** — AI generates brittle selectors:

```typescript
await page.getByRole('button', { name: 'Add to Cart' }).nth(8).click(); // 💀 Breaks on reorder
await page.locator('.btn-primary').first().click(); // 💀 Breaks on CSS change
```

**With Verdex** — AI generates stable selectors:

```typescript
await page
  .getByTestId('product-card')
  .filter({ hasText: 'iPhone 15 Pro' })
  .getByRole('button', { name: 'Add to Cart' })
  .click(); // ✅ Survives any DOM restructuring
```

---

## Verdex vs Playwright MCP

| | Playwright MCP | Verdex |
|---|---|---|
| **Purpose** | General browser automation | E2E test authoring |
| **AI Guidance** | None — raw browser tools | Built-in rules teach stable patterns |
| **Selector Quality** | `.nth()`, CSS classes, deep chains | Container → Content → Role |
| **Multi-User Testing** | Manual context management | Isolated roles with pre-loaded auth |
| **Test Maintenance** | Tests break on DOM changes | Tests survive refactors |

**Playwright MCP** gives AI a browser. **Verdex** teaches AI to write tests like a senior QA engineer.

---

## Quick Start

### 1. Add MCP Server

```json
{
  "mcpServers": {
    "verdex": {
      "command": "npx",
      "args": ["@verdex/mcp@latest"]
    }
  }
}
```

### 2. Add AI Instructions

**For Cursor:**
```bash
mkdir -p .cursor/rules
cp node_modules/@verdex/mcp/.cursor/rules/*.mdc .cursor/rules/
```

**For Claude:** Use skills from `node_modules/@verdex/mcp/.claude/skills/verdex-playwright-complete/`

### 3. Write Tests

```
User: "Write a test that adds an iPhone to the cart"

AI (with Verdex):
  → Navigates to page, takes snapshot
  → Uses resolve_container to find stable test IDs
  → Uses inspect_pattern to find unique content
  → Generates container-scoped, role-based selector
  → Writes test following Playwright best practices
```

> **👉 [Try the 60-second demo](QUICKSTART.md)** — See the full workflow in action

---

## The Workflow: Explore → Select → Test

### Phase 1: Explore

Use browser tools to understand the app:

```typescript
browser_initialize()
browser_navigate("https://shop.example.com")
browser_click("e5")  // Click using ref from snapshot
browser_snapshot()   // See what changed
```

### Phase 2: Select

Build stable selectors with progressive DOM exploration:

```typescript
resolve_container("e25")    // Find containers with test IDs
inspect_pattern("e25", 2)   // Analyze sibling structure  
extract_anchors("e25", 1)   // Mine deep content if needed
```

### Phase 3: Test

Write idiomatic Playwright tests:

```typescript
test('should add product to cart', async ({ page }) => {
  await page.goto('/products');
  
  await page
    .getByTestId('product-card')
    .filter({ hasText: 'iPhone 15 Pro' })
    .getByRole('button', { name: 'Add to Cart' })
    .click();
  
  await expect(page.getByText('Item added')).toBeVisible();
});
```

---

## Tools Reference

### Browser Tools

| Tool | Purpose |
|------|---------|
| `browser_initialize` | Start browser session |
| `browser_navigate` | Navigate to URL, capture snapshot |
| `browser_snapshot` | Get accessibility tree with refs |
| `browser_click` | Click element by ref |
| `browser_type` | Type into input by ref |
| `wait_for_browser` | Wait for dynamic content |
| `browser_close` | Clean shutdown |

### DOM Exploration Tools

| Tool | Purpose |
|------|---------|
| `resolve_container` | Find container hierarchy with stable anchors |
| `inspect_pattern` | Analyze siblings at specific ancestor level |
| `extract_anchors` | Deep scan for headings, labels, unique text |

### Multi-Role Tools

| Tool | Purpose |
|------|---------|
| `select_role` | Switch between authenticated contexts |
| `list_current_roles` | View all configured roles |
| `get_current_role` | Check active auth context |

---

## Multi-Role Configuration

Test different user roles in isolated browser contexts:

```json
{
  "mcpServers": {
    "verdex": {
      "command": "npx",
      "args": [
        "@verdex/mcp@latest",
        "--role", "admin", "/path/to/admin-auth.json", "https://admin.example.com",
        "--role", "user", "/path/to/user-auth.json", "https://app.example.com"
      ]
    }
  }
}
```

Uses [Playwright's storageState format](https://playwright.dev/docs/auth) for auth files.

---

## AI Instructions

The rules and skills are **essential** — they teach AI the patterns that make selectors stable.

### What They Teach

| Guide | Purpose |
|-------|---------|
| **Workflow Discovery** | Interactive exploration, mapping user journeys |
| **Selector Writing** | Container → Content → Role pattern |
| **Playwright Patterns** | Idiomatic test structure, assertions, auth |
| **Setup Analysis** | Understanding existing test codebases |
| **Audit Reports** | Generating test health assessments |

### Installation

**Cursor Rules** (`.cursor/rules/`):
```bash
cp node_modules/@verdex/mcp/.cursor/rules/*.mdc .cursor/rules/
```

**Claude Skills** (`.claude/skills/`):
- Works automatically with Claude Code and Claude Agent SDK
- For Claude.ai: ZIP and upload via Settings > Features

---

## Resources

- **[Quick Start Demo](QUICKSTART.md)** — 60-second hands-on walkthrough
- **[Selector Writing Guide](.cursor/rules/selector-writing-guide.mdc)** — Core methodology
- **[Workflow Discovery](.cursor/rules/workflow-discovery-guide.mdc)** — App exploration
- **[Playwright Patterns](.cursor/rules/playwright-test-patterns-guide.mdc)** — Test best practices
- **[Cheat Sheet](examples/CHEAT_SHEET.md)** — Quick reference

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

**Areas we'd love help with:**
- Token efficiency benchmarks
- Additional browser actions (drag-and-drop, hover)
- Cross-origin iframe handling
- More examples and tutorials

---

## License

Apache 2.0 — see [LICENSE](LICENSE)

---

<div align="center">

**Tools + Knowledge = Tests That Don't Break**

[⭐ Star on GitHub](https://github.com/verdexhq/verdex-mcp) · [📦 npm](https://www.npmjs.com/package/@verdex/mcp) · [💬 Discussions](https://github.com/verdexhq/verdex-mcp/discussions)

</div>
