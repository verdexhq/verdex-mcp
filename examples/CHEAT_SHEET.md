# Verdex MCP Cheat Sheet

Quick reference for using Verdex to generate stable Playwright selectors.

---

## 🎯 The Core Workflow

```
1. browser_navigate(url)     → Load page, get initial snapshot
2. resolve_container(ref)        → Find stable containers
3. inspect_pattern(ref, level)  → Understand repeating patterns
4. extract_anchors(ref, level) → Mine unique anchors
5. Generate selector         → Combine structure + content
```

---

## 🔍 Tool Reference

### `browser_navigate(url)`
**Purpose**: Navigate to a page and get initial accessibility snapshot

**Returns**: Accessibility tree with element references (e1, e2, e3...)

**Example**:
```
navigation
  link "Home" [ref=e1]
  link "Products" [ref=e2]
main
  button "Add to Cart" [ref=e3]
```

---

### `resolve_container(ref)`
**Purpose**: Discover containment hierarchy and stable containers

**When to use**: Always start here - find the container structure

**Returns**: Parent chain from target to document.body

**Example**:
```json
{
  "ancestors": [
    { "level": 1, "tag": "div", "attrs": {"data-testid": "product-card"} },
    { "level": 2, "tag": "div", "attrs": {"data-testid": "product-grid"} },
    { "level": 3, "tag": "section", "attrs": {"class": "products"} }
  ]
}
```

**Selector insight**: Use level 1 or 2 as your scoping container

---

### `inspect_pattern(ref, level)`
**Purpose**: Understand repeating patterns at a specific level

**When to use**: After resolve_container, to see if there are multiple similar elements

**Returns**: All siblings at the specified ancestor level

**Example**:
```json
{
  "ancestorLevel": 2,
  "containerAt": { "tag": "div", "attrs": {"data-testid": "product-grid"} },
  "siblings": [
    {
      "index": 0,
      "containsText": ["iPhone 15 Pro", "$999"],
      "outline": [
        { "tag": "h3", "text": "iPhone 15 Pro" },
        { "role": "button", "text": "Add to Cart" }
      ]
    },
    {
      "index": 1,
      "containsText": ["MacBook Pro", "$1,999"],
      "outline": [
        { "tag": "h3", "text": "MacBook Pro" },
        { "role": "button", "text": "Add to Cart" }
      ]
    }
  ]
}
```

**Selector insight**: Multiple similar siblings → need content-based filtering

---

### `extract_anchors(ref, level)`
**Purpose**: Mine unique anchors within the target container

**When to use**: To find specific text/elements to use for filtering

**Returns**: Deep scan of elements at the specified level

**Example**:
```json
{
  "descendants": [
    { "tag": "h3", "text": "iPhone 15 Pro", "depth": 1 },
    { "tag": "span", "text": "$999", "depth": 2 },
    { "tag": "button", "text": "Add to Cart", "depth": 3 }
  ]
}
```

**Selector insight**: Use "iPhone 15 Pro" as unique filter text

---

## 📐 Selector Construction Patterns

### Pattern 1: With data-testid
**When ancestors reveal test IDs:**

```javascript
page.getByTestId('product-card')        // From resolve_container
    .filter({ hasText: 'iPhone 15 Pro' })  // From extract_anchors
    .getByRole('button', { name: 'Add to Cart' })
```

### Pattern 2: Without data-testid
**When only structure is available:**

```javascript
page.locator('section > div')           // From resolve_container
    .filter({ hasText: 'iPhone 15 Pro' })  // From extract_anchors
    .getByRole('button', { name: 'Add to Cart' })
```

### Pattern 3: Multiple levels of filtering
**For complex hierarchies:**

```javascript
page.locator('[data-testid="products-section"]')  // Level 3
    .locator('div.grid')                           // Level 2
    .filter({ hasText: 'iPhone 15 Pro' })          // Unique content
    .getByRole('button', { name: 'Add to Cart' })
```

### Pattern 4: State-based filtering
**When elements have different states:**

```javascript
page.locator('.product-card')
    .filter({ hasNotText: 'Out of Stock' })  // Exclude state
    .first()
    .getByRole('button', { name: 'Add to Cart' })
```

---

## 💡 Decision Tree

```
Start: I need to click a button
  ↓
Q: Is there only ONE of this button on the page?
  YES → Use getByRole('button', { name: 'Text' })
  NO  → Continue ↓

Q: Are there multiple similar buttons?
  YES → Need scoping ↓

Step 1: resolve_container(ref)
  → Find stable container (data-testid, semantic tag, etc.)
  ↓
Step 2: inspect_pattern(ref, level)
  → Check how many similar elements exist at this level
  ↓
Step 3: extract_anchors(ref, level)
  → Find unique content to filter by
  ↓
Result: Container + filter + semantic selector
```

---

## 🎓 Best Practices

### ✅ DO:
- Always start with `resolve_container` to understand hierarchy
- Use `data-testid` when available
- Prefer content filtering over position (nth)
- Scope selectors to logical containers
- Use semantic selectors (getByRole, getByLabel)
- Combine multiple filters for specificity

### ❌ DON'T:
- Use `nth()` unless absolutely necessary
- Rely on fragile CSS classes
- Create overly specific selectors
- Skip container scoping
- Use XPath unless required for legacy systems

---

## 🔬 Token Costs (Approximate)

| Tool | Typical Token Cost |
|------|-------------------|
| `browser_snapshot` | 500-1,500 |
| `resolve_container` | 100-300 |
| `inspect_pattern` | 500-1,000 |
| `extract_anchors` | 500-1,500 |
| **Total per query** | **1,000-2,000** |

Compare to:
- Full DOM dump: 50,000-100,000+ tokens
- A11y tree only: 1,000-3,000 tokens (but limited structure)

---

## 📋 Common Scenarios

### Scenario: Product card in grid
```javascript
// 1. resolve_container → find grid container
// 2. inspect_pattern → see multiple cards
// 3. extract_anchors → find product name

page.locator('[data-testid="product-grid"]')
    .locator('div')
    .filter({ hasText: 'iPhone 15 Pro' })
    .getByRole('button', { name: 'Add to Cart' })
```

### Scenario: Table row
```javascript
// 1. resolve_container → find table
// 2. inspect_pattern → see multiple rows
// 3. extract_anchors → find unique cell content

page.locator('table')
    .locator('tr')
    .filter({ hasText: 'john@example.com' })
    .getByRole('button', { name: 'Edit' })
```

### Scenario: Nested navigation
```javascript
// 1. resolve_container → find nav container
// 2. extract_anchors → map hierarchy

page.locator('nav[data-testid="sidebar"]')
    .getByText('Settings')
    .click()

page.locator('nav[data-testid="sidebar"]')
    .getByText('Profile')
    .click()
```

### Scenario: Form within modal
```javascript
// 1. resolve_container → find modal container
// 2. extract_anchors → find form fields

const modal = page.locator('[role="dialog"]')
await modal.getByLabel('Email').fill('user@example.com')
await modal.getByLabel('Password').fill('password')
await modal.getByRole('button', { name: 'Submit' }).click()
```

---

## 🚨 Troubleshooting

### Problem: "Too many matching elements"
**Solution**: Add more specific content filtering
```javascript
// Before
page.locator('div').getByRole('button')

// After
page.locator('div')
    .filter({ hasText: 'Unique Product Name' })
    .getByRole('button', { name: 'Add to Cart' })
```

### Problem: "Element not found after navigation"
**Solution**: Ensure container remains stable across navigation
```javascript
// Use semantic containers that persist
page.locator('main').getByRole('heading', { level: 1 })
```

### Problem: "Selector breaks on reorder"
**Solution**: Don't use nth(), use content filtering
```javascript
// ❌ Breaks on reorder
page.getByRole('button').nth(3)

// ✅ Stable
page.locator('div')
    .filter({ hasText: 'Product Name' })
    .getByRole('button')
```

---

## 🔗 Quick Links

- [60-Second Quick Start](../QUICKSTART.md)
- [Full Documentation](../README.md)
- [Example Tests](../demo/demo-quickstart.spec.ts)
- [Demo Page](../demo/worst-case/demo-page.html)

---

**Remember**: Structure + Content > Position

Container-scoped selectors with content filters beat positional selectors every time.

