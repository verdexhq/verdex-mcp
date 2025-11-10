# Verdex MCP Examples

This directory contains resources to help you get started with Verdex MCP.

---

## 📋 Quick Reference

### [Cheat Sheet](CHEAT_SHEET.md)
Quick reference guide covering:
- The 3-step exploration workflow
- Tool reference with examples
- Selector construction patterns
- Common scenarios and troubleshooting

**Use this when**: You need a quick reminder of tool syntax or selector patterns.

---

## 🚀 Getting Started

### 1. Read the Quick Start
Start with the [60-Second Quick Start](../QUICKSTART.md) guide that walks you through a complete example using the demo page.

### 2. Explore the Demo Page
The demo page ([`tests/demo-page.html`](../demo/worst-case/demo-page.html)) is a realistic e-commerce site with:
- 12 product cards (demonstrates content filtering)
- Comparison table (demonstrates table navigation)
- Order history (demonstrates list filtering)
- Shopping cart drawer (demonstrates nested component targeting)
- Out-of-stock states (demonstrates state-based filtering)

**Important**: The demo page has **zero test infrastructure** (no `data-testid` attributes) to demonstrate how Verdex works with pure HTML structure.

### 3. Run the Example Tests
The example test suite ([`tests/demo-quickstart.spec.ts`](../demo/demo-quickstart.spec.ts)) contains 10+ working Playwright tests demonstrating:
- Product selection with content filtering
- State-based filtering (in-stock vs out-of-stock)
- Table navigation
- Order history interactions
- Shopping cart operations
- Nested component targeting
- Comparison of brittle vs. stable selectors

**Run the tests:**
```bash
npx playwright test tests/demo-quickstart.spec.ts
```

### 4. Reference the Cheat Sheet
Keep the [Cheat Sheet](CHEAT_SHEET.md) handy as you write your own tests.

---

## 🎯 Learning Path

```
1. Quick Start Guide (5 minutes)
   ↓ Understand the core workflow
   
2. Run Example Tests (2 minutes)
   ↓ See real Playwright code
   
3. Try on Demo Page (10 minutes)
   ↓ Interactive exploration with AI
   
4. Reference Cheat Sheet (ongoing)
   ↓ Quick syntax lookups
   
5. Apply to Your App (ongoing)
   ↓ Real-world usage
```

---

## 💡 Tips for Success

### Start Simple
Begin with a single button or link on the demo page. Walk through the complete exploration workflow:
1. Get the snapshot
2. Call `resolve_container`
3. Call `inspect_pattern`
4. Call `extract_anchors`
5. Generate the selector

### Compare Approaches
For each scenario, think about:
- **Without Verdex**: What would a typical nth() selector look like?
- **With Verdex**: How does the structure-based selector differ?
- **Resilience**: Which one survives reordering/refactoring?

### Iterate Quickly
Token-efficient tools (1-2k tokens per query) enable rapid iteration:
- Try different container levels
- Experiment with filtering strategies
- Discover patterns through exploration

---

## 🎓 Example Prompts to Try

Copy-paste these prompts to your AI assistant (after starting Verdex and navigating to the demo page):

### Basic Product Selection
```
Help me write a Playwright selector to click "Add to Cart" 
for the MacBook Pro product.
```

### State-Based Filtering
```
Write a selector to find all products that are currently in stock 
and verify their count.
```

### Table Navigation
```
Write a selector to click the "Select" button for the Google Pixel 8 Pro 
in the comparison table.
```

### List Filtering
```
Write a selector to click "View Details" for the order containing 
Sony WH-1000XM5 Headphones.
```

### Nested Components
```
Write a selector to decrease the quantity of iPhone 15 Pro 
in the shopping cart drawer.
```

### Navigation Hierarchy
```
Write a selector to click on the "Accessories" subcategory 
under "Electronics" in the sidebar.
```

---

## 📖 Additional Resources

- **[Full Documentation](../README.md)** - Complete Verdex architecture and features
- **[GitHub Discussions](https://github.com/verdexhq/verdex-mcp/discussions)** - Community Q&A
- **[Issues](https://github.com/verdexhq/verdex-mcp/issues)** - Report bugs or request features

---

## 🤝 Contributing Examples

Have a great example or scenario? We'd love to include it!

1. Fork the repository
2. Add your example to this directory
3. Update this README
4. Submit a pull request

Good examples include:
- Complex selector scenarios
- Edge cases you've encountered
- Domain-specific patterns (e.g., data grids, calendars, rich text editors)
- Before/after refactoring stories

---

**Happy testing!** 🚀

