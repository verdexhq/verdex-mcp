<p align="center">
  <img src="./verdex_logo.png" alt="Verdex Logo" width="350"/>
</p>

<p align="center"><strong>AI-First Browser Automation for Building Robust Playwright Tests</strong></p>

<p align="center">
  <a href="#setup-video">📺 Playwright Setup</a> •
  <a href="#multi-role-video">🎭 Multi-Role Testing</a> •
  <a href="#selectors-video">🎯 Building Robust Selectors</a>
</p>

<div align="center">

[![npm version](https://img.shields.io/npm/v/@verdex/mcp.svg)](https://www.npmjs.com/package/@verdex/mcp)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Playwright](https://img.shields.io/badge/Playwright-Ready-45ba4b?logo=playwright)](https://playwright.dev/)
[![MCP](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-green.svg)](https://modelcontextprotocol.io)

</div>


Meet Verdex, an experimental Chrome/CDP MCP server that helps AI coding assistants (like Cursor, Claude, etc.) author stable, maintainable Playwright tests. Instead of generating brittle `nth()` selectors, Verdex provides structured DOM exploration tools that guide LLMs to create component-scoped selectors anchored to semantic identifiers.

**🎯 Problem**: AI-generated Playwright tests often rely on fragile positional selectors (`nth(8)`, deep locator chains) that break when DOM structure changes.

**✨ Solution**: Verdex exposes token-efficient DOM exploration primitives that help AI understand page structure and generate idiomatic, stable Playwright selectors.

---

## ✨ Key Features

- **🔍 Structured DOM Exploration** - Three-step workflow (`resolve_container` → `inspect_pattern` → `extract_anchors`) to understand page structure with minimal tokens (100-1K per call vs. 10K+ for raw DOM dumps)
- **👥 Multi-Role Isolation** - Test multi-user flows in isolated browser contexts with pre-loaded authentication
- **🎯 Semantic Selector Generation** - Guide LLMs to create selectors using `data-testid`, `getByRole()`, and content filters instead of brittle positions
- **🤖 AI-First Design** - Built for LLM consumption with compact, structured responses and clear tool descriptions

---

## 🚀 Quick Start

> **👉 [Try the 60-Second Demo](QUICKSTART.md)** - See Verdex in action with a realistic demo page (no test infrastructure required!)

### 1. Add to your MCP settings

Add this configuration to your MCP settings file:

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

The `npx` command will automatically download and run the latest version—no installation required!

### 2. Set up cursor rules (recommended)

Copy the included cursor rules to teach your AI assistant best practices:

```bash
mkdir -p .cursor/rules
cp node_modules/@verdex/mcp/.cursor/rules/*.mdc .cursor/rules/
```

These rules prevent fragile selectors like `.nth(8)` and teach the Container → Content → Role pattern. See [Configuration](#cursor-rules-setup-recommended) for details.

### 3. Use with your AI coding assistant

```
User: "Help me write a Playwright test that adds an iPhone to the cart"

AI: Let me explore the page structure first...
  → resolve_container(ref="e3") 
  → Finds container hierarchy
  → inspect_pattern() 
  → Sees 12 product cards
  → extract_anchors() 
  → Finds unique "iPhone 15 Pro" heading

AI generates:
  await page
    .locator('section > div')
    .filter({ hasText: "iPhone 15 Pro" })
    .getByRole("button", { name: "Add to Cart" })
    .click();
```

**vs. typical AI output without Verdex:**
```javascript
await page.getByRole('button', { name: 'Add to Cart' }).nth(8); // 😱 Fragile!
```

---

## 📦 Installation Options

### For MCP Users (Recommended)

**No installation needed!** Just add the configuration from the [Quick Start](#-quick-start) section above. The MCP client will automatically fetch and run the package via npx.

### For Testing/Verification

To test the MCP server manually (outside of an MCP client):

```bash
npx @verdex/mcp@latest
```

### Global Installation

If you prefer to install once and avoid npx overhead:

```bash
npm install -g @verdex/mcp
verdex-mcp
```

Then update your MCP config to use `verdex-mcp` instead of `npx`:

```json
{
  "mcpServers": {
    "verdex": {
      "command": "verdex-mcp"
    }
  }
}
```

### Local Development

For contributing or customization:

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
      "args": ["@verdex/mcp@latest"]
    }
  }
}
```

### Cursor Rules Setup (Recommended)

Verdex tools work best when paired with cursor rules that teach AI assistants robust selector patterns and workflow methodology. These rules are **essential for optimal results** and prevent common pitfalls like positional selectors.

**Why cursor rules matter:**
- 🎯 **Selector patterns** - Teaches the Container → Content → Role methodology
- ⚠️ **Anti-patterns** - Prevents fragile `.nth()`, `.first()`, `.last()` selectors
- 🔄 **Workflow discovery** - Guides page exploration and workflow mapping
- ✅ **Idiomatic tests** - Ensures Playwright best practices

**Included rules:**
- **`playwright-test-patterns-guide.mdc`** - Test structure, assertions, authentication patterns
- **`selector-writing-guide.mdc`** - Container → Content → Role pattern, anti-patterns to avoid
- **`workflow-discovery-guide.mdc`** - Page exploration techniques, workflow mapping

**Setup for Cursor:**

The cursor rules are included in the package. To use them:

1. **Option A: Copy to your project** (Recommended for project-specific setup)
   ```bash
   # Copy from node_modules after npx install
   mkdir -p .cursor/rules
   cp node_modules/@verdex/mcp/.cursor/rules/*.mdc .cursor/rules/
   ```

2. **Option B: Reference from package** (For global use across projects)
   ```bash
   # Add to your Cursor settings to reference the installed package rules
   # Location: node_modules/@verdex/mcp/.cursor/rules/
   ```

3. **Verify rules are loaded:**
   - Open Cursor
   - Check that rules appear in your Cursor rules list
   - Ask your AI assistant: "What cursor rules are available?"

**Setup for Claude Desktop / Other IDEs:**

For Claude Desktop or other AI assistants, reference these guides manually or set up similar rule mechanisms if available.

**⚠️ Important**: Without cursor rules, AI assistants may generate fragile selectors. These rules encode best practices from extensive Playwright testing experience.

### Multi-Role Configuration

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

> **Want to see this in action?** Check out the [60-Second Demo](QUICKSTART.md) with a realistic e-commerce page.

### The 3-Step Exploration Workflow

Verdex helps AI understand page structure through three complementary tools:

#### **Step 1: `resolve_container` - Find Stable Containers**

Discovers the containment hierarchy and identifies stable scoping containers.

```javascript
// AI calls: resolve_container(ref="e3")
// Returns:
Level 1 (div):
   Attributes: {"data-testid":"product-card"}
   Contains refs: e3, e4, e5

Level 2 (section):
   Attributes: {"class":"products-grid"}
   Contains refs: e1, e2, e3, e4...
```

**🎯 Purpose**: Find containers with `data-testid`, `id`, or semantic structure to scope selectors.

#### **Step 2: `inspect_pattern` - Understand Patterns**

Analyzes sibling elements to detect repeating patterns and uniqueness.

```javascript
// AI calls: inspect_pattern(ref="e3", ancestorLevel=1)
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

#### **Step 3: `extract_anchors` - Explore Internal Structure**

Explores the internal DOM tree to find semantic identifiers.

```javascript
// AI calls: extract_anchors(ref="e3", ancestorLevel=1)
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

**Verdict**: Verdex uses ~10-50x fewer tokens than DOM dumps while providing richer structural context than an a11y tree only view.

---

## 🛠️ Available Tools

### Core Browser Tools

| Tool | Description |
|------|-------------|
| `browser_initialize` | Start browser session |
| `browser_navigate` | Navigate to URL and capture page snapshot |
| `browser_snapshot` | Get current page's accessibility tree (with iframe expansion) |
| `browser_click` | Click element by reference (e.g., `e1`, `e2`, `f1_e3` for iframe elements) |
| `browser_type` | Type text into input field |
| `wait_for_browser` | Pause for page loads/animations |
| `browser_close` | Clean shutdown |

### DOM Exploration Tools (Use in Order)

| Tool | Purpose |
|------|---------|
| `resolve_container` | Find containment hierarchy and stable containers |
| `inspect_pattern` | Analyze sibling patterns at specific level |
| `extract_anchors` | Explore internal structure within container |

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
await resolve_container(ref="e3");
// → Finds [data-testid="product-card"] at Level 1

// 4. Check siblings
await inspect_pattern(ref="e3", ancestorLevel=1);
// → Multiple product cards, differentiated by product name

// 5. Explore internal structure
await extract_anchors(ref="e3", ancestorLevel=1);
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

### Example 3: Interacting with Iframe Content

```javascript
// Navigate to page with iframe
await browser_navigate("https://example.com/checkout");

// Snapshot shows both main frame and iframe content
// Main frame elements: [ref=e1], [ref=e2], etc.
// Iframe elements: [ref=f1_e1], [ref=f1_e2], etc.

// Click button inside iframe (note frame-qualified ref)
await browser_click("f1_e5");

// Generate selector for iframe element
page
  .frameLocator('iframe[title="Payment Form"]')
  .getByRole("button", { name: "Pay Now" })
  .click();
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
│   └── CDP Session + Isolated World + Multi-Frame Support
│
├── Incognito Context (role: "admin")
│   ├── Page 1 (admin.example.com)
│   ├── Auth: admin-auth.json
│   └── CDP Session + Isolated World + Multi-Frame Support
│
└── Incognito Context (role: "user")
    ├── Page 1 (app.example.com)
    ├── Auth: user-auth.json
    └── CDP Session + Isolated World + Multi-Frame Support
```

**Benefits:**
- ✅ Complete session isolation (cookies, localStorage, cache)
- ✅ Parallel multi-user scenarios in one test session
- ✅ No manual context management
- ✅ Iframe content automatically expanded in snapshots with frame-qualified refs

---

## ⚠️ Current Limitations

- **Limited actions**: Fewer interaction primitives than Playwright MCP (no drag-and-drop, hover, etc.)
- **Programmatic typing**: Sets input values directly, not full keypress simulation
- **Large pages**: Very complex DOMs may need throttling/timeouts

---

## 🤝 Contributing

We welcome contributions! See our [Contributing Guide](CONTRIBUTING.md) for detailed instructions.

### Quick Start for Contributors

```bash
# 1. Fork and clone
git clone https://github.com/YOUR_USERNAME/verdex-mcp.git
cd verdex-mcp

# 2. Install and build
npm install
npx playwright install chromium
npm run build

# 3. Run tests
npm test
```

### Reporting Issues

Found a bug or have a feature request? [Open an issue](https://github.com/verdexhq/verdex-mcp/issues)

### Areas We'd Love Help With

- **Token efficiency benchmarks**: Measure actual token usage vs. alternatives
- **Extra probes**: Computed visibility, ARIA relationships, layout metrics
- **Cross-origin iframe handling**: Improved strategies for working with payment widgets (Stripe, PayPal)
- **More browser actions**: Drag-and-drop, hover states, keyboard navigation
- **Documentation**: More examples, video tutorials

For full guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md)

---

## 📚 Resources

### Getting Started
- **[60-Second Quick Start](QUICKSTART.md)** - Hands-on demo with realistic examples
- **[Cheat Sheet](examples/CHEAT_SHEET.md)** - Quick reference for tools and patterns
- **[Example Tests](demo/demo-quickstart.spec.ts)** - Working Playwright test examples
- **[Demo Page](demo/worst-case/demo-page.html)** - Realistic e-commerce page for testing

### Cursor Rules (Essential)
- **[Playwright Test Patterns](.cursor/rules/playwright-test-patterns-guide.mdc)** - Idiomatic test structure, assertions, authentication
- **[Selector Writing Guide](.cursor/rules/selector-writing-guide.mdc)** - Container → Content → Role pattern, avoiding anti-patterns
- **[Workflow Discovery Guide](.cursor/rules/workflow-discovery-guide.mdc)** - Page exploration and workflow mapping techniques

### Links
- **GitHub**: https://github.com/verdexhq/verdex-mcp
- **npm Package**: https://www.npmjs.com/package/@verdex/mcp
- **Issues**: https://github.com/verdexhq/verdex-mcp/issues
- **Discussions**: https://github.com/verdexhq/verdex-mcp/discussions

### Related Resources
- **MCP Documentation**: https://modelcontextprotocol.io
- **Playwright Best Practices**: https://playwright.dev/docs/best-practices
- **Playwright Authentication Guide**: https://playwright.dev/docs/auth

---

## 🙏 Acknowledgments

Huge respect to the [Playwright](https://github.com/microsoft/playwright) team and the [Model Context Protocol](https://modelcontextprotocol.io) creators. Verdex explores ideas inspired by their badass work. 🚀

---

## 📄 License

Apache 2.0 - see [LICENSE](LICENSE) for details.

---

## 💬 Feedback Welcome

This is an experimental project. If you're building AI-assisted testing workflows, we'd love to hear:

- Do you care about token efficiency? What benchmarks matter to you?
- What other DOM exploration or other primitives would be useful?
- What multi-role testing patterns do you need?

**[Share your thoughts in Discussions →](https://github.com/verdexhq/verdex-mcp/discussions)**

---

<div align="center">

**Built with ❤️ for the AI coding assistant era**

[⭐ Star on GitHub](https://github.com/verdexhq/verdex-mcp) | [📦 Install from npm](https://www.npmjs.com/package/@verdex/mcp)

</div>