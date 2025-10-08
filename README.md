# Verdex MCP

> **AI-First Browser Automation for Building Robust Playwright Tests**

[![npm version](https://img.shields.io/npm/v/@verdex/mcp.svg)](https://www.npmjs.com/package/@verdex/mcp)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-green.svg)](https://modelcontextprotocol.io)

Verdex is an experimental Chrome/CDP MCP server that helps AI coding assistants (like Cursor, Claude, etc.) author stable, maintainable Playwright tests. Instead of generating brittle `nth()` selectors, Verdex provides structured DOM exploration tools that guide LLMs to create component-scoped selectors anchored to semantic identifiers.

**🎯 Problem**: AI-generated Playwright tests often rely on fragile positional selectors (`nth(8)`, deep locator chains) that break when DOM structure changes.

**✨ Solution**: Verdex exposes token-efficient DOM exploration primitives that help AI understand page structure and generate idiomatic, stable Playwright selectors.

---

## ✨ Key Features

- **🔍 Structured DOM Exploration** - Three-step workflow (`get_ancestors` → `get_siblings` → `get_descendants`) to understand page structure with minimal tokens (100-1K per call vs. 10K+ for raw DOM dumps)
- **👥 Multi-Role Isolation** - Test multi-user flows in isolated browser contexts with pre-loaded authentication
- **🎯 Semantic Selector Generation** - Guide LLMs to create selectors using `data-testid`, `getByRole()`, and content filters instead of brittle positions
- **🤖 AI-First Design** - Built for LLM consumption with compact, structured responses and clear tool descriptions
- **🔒 CDP-Powered Isolation** - Each role runs in isolated JavaScript execution contexts, preventing interference with app code

---

## 🚀 Quick Start

### 1. Install via npx (no installation required)

```bash
npx @verdex/mcp
```

### 2. Add to your MCP settings

```json
{
  "mcpServers": {
    "verdex": {
      "command": "npx",
      "args": ["@verdex/mcp"]
    }
  }
}
```

### 3. Use with your AI coding assistant

```
User: "Help me write a Playwright test that adds an iPhone to the cart"

AI: Let me explore the page structure first...
  → get_ancestors(ref="e3") 
  → Finds [data-testid="product-card"] container
  → get_siblings() 
  → Sees 12 product cards
  → get_descendants() 
  → Finds unique "iPhone 15 Pro" heading

AI generates:
  await page
    .getByTestId("product-card")
    .filter({ hasText: "iPhone 15 Pro" })
    .getByRole("button", { name: "Add to Cart" })
    .click();
```

**vs. typical AI output without Verdex:**
```javascript
await page.getByRole('button', { name: 'Add to Cart' }).nth(8); // 😱 Fragile!
```

---

## 📦 Installation

### Option 1: npx (Recommended)

Run directly without installation:

```bash
npx @verdex/mcp
```

### Option 2: Global Installation

```bash
npm install -g @verdex/mcp
verdex-mcp
```

### Option 3: Local Development

```bash
git clone https://github.com/verdexhq/verdex-mcp.git
cd verdex-mcp
npm install
npm run build
node dist/index.js
```

---

## ⚙️ Configuration

### Basic MCP Configuration

Add to your MCP settings file (e.g., `~/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json` for Cline):

```json
{
  "mcpServers": {
    "verdex": {
      "command": "npx",
      "args": ["@verdex/mcp"]
    }
  }
}
```

### Multi-Role Configuration

Test different user roles in isolated browser contexts:

```json
{
  "mcpServers": {
    "verdex": {
      "command": "npx",
      "args": [
        "@verdex/mcp",
        "--role", "admin", "/path/to/admin-auth.json", "https://admin.example.com",
        "--role", "user", "/path/to/user-auth.json", "https://app.example.com"
      ]
    }
  }
}
```

#### Authentication File Format

Verdex leverages [Playwright's authentication approach](https://playwright.dev/docs/auth) using `storageState` files. These files contain cookies, localStorage, and session data.

Create auth files using Playwright's `storageState` format:

```json
{
  "cookies": [
    {
      "name": "session",
      "value": "abc123...",
      "domain": ".example.com",
      "path": "/",
      "httpOnly": true,
      "secure": true
    }
  ],
  "origins": [
    {
      "origin": "https://app.example.com",
      "localStorage": [
        { "name": "token", "value": "xyz789..." }
      ]
    }
  ]
}
```

**How to generate auth files:**

1. **Manual authentication** - Use Playwright's test setup:
   ```javascript
   // auth.setup.ts
   import { test as setup } from '@playwright/test';
   
   setup('authenticate', async ({ page }) => {
     await page.goto('https://example.com/login');
     await page.getByLabel('Email').fill('user@example.com');
     await page.getByLabel('Password').fill('password');
     await page.getByRole('button', { name: 'Sign in' }).click();
     await page.waitForURL('https://example.com/dashboard');
     
     // Save authentication state
     await page.context().storageState({ 
       path: 'playwright/.auth/user.json' 
     });
   });
   ```

2. **Use saved state with Verdex** - Reference the file in your MCP config

See the [Playwright Authentication Guide](https://playwright.dev/docs/auth) for more details on creating and managing auth files.

---

## 🎯 How It Works

### The 3-Step Exploration Workflow

Verdex helps AI understand page structure through three complementary tools:

#### **Step 1: `get_ancestors` - Find Stable Containers**

Discovers the containment hierarchy and identifies stable scoping containers.

```javascript
// AI calls: get_ancestors(ref="e3")
// Returns:
Level 1 (div):
   Attributes: {"data-testid":"product-card"}
   Contains refs: e3, e4, e5

Level 2 (section):
   Attributes: {"class":"products-grid"}
   Contains refs: e1, e2, e3, e4...
```

**🎯 Purpose**: Find containers with `data-testid`, `id`, or semantic structure to scope selectors.

#### **Step 2: `get_siblings` - Understand Patterns**

Analyzes sibling elements to detect repeating patterns and uniqueness.

```javascript
// AI calls: get_siblings(ref="e3", ancestorLevel=1)
// Returns:
Sibling 1 (div):
   Contains text: "iPhone 15 Pro", "$999"
   Contains refs: e3

Sibling 2 (div):
   Contains text: "Samsung S24", "$899"
   Contains refs: e6

// AI learns: Multiple product cards with unique product names
```

**🎯 Purpose**: Understand how to differentiate between similar elements using content.

#### **Step 3: `get_descendants` - Explore Internal Structure**

Explores the internal DOM tree to find semantic identifiers.

```javascript
// AI calls: get_descendants(ref="e3", ancestorLevel=1)
// Returns:
Child 1 (h3):
   Direct Text: "iPhone 15 Pro"
   
Child 2 (button) [ref=e3]:
   Role: button
   Name: "Add to Cart"
```

**🎯 Purpose**: Discover text content, buttons, and ARIA roles for semantic targeting.

### Token Efficiency

| Approach | Tokens per Page | Coverage |
|----------|----------------|----------|
| Raw DOM dump | 10,000-50,000 | Complete but overwhelming |
| A11y tree only | 1,000-3,000 | Limited to interactive elements |
| **Verdex exploration** | **100-1,000 per call** | **Surgical, on-demand** |

**Verdict**: Verdex uses ~10-50x fewer tokens while providing richer structural context.

---

## 🛠️ Available Tools

### Core Browser Tools

| Tool | Description |
|------|-------------|
| `browser_initialize` | Start browser session |
| `browser_navigate` | Navigate to URL and capture page snapshot |
| `browser_snapshot` | Get current page's accessibility tree |
| `browser_click` | Click element by reference (e.g., `e1`, `e2`) |
| `browser_type` | Type text into input field |
| `browser_inspect` | Get detailed element attributes and bounds |
| `wait_for_browser` | Pause for page loads/animations |
| `browser_close` | Clean shutdown |

### DOM Exploration Tools (Use in Order)

| Tool | Purpose |
|------|---------|
| `get_ancestors` | Find containment hierarchy and stable containers |
| `get_siblings` | Analyze sibling patterns at specific level |
| `get_descendants` | Explore internal structure within container |

### Multi-Role Tools

| Tool | Description |
|------|-------------|
| `get_current_role` | Check active authentication context |
| `list_current_roles` | View all configured roles |
| `select_role` | Switch between authenticated sessions |

---

## 📖 Usage Examples

### Example 1: Adding a Product to Cart

```javascript
// 1. Navigate and explore
await browser_navigate("https://shop.example.com");

// 2. Find "Add to Cart" button for iPhone
// Snapshot shows [ref=e3] button

// 3. Understand structure
await get_ancestors(ref="e3");
// → Finds [data-testid="product-card"] at Level 1

// 4. Check siblings
await get_siblings(ref="e3", ancestorLevel=1);
// → Multiple product cards, differentiated by product name

// 5. Explore internal structure
await get_descendants(ref="e3", ancestorLevel=1);
// → h3 contains "iPhone 15 Pro", button has "Add to Cart"

// 6. Generate selector
page.getByTestId("product-card")
    .filter({ hasText: "iPhone 15 Pro" })
    .getByRole("button", { name: "Add to Cart" })
```

### Example 2: Multi-Role E2E Test

```javascript
// Admin creates promotion
await select_role("admin");
await browser_navigate("https://admin.example.com/promos");
// ... create promo code "SAVE20"

// User sees and uses promotion
await select_role("user");
await browser_navigate("https://shop.example.com");
// ... apply promo code "SAVE20"
// ... verify discount applied
```

---

## 🏗️ Technical Architecture

### CDP-Powered Isolated Worlds

- **Puppeteer + CDP**: Chrome DevTools Protocol for low-level browser control
- **Isolated JavaScript Contexts**: Each role runs in separate execution contexts
- **No DOM Pollution**: Bridge code doesn't interfere with application JavaScript
- **Persistent Analysis**: DOM refs remain stable across actions

### Multi-Role Browser Isolation

```
Browser Instance
├── Default Context (role: "default")
│   ├── Page 1 (about:blank)
│   └── CDP Session + Isolated World
│
├── Incognito Context (role: "admin")
│   ├── Page 1 (admin.example.com)
│   ├── Auth: admin-auth.json
│   └── CDP Session + Isolated World
│
└── Incognito Context (role: "user")
    ├── Page 1 (app.example.com)
    ├── Auth: user-auth.json
    └── CDP Session + Isolated World
```

**Benefits:**
- ✅ Complete session isolation (cookies, localStorage, cache)
- ✅ Parallel multi-user scenarios in one test session
- ✅ No manual context management

---

## 📊 Comparison with Playwright MCP

| Feature | Playwright MCP | Verdex MCP |
|---------|---------------|------------|
| **Selector Strategy** | Inspector/codegen + a11y tree | AI-guided structural exploration |
| **Multi-User Testing** | Manual context management | Built-in role isolation |
| **DOM Surface** | A11y-only abstraction | Reconcilable DOM refs for exploration |
| **Debug Loop** | Frequent GUI context switches | Stay in IDE with low-token probes |
| **Browser Support** | Chrome, Firefox, Safari | Chrome-only (CDP) |
| **Scope** | Full test runner + authoring | Authoring assistant only |
| **Maturity** | Production-ready, battle-tested | Experimental, niche use cases |

**When to use Verdex:**
- ✅ You're using AI assistants to write Playwright tests
- ✅ You need multi-role testing with pre-loaded auth
- ✅ You want semantic, component-scoped selectors
- ✅ Chrome-only is acceptable

**When to use Playwright MCP:**
- ✅ You need cross-browser support
- ✅ You want a complete test runner
- ✅ You prefer GUI-based debugging
- ✅ You need production-ready stability

**Verdict**: Playwright MCP is broad, stable, and battle-tested. Verdex explores a narrow, agent-first niche that may help AI-driven authoring workflows.

---

## ⚠️ Current Limitations

- **Chrome-only**: Uses Puppeteer/CDP (no Firefox/Safari)
- **Not a test runner**: Assists authoring; you still run tests in Playwright
- **Limited actions**: Fewer interaction primitives than Playwright MCP
- **Programmatic typing**: Sets input values directly, not full keypress simulation
- **No iframe support**: Currently doesn't handle cross-frame interactions
- **Large pages**: Very complex DOMs may need throttling/timeouts

---

## 🤝 Contributing

We welcome contributions! Here's how to help:

### Reporting Issues

Found a bug or have a feature request? [Open an issue](https://github.com/verdexhq/verdex-mcp/issues)

### Development Setup

```bash
# Clone repo
git clone https://github.com/verdexhq/verdex-mcp.git
cd verdex-mcp

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Start in dev mode
npm run dev
```

### Areas We'd Love Help With

- **Token efficiency benchmarks**: Measure actual token usage vs. alternatives
- **Extra probes**: Computed visibility, ARIA relationships, layout metrics
- **iframe support**: Cross-frame DOM exploration
- **More browser actions**: Drag-and-drop, hover states, keyboard navigation
- **Documentation**: More examples, video tutorials

---

## 📚 Resources

- **GitHub**: https://github.com/verdexhq/verdex-mcp
- **npm Package**: https://www.npmjs.com/package/@verdex/mcp
- **Issues**: https://github.com/verdexhq/verdex-mcp/issues
- **MCP Documentation**: https://modelcontextprotocol.io
- **Playwright Best Practices**: https://playwright.dev/docs/best-practices

---

## 🙏 Acknowledgments

Huge respect to the [Playwright MCP](https://github.com/microsoft/playwright) team and the [Model Context Protocol](https://modelcontextprotocol.io) creators. Verdex explores adjacent ideas inspired by their excellent work. 🚀

---

## 📄 License

Apache 2.0 - see [LICENSE](LICENSE) for details.

---

## 💬 Feedback Welcome

This is an experimental project. If you're building AI-assisted testing workflows, we'd love to hear:

- Do you care about token efficiency? What benchmarks matter to you?
- What other DOM exploration tools would be useful?
- What multi-role testing patterns do you need?

**[Share your thoughts in Discussions →](https://github.com/verdexhq/verdex-mcp/discussions)**

---

<div align="center">

**Built with ❤️ for the AI coding assistant era**

[⭐ Star on GitHub](https://github.com/verdexhq/verdex-mcp) | [📦 Install from npm](https://www.npmjs.com/package/@verdex/mcp)

</div>