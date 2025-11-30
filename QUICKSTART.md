# 🚀 60-Second Verdex Quick Start

This guide shows you the value of Verdex in under one minute using a realistic demo page **without any test infrastructure**.

No `data-testid` attributes. No special classes. Just raw HTML structure.

**This is where Verdex shines.** ✨

---

## Prerequisites

- Verdex MCP server installed and running (see [README](README.md#-quick-start))
- AI coding assistant with MCP support (Cursor, Claude, etc.)
- The demo page loaded in your workspace

---

## 🎯 The Core Problem

You have a page with 12 "Add to Cart" buttons. You need to click the one for "iPhone 15 Pro".

**Without Verdex**, AI generates:
```javascript
// ❌ Fragile positional selector
page.getByRole('button', { name: 'Add to Cart' }).nth(2)
```

This breaks when:
- Product order changes
- New products are added
- Client-side hydration reorders elements

**With Verdex**, AI generates:
```javascript
// ✅ Stable, semantic selector
page.locator('section > div')
    .filter({ hasText: 'iPhone 15 Pro' })
    .getByRole('button', { name: 'Add to Cart' })
```

This survives reordering, refactoring, and DOM changes.

---

## 📋 The 60-Second Workflow

### Step 1: Open the Demo Page

The demo page is located at: `demo/worst-case/demo-page.html`

### Step 2: Start Verdex MCP

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

### Step 3: Navigate to the Demo

**Copy-paste this prompt to your AI assistant:**

```
Navigate to file:/verdex-mcp/demo/worst-case/demo-page.html
```

> 💡 **Note**: Update the path above to match your actual workspace location

### Step 4: The Challenge

**Copy-paste this prompt:**

```
Help me write a Playwright selector to click the "Add to Cart" button 
for the iPhone 15 Pro product. Use Verdex MCP tools to explore the page structure and generate a stable, container-scoped selector.
```

### Step 5: Watch the Magic ✨

You'll see the AI:

1. **Call `browser_snapshot`** → Gets accessibility tree with refs
2. **Call `resolve_container(ref)`** → Discovers container hierarchy
3. **Call `inspect_pattern(ref, level)`** → Finds 12 product cards
4. **Call `extract_anchors(ref, level)`** → Extracts "iPhone 15 Pro" heading

Then generates:

```javascript
await page.locator('section > div')
    .filter({ hasText: 'iPhone 15 Pro' })
    .getByRole('button', { name: 'Add to Cart' })
    .click();
```

---

## 🎓 Understanding What Happened

### The 3-Step Exploration Process

#### **Step 1: `resolve_container` - Find Containers**

Discovers the containment hierarchy:

```
Level 1 (div): Contains product card content
Level 2 (div): Contains all 12 product cards (the grid)
Level 3 (section): Main products section
```

**Key insight**: "This button lives inside a card, inside a grid"

#### **Step 2: `inspect_pattern` - Understand Patterns**

At the grid level (Level 2), discovers:

```
Sibling 0: Contains "iPhone 15 Pro", "$999", "Add to Cart"
Sibling 1: Contains "MacBook Pro", "$1,999", "Add to Cart"
Sibling 2: Contains "Samsung S24", "$1,199", "Add to Cart"
... 9 more siblings
```

**Key insight**: "Multiple similar cards need content-based filtering"

#### **Step 3: `extract_anchors` - Mine Unique Anchors**

Inside the target card, finds:

```
- h3: "iPhone 15 Pro" (unique identifier!)
- span: "$999"
- button: "Add to Cart"
```

**Key insight**: "Use the heading text to identify this specific card"

### The Result

```javascript
page.locator('section > div')     // Scope to product card
    .filter({ hasText: 'iPhone 15 Pro' })  // Filter by unique content
    .getByRole('button', { name: 'Add to Cart' })  // Semantic targeting
```

**This selector:**
- ✅ Survives DOM reordering
- ✅ Survives adding/removing products
- ✅ Self-documents intent ("iPhone 15 Pro's button")
- ✅ Works without any test infrastructure

---

## 🎯 Try More Scenarios

### Scenario 2: Out-of-Stock Products

**Prompt:**
```
Write a selector to find the first product that is NOT out of stock 
and click its "Add to Cart" button.
```

**Challenge**: The Logitech keyboard is out of stock. How does the AI filter it out?

### Scenario 3: Comparison Table

**Prompt:**
```
Write a selector to click the "Select" button for the Samsung S24 Ultra 
in the phone comparison table.
```

**Challenge**: Multiple tables, multiple buttons. How does the AI scope correctly?

### Scenario 4: Order History

**Prompt:**
```
Write a selector to click "Track Order" for order #ORD-2024-1198
```

**Challenge**: Multiple orders with similar structure. Content-based filtering required.

### Scenario 5: Shopping Cart

**Prompt:**
```
Write a selector to increase the quantity of AirPods Pro in the 
shopping cart drawer.
```

**Challenge**: Cart drawer is a fixed overlay with multiple quantity controls.

---

## 📊 Before & After Comparison

### ❌ Without Verdex (Accessibility Tree Only)

**What AI sees:**
```
button "Add to Cart"
button "Add to Cart"
button "Add to Cart"
button "Add to Cart"
... (identical buttons, no structure)
```

**What AI generates:**
```javascript
page.getByRole('button', { name: 'Add to Cart' }).nth(2)
```

**Problems:**
- Breaks on reordering
- Breaks on hydration changes
- Impossible to debug when it fails
- No clear intent

### ✅ With Verdex (Structure + Content)

**What AI discovers:**
```
Hierarchy: button → card → grid → section
Siblings: 12 similar cards at grid level
Unique anchor: "iPhone 15 Pro" heading in target card
```

**What AI generates:**
```javascript
page.locator('section > div')
    .filter({ hasText: 'iPhone 15 Pro' })
    .getByRole('button', { name: 'Add to Cart' })
```

**Benefits:**
- Survives reordering
- Survives structural changes
- Self-documenting intent
- Container-scoped (not page-global)

---

## 💡 Key Takeaways

### 1. **No Test Infrastructure Required**
The demo page has zero `data-testid` attributes. Verdex works with pure HTML structure.

### 2. **Progressive Enhancement**
Add test IDs later, and selectors get even better. But they work today with what you have.

### 3. **Structure > Position**
Container-scoped selectors with content filters beat positional selectors every time.

### 4. **LLM-First Design**
Tools return raw structural facts. The LLM composes them based on your specific query and context.

### 5. **Token Efficient Iteration**
Cheap tools (~1-2k tokens) enable rapid exploration and better results.

---

## 🚀 Next Steps

### Run the Example Tests

See the full working Playwright tests generated with Verdex:

```bash
# Install Playwright if you haven't already
npm install -D @playwright/test

# Run the demo tests
npm run test:demo
```

Check out [`demo/demo-quickstart.spec.ts`](demo/demo-quickstart.spec.ts) to see 10+ examples of stable selectors generated using Verdex exploration.

### Try It on Your Own Application

1. Point Verdex at your dev environment
2. Pick a tricky selector you've struggled with
3. Ask AI to explore the structure with Verdex tools
4. Compare the generated selector to what you would have written manually

### Add Strategic Test IDs (Optional)

After seeing how Verdex works with pure structure, try adding a few strategic `data-testid` attributes to critical containers. Watch how selectors become even more stable.

### Explore Multi-Role Testing

If your app has multiple user types (admin/user/customer), check out the [Multi-Role Configuration](README.md#multi-role-configuration) section to test complex flows with isolated browser contexts.

---

## 🤔 Common Questions

### **Q: What if my page has data-testids?**
**A:** Even better! Verdex will find them via `resolve_container` and generate cleaner selectors like:
```javascript
page.getByTestId('product-card')
    .filter({ hasText: 'iPhone 15 Pro' })
    .getByRole('button', { name: 'Add to Cart' })
```

### **Q: Does this replace Playwright?**
**A:** No. Verdex is complementary. Playwright is a mature, cross-browser test runner. Verdex is a Chrome-only authoring assistant focused on selector generation. Use both!

### **Q: What if my DOM is really complex?**
**A:** That's exactly when Verdex shines. Complex DOMs with deep nesting are where structural exploration tools provide the most value.

### **Q: Can I use this with non-AI workflows?**
**A:** Yes, but it's optimized for LLM consumption. The raw JSON responses are designed for programmatic use, not manual inspection.

---

## 📚 Learn More

- **[Cheat Sheet](examples/CHEAT_SHEET.md)** - Quick reference for tools and selector patterns
- **[Full Documentation](README.md)** - Architecture, installation, advanced usage
- **[Example Tests](demo/demo-quickstart.spec.ts)** - 10+ working Playwright test examples
- **[GitHub Issues](https://github.com/verdexhq/verdex-mcp/issues)** - Report bugs or request features
- **[Discussions](https://github.com/verdexhq/verdex-mcp/discussions)** - Share workflows and ask questions

---

<div align="center">

**Built with ❤️ for the AI coding assistant era**

[⭐ Star on GitHub](https://github.com/verdexhq/verdex-mcp) | [📦 Install from npm](https://www.npmjs.com/package/@verdex/mcp)

</div>

