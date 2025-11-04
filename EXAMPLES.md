# Verdex Playwright Examples

Detailed examples showing the complete exploration workflow for common UI patterns.

---

## Example 1: Product Card in Grid

**Challenge**: 12 product cards, need to click "Add to Cart" for iPhone 15 Pro specifically.

### Exploration Process

**1. Initial snapshot**:
```
main
  generic
    heading "iPhone 15 Pro"
    button "Add to Cart" [ref=e3]
  generic
    heading "MacBook Pro"
    button "Add to Cart" [ref=e4]
  ... (10 more products)
```

**2. Find containers** (`resolve_container(e3)`):
```json
{
  "ancestors": [
    {
      "level": 1,
      "tagName": "div",
      "attributes": { "data-testid": "product-card" },
      "childElements": 5
    },
    {
      "level": 2,
      "tagName": "div",
      "attributes": { "data-testid": "product-grid" },
      "childElements": 12
    },
    {
      "level": 3,
      "tagName": "section",
      "attributes": { "class": "products" },
      "childElements": 2
    }
  ]
}
```

**Insight**: Card container at level 1 has `data-testid="product-card"` — great anchor!

**3. Check siblings** (`inspect_pattern(e3, 2)`):
```json
{
  "ancestorLevel": 2,
  "containerAt": {
    "tagName": "div",
    "attributes": { "data-testid": "product-grid" }
  },
  "targetSiblingIndex": 1,
  "siblings": [
    {
      "index": 0,
      "tagName": "div",
      "attributes": { "data-testid": "product-card" },
      "containsText": ["MacBook Air", "$1,499"],
      "outline": [
        { "tag": "h3", "text": "MacBook Air" },
        { "role": "button", "text": "Add to Cart" }
      ]
    },
    {
      "index": 1,
      "tagName": "div",
      "attributes": { "data-testid": "product-card" },
      "containsText": ["iPhone 15 Pro", "$999"],
      "outline": [
        { "tag": "h3", "text": "iPhone 15 Pro" },
        { "role": "button", "text": "Add to Cart" }
      ]
    }
    // ... 10 more cards
  ]
}
```

**Insight**: 12 cards total, each distinguished by product name in `h3`.

**4. Mine unique content** (`extract_anchors(e3, 1)`):
```json
{
  "ancestorAt": {
    "level": 1,
    "tagName": "div",
    "attributes": { "data-testid": "product-card" }
  },
  "descendants": [
    {
      "depth": 1,
      "tagName": "h3",
      "fullText": "iPhone 15 Pro"
    },
    {
      "depth": 2,
      "tagName": "span",
      "attributes": { "class": "price" },
      "fullText": "$999"
    },
    {
      "depth": 3,
      "tagName": "button",
      "fullText": "Add to Cart"
    }
  ]
}
```

**Insight**: "iPhone 15 Pro" heading is unique identifier.

### Generated Selector

```javascript
await page
  .getByTestId("product-card")
  .filter({ hasText: "iPhone 15 Pro" })
  .getByRole("button", { name: "Add to Cart" })
  .click();
```

**Why it's stable**:
- ✅ Scoped to container with test ID
- ✅ Filtered by unique content
- ✅ Uses semantic role for button
- ✅ Survives reordering, DOM changes

---

## Example 2: Table Row with Edit Button

**Challenge**: User table with 50 rows, need to click "Edit" for john@example.com.

### Exploration Process

**1. Initial snapshot**:
```
table
  row
    cell "john@example.com"
    cell "Admin"
    button "Edit" [ref=e5]
  row
    cell "jane@example.com"
    cell "User"
    button "Edit" [ref=e6]
  ... (48 more rows)
```

**2. Find containers** (`resolve_container(e5)`):
```json
{
  "ancestors": [
    {
      "level": 1,
      "tagName": "tr",
      "attributes": {},
      "childElements": 4
    },
    {
      "level": 2,
      "tagName": "tbody",
      "attributes": {},
      "childElements": 50
    },
    {
      "level": 3,
      "tagName": "table",
      "attributes": { "data-testid": "users-table" },
      "childElements": 2
    }
  ]
}
```

**Insight**: Table has test ID at level 3, row at level 1.

**3. Check siblings** (`inspect_pattern(e5, 2)`):
```json
{
  "ancestorLevel": 2,
  "siblings": [
    {
      "index": 0,
      "tagName": "tr",
      "containsText": ["john@example.com", "Admin", "Edit"],
      "outline": [
        { "tag": "td", "text": "john@example.com" },
        { "tag": "td", "text": "Admin" },
        { "role": "button", "text": "Edit" }
      ]
    },
    {
      "index": 1,
      "tagName": "tr",
      "containsText": ["jane@example.com", "User", "Edit"],
      "outline": [
        { "tag": "td", "text": "jane@example.com" },
        { "tag": "td", "text": "User" },
        { "role": "button", "text": "Edit" }
      ]
    }
    // ... 48 more rows
  ]
}
```

**Insight**: Email addresses are unique identifiers.

### Generated Selector

```javascript
await page
  .getByTestId("users-table")
  .locator("tr")
  .filter({ hasText: "john@example.com" })
  .getByRole("button", { name: "Edit" })
  .click();
```

---

## Example 3: Nested Navigation Menu

**Challenge**: Multi-level navigation, need to click "Profile" under "Settings".

### Exploration Process

**1. Initial snapshot**:
```
navigation
  link "Dashboard" [ref=e1]
  link "Settings" [ref=e2]
    generic
      link "Profile" [ref=e3]
      link "Billing" [ref=e4]
      link "Security" [ref=e5]
```

**2. Find containers** (`resolve_container(e3)`):
```json
{
  "ancestors": [
    {
      "level": 1,
      "tagName": "div",
      "attributes": { "class": "submenu" },
      "childElements": 3
    },
    {
      "level": 2,
      "tagName": "li",
      "attributes": { "data-testid": "nav-settings" },
      "childElements": 2
    },
    {
      "level": 3,
      "tagName": "nav",
      "attributes": { "data-testid": "sidebar" },
      "childElements": 5
    }
  ]
}
```

**Insight**: Sidebar has test ID, Settings parent has test ID.

### Generated Selector

```javascript
// First, ensure Settings section is expanded
await page
  .getByTestId("sidebar")
  .getByRole("link", { name: "Settings" })
  .click();

// Then click Profile
await page
  .getByTestId("nav-settings")
  .getByRole("link", { name: "Profile" })
  .click();
```

**Alternative** (if submenu is always visible):
```javascript
await page
  .getByTestId("sidebar")
  .locator('[data-testid="nav-settings"]')
  .getByRole("link", { name: "Profile" })
  .click();
```

---

## Example 4: Form Within Modal

**Challenge**: Login modal with username/password fields.

### Exploration Process

**1. Initial snapshot**:
```
dialog "Login"
  heading "Sign In"
  textbox "Email" [ref=e7]
  textbox "Password" [ref=e8]
  button "Sign In" [ref=e9]
  button "Cancel" [ref=e10]
```

**2. Find containers** (`resolve_container(e7)`):
```json
{
  "ancestors": [
    {
      "level": 1,
      "tagName": "form",
      "attributes": { "data-testid": "login-form" },
      "childElements": 4
    },
    {
      "level": 2,
      "tagName": "div",
      "attributes": { "role": "dialog", "aria-labelledby": "login-title" },
      "childElements": 2
    }
  ]
}
```

**Insight**: Form has test ID, dialog has semantic role.

### Generated Selector

```javascript
const modal = page.locator('[role="dialog"]');
await modal.getByLabel("Email").fill("user@example.com");
await modal.getByLabel("Password").fill("password123");
await modal.getByRole("button", { name: "Sign In" }).click();
```

**Alternative** (scoped to form):
```javascript
const form = page.getByTestId("login-form");
await form.getByLabel("Email").fill("user@example.com");
await form.getByLabel("Password").fill("password123");
await form.getByRole("button", { name: "Sign In" }).click();
```

---

## Example 5: Dynamic Content (Out of Stock)

**Challenge**: Click "Add to Cart" for first in-stock product, skip out-of-stock items.

### Exploration Process

**1. Initial snapshot**:
```
main
  generic
    heading "Product A"
    text "Out of Stock"
    button "Add to Cart" [disabled] [ref=e11]
  generic
    heading "Product B"
    button "Add to Cart" [ref=e12]
```

**2. Check siblings** (`inspect_pattern(e12, 2)`):
```json
{
  "siblings": [
    {
      "index": 0,
      "containsText": ["Product A", "Out of Stock"],
      "outline": [
        { "tag": "h3", "text": "Product A" },
        { "tag": "span", "text": "Out of Stock" },
        { "role": "button", "text": "Add to Cart", "disabled": true }
      ]
    },
    {
      "index": 1,
      "containsText": ["Product B", "$49"],
      "outline": [
        { "tag": "h3", "text": "Product B" },
        { "tag": "span", "text": "$49" },
        { "role": "button", "text": "Add to Cart", "disabled": false }
      ]
    }
  ]
}
```

**Insight**: Out-of-stock items have "Out of Stock" text.

### Generated Selector

```javascript
// Option 1: Exclude out-of-stock
await page
  .getByTestId("product-card")
  .filter({ hasNotText: "Out of Stock" })
  .first()
  .getByRole("button", { name: "Add to Cart" })
  .click();

// Option 2: Select specific in-stock product
await page
  .getByTestId("product-card")
  .filter({ hasText: "Product B" })
  .getByRole("button", { name: "Add to Cart" })
  .click();
```

---

## Example 6: Shopping Cart Drawer

**Challenge**: Increase quantity for AirPods Pro in cart drawer.

### Exploration Process

**1. Initial snapshot**:
```
complementary "Shopping Cart"
  generic
    heading "AirPods Pro"
    button "-" [ref=e13]
    text "2"
    button "+" [ref=e14]
  generic
    heading "iPhone Case"
    button "-" [ref=e15]
    text "1"
    button "+" [ref=e16]
```

**2. Find containers** (`resolve_container(e14)`):
```json
{
  "ancestors": [
    {
      "level": 1,
      "tagName": "div",
      "attributes": { "data-testid": "cart-item" },
      "childElements": 5
    },
    {
      "level": 2,
      "tagName": "div",
      "attributes": { "data-testid": "cart-items" },
      "childElements": 2
    },
    {
      "level": 3,
      "tagName": "aside",
      "attributes": { "data-testid": "cart-drawer", "role": "complementary" },
      "childElements": 3
    }
  ]
}
```

**3. Check siblings** (`inspect_pattern(e14, 2)`):
```json
{
  "siblings": [
    {
      "index": 0,
      "tagName": "div",
      "attributes": { "data-testid": "cart-item" },
      "containsText": ["AirPods Pro", "2", "$249"],
      "outline": [
        { "tag": "h4", "text": "AirPods Pro" },
        { "role": "button", "text": "-" },
        { "tag": "span", "text": "2" },
        { "role": "button", "text": "+" }
      ]
    },
    {
      "index": 1,
      "tagName": "div",
      "attributes": { "data-testid": "cart-item" },
      "containsText": ["iPhone Case", "1", "$29"],
      "outline": [
        { "tag": "h4", "text": "iPhone Case" },
        { "role": "button", "text": "-" },
        { "tag": "span", "text": "1" },
        { "role": "button", "text": "+" }
      ]
    }
  ]
}
```

### Generated Selector

```javascript
await page
  .getByTestId("cart-drawer")
  .getByTestId("cart-item")
  .filter({ hasText: "AirPods Pro" })
  .getByRole("button", { name: "+" })
  .click();
```

---

## Example 7: No Test IDs (Pure Structure)

**Challenge**: Same product card scenario, but with zero test infrastructure.

### HTML Structure
```html
<section>
  <div>
    <h3>iPhone 15 Pro</h3>
    <span>$999</span>
    <button>Add to Cart</button>
  </div>
  <div>
    <h3>MacBook Pro</h3>
    <span>$1,999</span>
    <button>Add to Cart</button>
  </div>
</section>
```

### Exploration Process

**1. Find containers** (`resolve_container(e3)`):
```json
{
  "ancestors": [
    {
      "level": 1,
      "tagName": "div",
      "attributes": {},
      "childElements": 3
    },
    {
      "level": 2,
      "tagName": "section",
      "attributes": {},
      "childElements": 12
    }
  ]
}
```

**2. Check siblings** (`inspect_pattern(e3, 2)`):
```json
{
  "siblings": [
    {
      "index": 0,
      "tagName": "div",
      "containsText": ["iPhone 15 Pro", "$999"],
      "outline": [
        { "tag": "h3", "text": "iPhone 15 Pro" },
        { "role": "button", "text": "Add to Cart" }
      ]
    },
    {
      "index": 1,
      "tagName": "div",
      "containsText": ["MacBook Pro", "$1,999"],
      "outline": [
        { "tag": "h3", "text": "MacBook Pro" },
        { "role": "button", "text": "Add to Cart" }
      ]
    }
  ]
}
```

### Generated Selector

```javascript
await page
  .locator("section > div")
  .filter({ hasText: "iPhone 15 Pro" })
  .getByRole("button", { name: "Add to Cart" })
  .click();
```

**Trade-off**: Less stable than test ID-based selector, but far better than `.nth()`.

---

## Key Patterns Summary

| UI Pattern | Container Strategy | Filtering Strategy | Semantic Selector |
|------------|-------------------|-------------------|-------------------|
| **Product Grid** | `data-testid="product-card"` | `.filter({ hasText: "Product Name" })` | `getByRole("button")` |
| **Table Row** | `data-testid="table"` + `locator("tr")` | `.filter({ hasText: "unique@email" })` | `getByRole("button")` |
| **Navigation** | `data-testid="nav"` | Direct `getByRole("link")` | With `{ name: "Link Text" }` |
| **Form in Modal** | `[role="dialog"]` or form test ID | `getByLabel()` for inputs | `getByRole("button")` |
| **Dynamic State** | Container test ID | `.filter({ hasNotText: "State" })` | `getByRole()` |
| **Nested Lists** | Parent test ID | `.filter({ hasText: "Item" })` | `getByRole()` |
| **No Test IDs** | `locator("semantic > tag")` | `.filter({ hasText })` | `getByRole()` |

---

## Debugging Tips

### Problem: Selector matches multiple elements

**Diagnosis**:
```javascript
// Check how many matches
await page.locator(yourSelector).count();
```

**Solution**: Add more specific filtering
```javascript
// Before
page.getByTestId("card").getByRole("button")

// After
page.getByTestId("card")
    .filter({ hasText: "Unique Text" })
    .getByRole("button")
```

### Problem: Element not found

**Diagnosis**: Re-explore with Verdex
```javascript
browser_snapshot()  // Get fresh refs
resolve_container(ref)  // Check if container structure changed
```

**Solution**: Adjust selector to new structure

### Problem: Selector is too specific

**Symptom**: Breaks on minor DOM changes

**Solution**: Remove unnecessary specificity
```javascript
// Too specific
page.locator("section > div > div.card > div.body > button")

// Better
page.getByTestId("card")
    .filter({ hasText: "Product" })
    .getByRole("button")
```

