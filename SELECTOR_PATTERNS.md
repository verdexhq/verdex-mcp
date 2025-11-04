# Selector Pattern Library

Comprehensive catalog of selector patterns for common UI components, organized by use case with stability ratings and trade-offs.

---

## Reading This Guide

### Pattern Format

Each pattern includes:
- **Use case**: When to apply this pattern
- **Stability**: ⭐⭐⭐⭐⭐ (Most stable) to ⭐ (Least stable)
- **Structure**: Required DOM exploration
- **Selector**: The generated Playwright selector
- **Trade-offs**: What you gain and what you compromise
- **Alternatives**: Other approaches to consider

### Stability Ratings

- ⭐⭐⭐⭐⭐ **Excellent**: Survives refactors, reordering, styling changes
- ⭐⭐⭐⭐ **Very Good**: Survives most changes, may need updates for major refactors
- ⭐⭐⭐ **Good**: Works well but sensitive to structural changes
- ⭐⭐ **Fair**: Fragile, use only when better options unavailable
- ⭐ **Poor**: Avoid except as last resort

---

## Table of Contents

1. [Navigation Components](#navigation-components)
2. [Forms and Inputs](#forms-and-inputs)
3. [Lists and Grids](#lists-and-grids)
4. [Tables and Data](#tables-and-data)
5. [Modals and Dialogs](#modals-and-dialogs)
6. [Cards and Panels](#cards-and-panels)
7. [Menus and Dropdowns](#menus-and-dropdowns)
8. [Tabs and Accordions](#tabs-and-accordions)
9. [Buttons and Actions](#buttons-and-actions)
10. [Notifications and Alerts](#notifications-and-alerts)

---

## Navigation Components

### Pattern: Top-Level Navigation Link

**Use case**: Clicking main navigation items (header, sidebar)

**Stability**: ⭐⭐⭐⭐⭐

**Verdex exploration**:
```javascript
resolve_container(ref)
// Find: nav element or data-testid="main-nav"
```

**Selector**:
```javascript
// Best: Semantic with test ID
page.getByTestId("main-nav")
    .getByRole("link", { name: "Products" })

// Good: Role within nav
page.getByRole("navigation")
    .getByRole("link", { name: "Products" })

// Acceptable: Direct role selector
page.getByRole("link", { name: "Products" })
```

**Trade-offs**:
- ✅ Clear semantic intent
- ✅ Survives styling changes
- ✅ Accessible by default
- ⚠️ Ambiguous if "Products" appears in multiple navs

**When to add scope**: If page has multiple navigation sections (header, footer, sidebar)

---

### Pattern: Nested Navigation (Submenus)

**Use case**: Multi-level navigation with parent → child relationship

**Stability**: ⭐⭐⭐⭐

**Verdex exploration**:
```javascript
resolve_container(ref)
// Level 1: submenu container
// Level 2: parent menu item
// Level 3: nav element

inspect_pattern(ref, ancestorLevel=1)
// See other submenu items
```

**Selector**:
```javascript
// Best: Parent scoping with test IDs
page.getByTestId("main-nav")
    .locator('[data-testid="nav-settings"]')  // Parent section
    .getByRole("link", { name: "Profile" })

// Good: Hierarchical role selection
page.getByRole("navigation")
    .getByRole("list")
    .filter({ hasText: "Settings" })
    .getByRole("link", { name: "Profile" })

// Acceptable: Chained text filtering
page.getByText("Settings")
    .locator("..")  // Parent
    .getByRole("link", { name: "Profile" })
```

**Trade-offs**:
- ✅ Clear parent-child relationship
- ✅ Scoped to navigation section
- ⚠️ May need to expand parent first
- ⚠️ Structure-dependent

---

### Pattern: Breadcrumb Navigation

**Use case**: Clicking breadcrumb links

**Stability**: ⭐⭐⭐⭐

**Selector**:
```javascript
// Best: Within breadcrumb landmark
page.getByRole("navigation", { name: /breadcrumb/i })
    .getByRole("link", { name: "Products" })

// Good: Test ID scoping
page.getByTestId("breadcrumbs")
    .getByRole("link", { name: "Products" })

// Acceptable: Ordered selection (if order is semantic)
page.getByRole("navigation", { name: /breadcrumb/i })
    .getByRole("link")
    .nth(1)  // Second breadcrumb
```

**Trade-offs**:
- ✅ Semantic breadcrumb role
- ✅ Clear navigation intent
- ⚠️ Order-based selection breaks if breadcrumb levels change

---

## Forms and Inputs

### Pattern: Text Input by Label

**Use case**: Filling form fields

**Stability**: ⭐⭐⭐⭐⭐

**Selector**:
```javascript
// Best: Direct label association
page.getByLabel("Email address")

// Good: Scoped to form
page.getByTestId("login-form")
    .getByLabel("Email address")

// Good: By placeholder
page.getByPlaceholder("Enter your email")

// Acceptable: By role and name
page.getByRole("textbox", { name: "Email address" })
```

**Trade-offs**:
- ✅ Most stable pattern
- ✅ Enforces accessibility
- ✅ Self-documenting
- ⚠️ Requires proper label association

---

### Pattern: Checkbox/Radio Selection

**Use case**: Selecting options

**Stability**: ⭐⭐⭐⭐⭐

**Selector**:
```javascript
// Best: By label
page.getByLabel("Remember me")
page.getByLabel("Subscribe to newsletter")

// Good: By role with name
page.getByRole("checkbox", { name: "Remember me" })
page.getByRole("radio", { name: "Credit Card" })

// In a group:
page.getByRole("group", { name: "Payment Method" })
    .getByLabel("Credit Card")
```

**Trade-offs**:
- ✅ Accessible by default
- ✅ Clear user intent
- ✅ Works with custom styling
- ⚠️ Requires proper ARIA or label association

---

### Pattern: Select Dropdown

**Use case**: Selecting from dropdown

**Stability**: ⭐⭐⭐⭐

**Selector**:
```javascript
// Best: Native select by label
await page.getByLabel("Country").selectOption("United States");

// Good: Custom dropdown (explore first)
await page.getByTestId("country-selector").click();
await page.getByRole("option", { name: "United States" }).click();

// Combobox pattern:
await page.getByRole("combobox", { name: "Country" }).click();
await page.getByRole("option", { name: "United States" }).click();
```

**Trade-offs**:
- ✅ Native selects are very stable
- ⚠️ Custom dropdowns need exploration
- ⚠️ May need to open dropdown first

---

### Pattern: Submit Button in Form

**Use case**: Submitting forms

**Stability**: ⭐⭐⭐⭐⭐

**Selector**:
```javascript
// Best: Scoped submit button
page.getByTestId("login-form")
    .getByRole("button", { name: "Sign in" })

// Good: Form context
page.locator("form")
    .filter({ hasText: "Login" })
    .getByRole("button", { name: "Sign in" })

// Acceptable: Direct submit button
page.getByRole("button", { name: "Sign in" })

// Works with submit type:
page.getByRole("button", { name: /submit|sign in|log in/i })
```

**Trade-offs**:
- ✅ Clear action intent
- ✅ Semantic role
- ⚠️ Scope to form if multiple submit buttons exist

---

## Lists and Grids

### Pattern: Product Grid Item

**Use case**: Selecting item from grid of products

**Stability**: ⭐⭐⭐⭐⭐

**Verdex exploration**:
```javascript
resolve_container(ref)
// Level 1: product-card
// Level 2: products-grid

inspect_pattern(ref, ancestorLevel=2)
// See all products

extract_anchors(ref, ancestorLevel=1)
// Find unique product name
```

**Selector**:
```javascript
// Best: Test ID + content filter
page.getByTestId("product-card")
    .filter({ hasText: "iPhone 15 Pro" })
    .getByRole("button", { name: "Add to Cart" })

// Good: Semantic container + filter
page.locator('[data-testid="products-grid"]')
    .locator("article")
    .filter({ hasText: "iPhone 15 Pro" })
    .getByRole("button", { name: "Add to Cart" })

// Acceptable: Structure-based
page.locator("section > div")
    .filter({ hasText: "iPhone 15 Pro" })
    .getByRole("button", { name: "Add to Cart" })
```

**Trade-offs**:
- ✅ Survives reordering
- ✅ Content-based identification
- ✅ Container-scoped
- ⚠️ Requires unique text per item

---

### Pattern: List Item Selection

**Use case**: Selecting from vertical list

**Stability**: ⭐⭐⭐⭐

**Selector**:
```javascript
// Best: List role with content filter
page.getByRole("list")
    .getByRole("listitem")
    .filter({ hasText: "john@example.com" })

// Good: Test ID scoping
page.getByTestId("user-list")
    .locator("li")
    .filter({ hasText: "john@example.com" })

// With nested action:
page.getByRole("list")
    .getByRole("listitem")
    .filter({ hasText: "john@example.com" })
    .getByRole("button", { name: "Edit" })
```

**Trade-offs**:
- ✅ Semantic list structure
- ✅ Content-based
- ⚠️ Requires unique identifiers per item

---

### Pattern: Paginated List (Specific Page Item)

**Use case**: Selecting item that might be on different pagination pages

**Stability**: ⭐⭐⭐

**Verdex exploration**:
```javascript
// First, explore pagination controls
resolve_container(ref)  // ref = pagination button

// Then explore list items on current page
```

**Selector**:
```javascript
// Pattern: Navigate to page, then select
async function selectPaginatedItem(page, itemText) {
  // Strategy 1: Search if available
  await page.getByRole("searchbox").fill(itemText);
  
  // Strategy 2: Navigate pages until found
  while (!(await page.getByText(itemText).isVisible())) {
    const nextButton = page.getByRole("button", { name: "Next" });
    if (await nextButton.isDisabled()) break;
    await nextButton.click();
  }
  
  // Now select item
  return page.getByTestId("list-item")
    .filter({ hasText: itemText });
}
```

**Trade-offs**:
- ⚠️ Complex multi-step selection
- ⚠️ Performance cost of page navigation
- ✅ Handles items on any page

---

## Tables and Data

### Pattern: Table Row by Cell Content

**Use case**: Selecting specific row from data table

**Stability**: ⭐⭐⭐⭐⭐

**Verdex exploration**:
```javascript
resolve_container(ref)
// Level 1: tr
// Level 2: tbody
// Level 3: table with data-testid

inspect_pattern(ref, ancestorLevel=2)
// See all rows
```

**Selector**:
```javascript
// Best: Table scope + row filter
page.getByTestId("users-table")
    .getByRole("row")
    .filter({ hasText: "john@example.com" })

// With cell action:
page.getByTestId("users-table")
    .getByRole("row")
    .filter({ hasText: "john@example.com" })
    .getByRole("button", { name: "Edit" })

// Multiple filters for specificity:
page.getByTestId("orders-table")
    .getByRole("row")
    .filter({ hasText: "ORD-2024-001" })
    .filter({ hasText: "Completed" })
    .getByRole("button", { name: "View" })
```

**Trade-offs**:
- ✅ Very stable
- ✅ Content-based identification
- ✅ Survives row reordering
- ⚠️ Requires unique cell content

---

### Pattern: Specific Table Cell

**Use case**: Reading or interacting with specific cell

**Stability**: ⭐⭐⭐⭐

**Selector**:
```javascript
// Best: Row + column identification
page.getByRole("row")
    .filter({ hasText: "john@example.com" })
    .getByRole("cell", { name: "Admin" })

// By column header (if structured properly):
const headers = await page.getByRole("columnheader").allTextContents();
const emailIndex = headers.indexOf("Email");
const row = page.getByRole("row").filter({ hasText: "john@example.com" });
const cells = await row.getByRole("cell").all();
const emailCell = cells[emailIndex];

// Simpler: Direct cell selection
page.getByRole("row")
    .filter({ hasText: "john@example.com" })
    .locator("td")
    .nth(2)  // If column position is stable
```

**Trade-offs**:
- ✅ Precise cell targeting
- ⚠️ Column position-dependent if using nth()
- ✅ Content-based row finding

---

### Pattern: Sort Table by Column

**Use case**: Clicking column header to sort

**Stability**: ⭐⭐⭐⭐

**Selector**:
```javascript
// Best: Column header role
page.getByRole("columnheader", { name: "Email" }).click();

// With test ID:
page.getByTestId("users-table")
    .getByRole("columnheader", { name: "Email" })
    .click();

// Check sort direction:
const sortButton = page.getByRole("columnheader", { name: "Email" })
    .getByRole("button");
await expect(sortButton).toHaveAttribute("aria-sort", "ascending");
```

**Trade-offs**:
- ✅ Semantic column header
- ✅ Accessible
- ⚠️ May need to handle sort state

---

## Modals and Dialogs

### Pattern: Modal Interaction

**Use case**: Interacting with elements inside modals

**Stability**: ⭐⭐⭐⭐⭐

**Verdex exploration**:
```javascript
resolve_container(ref)
// Find: role="dialog" or data-testid="modal"
```

**Selector**:
```javascript
// Best: Dialog role
const modal = page.getByRole("dialog");
await modal.getByLabel("Email").fill("user@example.com");
await modal.getByRole("button", { name: "Submit" }).click();

// Good: Test ID
const modal = page.getByTestId("confirmation-modal");
await modal.getByRole("button", { name: "Confirm" }).click();

// With title:
const modal = page.getByRole("dialog", { name: "Delete Account" });
await modal.getByRole("button", { name: "Delete" }).click();
```

**Trade-offs**:
- ✅ Clear scope isolation
- ✅ Semantic dialog role
- ✅ Prevents false matches with page content
- ⚠️ Modal must have proper role

---

### Pattern: Dismissing Modal

**Use case**: Closing modal via button or overlay

**Stability**: ⭐⭐⭐⭐

**Selector**:
```javascript
// Best: Close button by role
page.getByRole("dialog")
    .getByRole("button", { name: /close|cancel|dismiss/i })
    .click();

// Good: Specific test ID
page.getByTestId("modal-close-button").click();

// Backdrop click (if supported):
page.locator('[data-testid="modal-backdrop"]').click();

// ESC key (most universal):
await page.keyboard.press("Escape");
```

**Trade-offs**:
- ✅ Multiple dismissal methods
- ⚠️ Test all supported methods
- ✅ ESC is often most reliable

---

## Cards and Panels

### Pattern: Card Selection

**Use case**: Interacting with one card among many

**Stability**: ⭐⭐⭐⭐⭐

**Verdex exploration**:
```javascript
inspect_pattern(ref, ancestorLevel=1)
// See all cards

extract_anchors(ref, ancestorLevel=1)
// Find unique identifiers
```

**Selector**:
```javascript
// Best: Test ID + content filter
page.getByTestId("card")
    .filter({ hasText: "Premium Plan" })
    .getByRole("button", { name: "Select Plan" })

// Good: Semantic article + filter
page.locator("article")
    .filter({ hasText: "Premium Plan" })
    .getByRole("button", { name: "Select Plan" })

// Multiple filters for specificity:
page.getByTestId("pricing-card")
    .filter({ hasText: "Premium Plan" })
    .filter({ hasText: "$99/month" })
    .getByRole("button", { name: "Select" })
```

**Trade-offs**:
- ✅ Content-based identification
- ✅ Survives reordering
- ⚠️ Needs unique content per card

---

### Pattern: Collapsible Panel/Accordion

**Use case**: Expanding/collapsing sections

**Stability**: ⭐⭐⭐⭐

**Selector**:
```javascript
// Best: Button with expanded state
await page.getByRole("button", { name: "Shipping Details" })
    .click();

// Check expansion state:
const button = page.getByRole("button", { name: "Shipping Details" });
await expect(button).toHaveAttribute("aria-expanded", "true");

// Access content within expanded panel:
await page.getByRole("region", { name: "Shipping Details" })
    .getByLabel("Address")
    .fill("123 Main St");
```

**Trade-offs**:
- ✅ Semantic button/region roles
- ✅ ARIA state tracking
- ⚠️ Must wait for expansion animation

---

## Menus and Dropdowns

### Pattern: Context Menu

**Use case**: Right-click menu interactions

**Stability**: ⭐⭐⭐⭐

**Selector**:
```javascript
// Trigger context menu
await page.getByTestId("file-item")
    .filter({ hasText: "document.pdf" })
    .click({ button: "right" });

// Select menu item
await page.getByRole("menu")
    .getByRole("menuitem", { name: "Delete" })
    .click();

// Nested menu:
await page.getByRole("menu")
    .getByRole("menuitem", { name: "Share" })
    .hover();
await page.getByRole("menu")
    .getByRole("menuitem", { name: "Email" })
    .click();
```

**Trade-offs**:
- ✅ Semantic menu roles
- ⚠️ May need hover for submenus
- ⚠️ Timing-sensitive

---

### Pattern: Dropdown Menu (Button Trigger)

**Use case**: Menu triggered by button

**Stability**: ⭐⭐⭐⭐⭐

**Selector**:
```javascript
// Best: Button + menu roles
await page.getByRole("button", { name: "Actions" }).click();
await page.getByRole("menu")
    .getByRole("menuitem", { name: "Edit" })
    .click();

// With test IDs:
await page.getByTestId("actions-dropdown").click();
await page.getByTestId("dropdown-menu")
    .getByRole("menuitem", { name: "Edit" })
    .click();
```

**Trade-offs**:
- ✅ Clear trigger + action pattern
- ✅ Semantic roles
- ⚠️ Menu may appear/disappear

---

## Tabs and Accordions

### Pattern: Tab Selection

**Use case**: Switching between tabs

**Stability**: ⭐⭐⭐⭐⭐

**Selector**:
```javascript
// Best: Tab role
await page.getByRole("tab", { name: "Profile" }).click();

// Access tab panel:
const panel = page.getByRole("tabpanel", { name: "Profile" });
await panel.getByLabel("Bio").fill("My bio text");

// Check selected state:
await expect(page.getByRole("tab", { name: "Profile" }))
    .toHaveAttribute("aria-selected", "true");
```

**Trade-offs**:
- ✅ Semantic tab/tabpanel roles
- ✅ Clear navigation
- ✅ ARIA state tracking
- ⚠️ Requires proper ARIA implementation

---

### Pattern: Accordion Item

**Use case**: Expanding accordion sections

**Stability**: ⭐⭐⭐⭐

**Selector**:
```javascript
// Expand section
await page.getByRole("button", { name: "Payment Methods" }).click();

// Verify expanded
const button = page.getByRole("button", { name: "Payment Methods" });
await expect(button).toHaveAttribute("aria-expanded", "true");

// Interact with content
const section = page.getByRole("region", { name: "Payment Methods" });
await section.getByLabel("Card Number").fill("4242424242424242");
```

**Trade-offs**:
- ✅ Semantic roles
- ✅ State management via ARIA
- ⚠️ Animation timing

---

## Buttons and Actions

### Pattern: Primary Action Button

**Use case**: Main call-to-action

**Stability**: ⭐⭐⭐⭐⭐

**Selector**:
```javascript
// Best: Role with name
page.getByRole("button", { name: "Add to Cart" })

// With container scope:
page.getByTestId("product-details")
    .getByRole("button", { name: "Add to Cart" })

// Icon button with aria-label:
page.getByRole("button", { name: "Add to Favorites" })
```

**Trade-offs**:
- ✅ Semantic and accessible
- ✅ Self-documenting
- ⚠️ Scope if multiple buttons with same name

---

### Pattern: Icon-Only Button

**Use case**: Buttons without text labels

**Stability**: ⭐⭐⭐⭐

**Selector**:
```javascript
// Best: Button with aria-label
page.getByRole("button", { name: "Close" })
page.getByRole("button", { name: "Settings" })

// Test ID as fallback:
page.getByTestId("close-button")

// Scoped icon button:
page.getByTestId("notification")
    .getByRole("button", { name: "Dismiss" })
```

**Trade-offs**:
- ✅ Requires proper aria-label
- ⚠️ Fallback to test ID if label missing
- ✅ Enforces accessibility

---

### Pattern: Button Group/Toggle

**Use case**: Related button actions

**Stability**: ⭐⭐⭐⭐

**Selector**:
```javascript
// In button group
page.getByRole("group", { name: "View Options" })
    .getByRole("button", { name: "Grid" })
    .click();

// Toggle button with pressed state:
const toggle = page.getByRole("button", { name: "Bold" });
await toggle.click();
await expect(toggle).toHaveAttribute("aria-pressed", "true");
```

**Trade-offs**:
- ✅ Semantic group/button roles
- ✅ State tracking
- ⚠️ Requires proper ARIA

---

## Notifications and Alerts

### Pattern: Dismissible Notification

**Use case**: Closing notification/toast messages

**Stability**: ⭐⭐⭐

**Verdex exploration**:
```javascript
inspect_pattern(ref, ancestorLevel=1)
// Multiple notifications may exist
```

**Selector**:
```javascript
// Best: Specific notification by content
page.getByTestId("notification")
    .filter({ hasText: "Order placed successfully" })
    .getByRole("button", { name: /close|dismiss/i })
    .click();

// All notifications:
await page.getByTestId("notification")
    .getByRole("button", { name: "Dismiss" })
    .first()
    .click();

// By role:
page.getByRole("alert")
    .filter({ hasText: "Error occurred" })
    .getByRole("button", { name: "Close" })
    .click();
```

**Trade-offs**:
- ⚠️ Timing-sensitive (auto-dismiss)
- ⚠️ Multiple simultaneous notifications
- ✅ Content-based identification

---

### Pattern: Alert Dialog (Blocking)

**Use case**: Confirmation dialogs that block interaction

**Stability**: ⭐⭐⭐⭐⭐

**Selector**:
```javascript
// Best: Alert dialog role
page.getByRole("alertdialog")
    .getByRole("button", { name: "Confirm" })
    .click();

// With title:
page.getByRole("alertdialog", { name: "Delete Account?" })
    .getByRole("button", { name: "Delete" })
    .click();
```

**Trade-offs**:
- ✅ Semantic alert role
- ✅ Clear blocking behavior
- ✅ Accessible by default

---

## Anti-Patterns to Avoid

### ❌ Deep CSS Selectors

**Bad**:
```javascript
page.locator("div.container > div.row > div.col-6 > div.card > button.btn")
```

**Why**: Brittle, breaks on styling changes

**Good**:
```javascript
page.getByTestId("card").getByRole("button", { name: "Action" })
```

---

### ❌ nth() Without Documentation

**Bad**:
```javascript
page.locator("button").nth(5)
```

**Why**: No semantic meaning, breaks on reorder

**Good**:
```javascript
page.getByTestId("product-card")
    .filter({ hasText: "iPhone" })
    .getByRole("button")
```

---

### ❌ XPath for Simple Selections

**Bad**:
```javascript
page.locator("//div[@class='product']/button")
```

**Why**: Less readable, not better than CSS for simple cases

**Good**:
```javascript
page.getByTestId("product").getByRole("button")
```

---

### ❌ Over-Reliance on Classes

**Bad**:
```javascript
page.locator(".btn.btn-primary.btn-lg.action-button")
```

**Why**: CSS classes change frequently

**Good**:
```javascript
page.getByRole("button", { name: "Submit" })
```

---

## Pattern Selection Decision Tree

```
Start: Need to select element
  ↓
Q: Is it a form input?
  YES → Use getByLabel() or getByPlaceholder()
  NO  → Continue
  ↓
Q: Does it have a clear semantic role?
  YES → Use getByRole() with name
  NO  → Continue
  ↓
Q: Are there multiple similar elements?
  YES → Use container scope + filter()
  NO  → Continue
  ↓
Q: Does container have data-testid?
  YES → Use getByTestId() as base
  NO  → Use structural locator()
  ↓
Q: Need to differentiate among siblings?
  YES → Add .filter({ hasText })
  NO  → Done
  ↓
Result: Stable, semantic selector
```

---

## Summary: Selector Hierarchy

**Priority order** (use highest applicable):

1. **getByLabel()** - For form inputs with labels
2. **getByRole()** - For semantic elements (buttons, links, headings)
3. **getByTestId()** - For containers and specific components
4. **getByText()/filter({ hasText })** - For unique content identification
5. **locator()** - For structural relationships (use sparingly)
6. **nth()/first()/last()** - Only when order is truly semantic

**Golden rule**: Prefer semantic meaning over structural position.


