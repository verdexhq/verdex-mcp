---
name: verdex-playwright-authoring
description: Write stable, role-first Playwright selectors using progressive DOM exploration. Check uniqueness first, then use resolve_container → inspect_pattern → extract_anchors only when needed. Essential for avoiding brittle nth() selectors and over-scoped locators.
---

# Verdex Playwright Authoring

## Core Principle

**Check uniqueness FIRST**—many elements need only simple selectors.

**The Winning Pattern**: `Container → Content Filter → Role`

```typescript
page
  .getByTestId("container")            // 1. Scope
  .filter({ hasText: "unique-content" }) // 2. Filter
  .getByRole("button", { name: "Action" }) // 3. Target
```

---

## Quick Workflow

### 1. Navigate & Check Uniqueness
```typescript
await browser_navigate(url)
// Snapshot shows interactive elements with refs

// Is element unique? If YES → use simple selector
page.getByRole("button", { name: "Checkout" })

// If NO → explore further
```

### 2. Discover Containers: `resolve_container(ref)`
**When**: Element is NOT unique

```typescript
resolve_container("e25")
// Look for: data-testid, semantic tags, ARIA landmarks
```

### 3. Analyze Patterns: `inspect_pattern(ref, level)`
**When**: Found stable container, need to understand siblings

```typescript
inspect_pattern("e25", 2) // Level from resolve_container
// Find: Unique text differentiators
```

### 4. Mine Content: `extract_anchors(ref, level)` (Optional)
**When**: Need deeper content analysis

**Skip if**: `inspect_pattern` already shows unique identifying text

---

## Common Selector Patterns

### Pattern 1: Unique Element
```typescript
page.getByRole("button", { name: "Proceed to Checkout" })
```

### Pattern 2: Test ID Container Scoping
```typescript
page
  .getByTestId("product-card")
  .filter({ hasText: "iPhone 15 Pro" })
  .getByRole("button", { name: "Add to Cart" })
```

### Pattern 3: Semantic Container
```typescript
page
  .getByRole("article", { name: /John Doe/ })
  .getByRole("button", { name: "Helpful" })
```

### Pattern 4: Generic Container (Last Resort)
```typescript
page
  .locator("div")
  .filter({ hasText: "Order #ORD-2024-1234" })
  .getByRole("button", { name: "Track" })
```

---

## Critical Anti-Patterns

### ❌ Filter in Wrong Place
```typescript
// WRONG: Filter looks for text INSIDE button
page.getByRole("button").filter({ hasText: "iPhone 15 Pro" })

// CORRECT: Filter the container that has both elements
page
  .getByTestId("product-card")
  .filter({ hasText: "iPhone 15 Pro" })
  .getByRole("button", { name: "Add to Cart" })
```

### ❌ Positional Selectors
```typescript
// WRONG: page.getByRole("button").nth(5)
// CORRECT: Use content-based filtering
```

### ❌ Over-Scope Unique Elements
```typescript
// Check uniqueness first—don't add unnecessary scoping
await page.getByRole("button", { name: "..." }).count() === 1
```

### ❌ Parent Traversal
```typescript
// WRONG: page.getByText("text").locator("..")
// CORRECT: Find container that contains both
```

---

## Token Efficiency

| Scenario | Tools | Cost | When |
|----------|-------|------|------|
| Unique element | Snapshot only | ~800 | Element appears once |
| Test ID scoped | + resolve + inspect | ~1,200 | Well-structured apps |
| Semantic scoped | + resolve + inspect | ~1,500 | Accessible markup |
| Structure-based | All three tools | ~2,500 | Legacy code |

**Optimize**: Skip `extract_anchors` if `inspect_pattern` shows clear unique text

---

## Quick Reference

```typescript
// 1. Initialize
await browser_initialize()
await browser_navigate(url)

// 2. Check uniqueness in snapshot FIRST

// 3. If not unique:
resolve_container("e25")
// → Look for: data-testid, semantic tags, ARIA

// 4. If repeating elements:
inspect_pattern("e25", 2)
// → Look for: Unique text differentiators

// 5. If needed:
extract_anchors("e25", 1)
// → Only if inspect_pattern insufficient

// 6. Generate selector:
page.getByTestId("container")
  .filter({ hasText: "differentiator" })
  .getByRole("button", { name: "Action" })
```

---

## Selector Quality Checklist

- [ ] Returns exactly 1 element
- [ ] Uses test IDs or semantic elements (not classes)
- [ ] Ends with `getByRole()` or equivalent
- [ ] Chain is ≤ 3 levels deep
- [ ] No `.nth()`, no `locator('..')`, no wrong filter placement
- [ ] Survives DOM reordering

---

## Key Takeaway

**Container → Content → Role beats positional selectors every time.**

Workflow:
1. Check uniqueness first
2. Find stable container (`resolve_container`)
3. Understand patterns (`inspect_pattern`)
4. Extract content if needed (`extract_anchors` - optional)
5. Compose stable selector

**Don't dump the entire DOM. Ask targeted questions.**

---

## Additional Resources

- **[VERDEX_SELECTOR_GUIDE.md](VERDEX_SELECTOR_GUIDE.md)**: Complete methodology with real-world examples

