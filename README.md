<p align="center">
  <img src="./.github/assets/verdex_logo.png" alt="Verdex Logo" width="350"/>
</p>

<p align="center"><strong>AI-First Browser Automation for Authoring Robust Playwright Tests</strong></p>

<div align="center">

[![npm version](https://img.shields.io/npm/v/@verdex/mcp.svg)](https://www.npmjs.com/package/@verdex/mcp)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Playwright](https://img.shields.io/badge/Playwright-Ready-45ba4b?logo=playwright)](https://playwright.dev/)
[![MCP](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-green.svg)](https://modelcontextprotocol.io)

</div>


Meet Verdex, an experimental MCP server that helps AI coding assistants (like Cursor, Claude, etc.) author stable, maintainable Playwright tests. Instead of generating brittle `nth()` selectors, Verdex provides structured DOM exploration tools that guide LLMs to create component-scoped selectors anchored to semantic identifiers.

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

### 2. Configure your AI assistant (recommended)

Choose the configuration approach for your AI assistant:

**For Cursor IDE:**
```bash
mkdir -p .cursor/rules
cp node_modules/@verdex/mcp/.cursor/rules/*.mdc .cursor/rules/
```

**For Claude (All Platforms):**

The Skill is located at: `node_modules/@verdex/mcp/.claude/skills/verdex-playwright-complete/`

This universal directory structure works across **all Claude implementations**:
- ✅ **Claude Code** - Auto-discovers skills in `.claude/skills/`
- ✅ **Claude Agent SDK** - Reads from `.claude/skills/` (required location)
- ✅ **Claude.ai** - ZIP and upload the skill directory via Settings > Features
- ✅ **Claude API** - Upload skill contents via Skills API

These configurations prevent fragile selectors like `.nth(8)` and teach the Container → Content → Role pattern. See [AI Assistant Configuration](#ai-assistant-configuration-recommended) for details.

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

### AI Assistant Configuration (Recommended)

Verdex tools work best when paired with configuration that teaches AI assistants robust selector patterns and workflow methodology. This configuration is **essential for optimal results** and prevents common pitfalls like positional selectors.

**Why AI configuration matters:**
- 🎯 **Selector patterns** - Teaches the Container → Content → Role methodology
- ⚠️ **Anti-patterns** - Prevents fragile `.nth()`, `.first()`, `.last()` selectors
- 🔄 **Workflow discovery** - Guides page exploration and workflow mapping
- ✅ **Idiomatic tests** - Ensures Playwright best practices

Verdex provides **two configuration approaches** depending on your AI assistant:

---

#### For Cursor IDE Users

**Cursor Rules** (`.cursor/rules/` directory)

Verdex includes three specialized cursor rules that integrate directly with Cursor IDE:

- **`playwright-test-patterns-guide.mdc`** - Test structure, assertions, authentication patterns
- **`selector-writing-guide.mdc`** - Container → Content → Role pattern, anti-patterns to avoid
- **`workflow-discovery-guide.mdc`** - Page exploration techniques, workflow mapping

**Setup:**

1. **Copy rules to your project** (Recommended for project-specific setup)
   ```bash
   # After installing with npx, copy from node_modules
   mkdir -p .cursor/rules
   cp node_modules/@verdex/mcp/.cursor/rules/*.mdc .cursor/rules/
   ```

2. **Verify rules are loaded:**
   - Open Cursor
   - Check that rules appear in your Cursor rules list
   - Ask your AI assistant: "What cursor rules are available?"

**How it works:** Cursor automatically loads `.mdc` files from `.cursor/rules/` and makes them available to the AI assistant during conversations.

---

#### For Claude Desktop / Other AI Assistants

**Claude Skill** (`SKILL.md`)

Verdex includes a comprehensive skill file designed for Claude Desktop and similar AI assistants that support skill-based configuration:

- **`SKILL.md`** - Complete workflow combining all three phases (Explore → Select → Test)

The skill references detailed guides in the `.claude/skills/verdex-playwright-complete/guides/` directory:
- `workflow-discovery.md` - Interactive exploration and journey mapping
- `selector-writing.md` - Building stable selectors
- `playwright-patterns.md` - Writing idiomatic tests

**Universal Directory Structure:**

```
node_modules/@verdex/mcp/.claude/skills/verdex-playwright-complete/
├── SKILL.md
└── guides/
    ├── workflow-discovery.md
    ├── selector-writing.md
    └── playwright-patterns.md
```

**Works Across ALL Claude Platforms (No Setup Required!):**

| Platform | How It Works | Setup |
|----------|-------------|--------|
| **Claude Code** | Auto-discovers `.claude/skills/` | ✅ None - works automatically |
| **Claude Agent SDK** | Reads from `.claude/skills/` (required) | ✅ None - already in correct location |
| **Claude.ai** | Upload as ZIP | ZIP the skill directory, upload via Settings > Features |
| **Claude API** | Upload via API | Use Skills API with contents from `.claude/skills/verdex-playwright-complete/` |

**How it works:** 
- Claude loads the skill file at the start of conversations
- Provides context about Verdex workflows and best practices
- Uses progressive disclosure—references detailed guides only when needed
- The `.claude/skills/` location satisfies ALL platforms' requirements

**Why this structure?**
- ✅ **Universal** - Works for all Claude platforms without modification
- ✅ **No installation scripts** - Already in the correct location
- ✅ **Standards-compliant** - Follows Claude Agent SDK directory requirements
- ✅ **Progressive disclosure** - Main SKILL.md references detailed guides as needed

---

#### For Other AI Assistants

If your AI assistant doesn't support cursor rules or Claude skills:

1. **Reference the guides directory:**
   - Share relevant guides from `node_modules/@verdex/mcp/.claude/skills/verdex-playwright-complete/guides/` with your AI assistant
   - Guides are written in clear, standalone markdown format

2. **Manual context sharing:**
   - Share the appropriate guide based on your task:
     - Starting exploration? → `workflow-discovery.md`
     - Building selectors? → `selector-writing.md`
     - Writing tests? → `playwright-patterns.md`

---

**⚠️ Important**: Without proper AI assistant configuration, assistants may generate fragile selectors that break when DOM structure changes. These configuration files encode best practices from extensive Playwright testing experience.

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

### AI Assistant Configuration (Essential)

**For Cursor IDE:**
- **[Playwright Test Patterns](.cursor/rules/playwright-test-patterns-guide.mdc)** - Idiomatic test structure, assertions, authentication
- **[Selector Writing Guide](.cursor/rules/selector-writing-guide.mdc)** - Container → Content → Role pattern, avoiding anti-patterns
- **[Workflow Discovery Guide](.cursor/rules/workflow-discovery-guide.mdc)** - Page exploration and workflow mapping techniques

**For Claude Desktop:**
- **[Claude Skill](SKILL.md)** - Complete Playwright workflow (Explore → Select → Test)

**Detailed Guides (Referenced by both):**
- **[Workflow Discovery Guide](.claude/skills/verdex-playwright-complete/guides/workflow-discovery.md)** - Interactive exploration and journey mapping
- **[Selector Writing Guide](.claude/skills/verdex-playwright-complete/guides/selector-writing.md)** - Building stable, maintainable selectors
- **[Playwright Patterns Guide](.claude/skills/verdex-playwright-complete/guides/playwright-patterns.md)** - Writing production-ready tests

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