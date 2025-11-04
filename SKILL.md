---
name: verdex-playwright-authoring
description: Write robust, container-scoped Playwright selectors using progressive DOM exploration with Verdex MCP tools (resolve_container, inspect_pattern, extract_anchors). Use when authoring Playwright tests, creating selectors, exploring page structure, or debugging test failures. Essential for avoiding brittle nth() selectors.
---

# Verdex Playwright Authoring

## Overview

Verdex provides three DOM exploration primitives that help you write stable, semantic Playwright selectors. These tools reveal structural information that accessibility trees omit (like `data-testid` attributes and container boundaries).

**Core principle**: Start with minimal context, progressively explore structure only as needed.

---

## The 3-Step Exploration Workflow

Always follow this sequence when writing selectors for elements that might have multiple instances on the page:

### Step 1: Find Stable Containers (`resolve_container`)

**When to use**: First step for any element exploration — find the containment hierarchy.

**What it reveals**:
- Parent elements from target up to `document.body`
- Attributes like `data-testid`, `id`, semantic roles
- Level numbers for subsequent sibling/descendant queries

**Example call**:
```javascript
resolve_container(ref="e3")
```

**What to look for**:
- `data-testid` attributes on containers (best anchor)
- Semantic tags (`main`, `section`, `nav`, `article`)
- Unique `id` attributes
- Note the level number of the most stable container

**Selector insight**: The stable container becomes your scoping anchor.

---

### Step 2: Understand Patterns (`inspect_pattern`)

**When to use**: After `resolve_container`, to check if there are multiple similar elements.

**What it reveals**:
- All sibling elements at the specified ancestor level
- Repeating patterns (product cards, table rows, list items)
- What makes each sibling unique (text content, attributes)

**Example call**:
```javascript
inspect_pattern(ref="e3", ancestorLevel=2)
// Use the level number from resolve_container output
```

**What to look for**:
- How many similar siblings exist?
- What unique text distinguishes each sibling?
- Are there state differences (active, disabled, out of stock)?

**Selector insight**: Multiple siblings → need content-based filtering with `.filter({ hasText: ... })`.

---

### Step 3: Mine Unique Anchors (`extract_anchors`)

**When to use**: To find specific text or elements within the target container for filtering.

**What it reveals**:
- Internal structure of the container
- Headings, labels, unique text
- Button text and ARIA roles
- Elements with `data-testid` within the container

**Example call**:
```javascript
extract_anchors(ref="e3", ancestorLevel=1)
// Use the level that represents your target container
```

**What to look for**:
- Unique text content (product names, headings, prices)
- Button labels and `aria-label` attributes
- Elements that can differentiate this container from siblings

**Selector insight**: Use unique content for `.filter({ hasText: "Unique Text" })`.

---

## Selector Composition Patterns

Once exploration is complete, compose selectors using this priority order:

### Priority Order (Most Stable → Least Stable)

1. **Test IDs**: `getByTestId()`, `data-testid`, `id`
2. **Semantic Roles**: `getByRole()`, `getByLabel()`
3. **Content-Based**: `getByText()`, `.filter({ hasText })`
4. **Attributes**: `[aria-label]`, `[name]`
5. **CSS Selectors**: Only as last resort

### Pattern 1: With data-testid (Best)

```javascript
page.getByTestId("product-card")        // From resolve_container
    .filter({ hasText: "iPhone 15 Pro" })  // From extract_anchors
    .getByRole("button", { name: "Add to Cart" })
```

### Pattern 2: Without data-testid

```javascript
page.locator("section > div")           // From resolve_container structure
    .filter({ hasText: "iPhone 15 Pro" })  // From extract_anchors
    .getByRole("button", { name: "Add to Cart" })
```

### Pattern 3: List/Grid Items

```javascript
page.getByTestId("products-grid")  // Level 3 container
    .locator("div")                             // Level 2 card container
    .filter({ hasText: "Unique Item Name" })    // From extract_anchors
    .getByRole("button", { name: "Action" })
```

### Pattern 4: Forms & Inputs

```javascript
page.locator('[data-testid="login-form"]')
    .getByLabel("Username")  // Semantic selector

page.locator('[data-testid="search-section"]')
    .getByRole("textbox", { name: /search/i })
```

### Pattern 5: Tables & Data

```javascript
page.locator('[data-testid="users-table"]')
    .locator("tr")
    .filter({ hasText: "john@example.com" })
    .getByRole("button", { name: "Edit" })
```

---

## Complete Example Workflow

**Scenario**: Click "Add to Cart" for iPhone 15 Pro when there are 12 products on the page.

**Step 1 - Navigate and identify target**:
```javascript
browser_navigate(url)
// Snapshot shows: button "Add to Cart" [ref=e3]
```

**Step 2 - Discover container hierarchy**:
```javascript
resolve_container(ref="e3")
// Returns:
// Level 1: div with data-testid="product-card"
// Level 2: div with data-testid="product-grid"
// Level 3: section with class="products"
```

**Step 3 - Check for repeating patterns**:
```javascript
inspect_pattern(ref="e3", ancestorLevel=2)
// Returns: 12 product cards, each with unique product names
```

**Step 4 - Find unique content**:
```javascript
extract_anchors(ref="e3", ancestorLevel=1)
// Returns:
// - h3: "iPhone 15 Pro" (unique!)
// - button: "Add to Cart"
```

**Step 5 - Generate selector**:
```javascript
await page
  .getByTestId("product-card")
  .filter({ hasText: "iPhone 15 Pro" })
  .getByRole("button", { name: "Add to Cart" })
  .click();
```

**Token cost**: ~1,500 tokens (vs 50,000+ for full DOM dump)

---

## Best Practices

### ✅ DO:
- Always start with `resolve_container` to find containers
- Use `data-testid` when available
- Prefer content filtering over position (`.nth()`)
- Scope to logical container boundaries
- Use semantic selectors (`getByRole`, `getByLabel`)
- Chain filters for specificity when needed

### ❌ DON'T:
- Use `.nth()` unless absolutely necessary
- Skip container exploration for repeated elements
- Rely on fragile CSS class names
- Use XPath unless required for legacy systems
- Assume accessibility tree shows all structural attributes

---

## Common Pitfalls

### Problem: "Too many matching elements"
**Solution**: Add content-based filtering
```javascript
// Before
page.locator("div").getByRole("button")

// After
page.locator("div")
    .filter({ hasText: "Unique Product Name" })
    .getByRole("button", { name: "Add to Cart" })
```

### Problem: "Selector breaks when order changes"
**Solution**: Use content filtering instead of `.nth()`
```javascript
// ❌ Fragile
page.getByRole("button").nth(3)

// ✅ Stable
page.locator("div")
    .filter({ hasText: "Product Name" })
    .getByRole("button")
```

### Problem: "Can't find the right container"
**Solution**: Check all ancestor levels
```javascript
// Try different levels to find the right scoping container
inspect_pattern(ref="e3", ancestorLevel=1)  // Card level
inspect_pattern(ref="e3", ancestorLevel=2)  // Grid level
inspect_pattern(ref="e3", ancestorLevel=3)  // Section level
```

---

## Working Without Test Infrastructure

**Verdex works on pure HTML structure** — no `data-testid` required.

When `resolve_container` reveals no test IDs, use structural selectors:

```javascript
// Level 1: div (no attributes)
// Level 2: section (no attributes)

page.locator("section > div")
    .filter({ hasText: "iPhone 15 Pro" })
    .getByRole("button", { name: "Add to Cart" })
```

**Trade-off**: Structure-based selectors are less resilient than test ID-based selectors, but far better than positional `.nth()` selectors.

---

## Token Efficiency

Each Verdex tool returns minimal structural facts:

| Tool | Typical Tokens | What It Reveals |
|------|----------------|-----------------|
| `resolve_container` | 100-300 | Container hierarchy + attributes |
| `inspect_pattern` | 500-1,000 | Repeating patterns + unique content |
| `extract_anchors` | 500-1,500 | Internal structure + semantic elements |
| **Total per selector** | **~1,000-2,000** | Complete structural understanding |

Compare to:
- Full DOM dump: 50,000-100,000+ tokens
- A11y tree only: 1,000-3,000 tokens (but no structural attributes)

---

## Multi-Role Testing

For complex E2E flows requiring multiple authenticated users, see [MULTI_ROLE.md](MULTI_ROLE.md).

---

## Advanced Patterns

For detailed examples including:
- Dynamic content handling
- Complex form workflows
- State-based filtering
- Multiple filter chaining

See [EXAMPLES.md](EXAMPLES.md).

---

## Key Takeaway

**Structure + Content > Position**

Container-scoped selectors with content filters beat positional selectors every time.

The pattern is always:
1. Find stable container (`resolve_container`)
2. Check for repeating elements (`inspect_pattern`)
3. Extract unique content (`extract_anchors`)
4. Compose: `container.filter(content).getByRole()`

