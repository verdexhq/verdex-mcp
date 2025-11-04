# Multi-Role Testing with Verdex

Guide for testing complex E2E flows involving multiple authenticated user types using Verdex's role isolation features.

---

## Overview

Multi-role testing enables you to verify interactions between different user types (admin, user, customer, guest) within a single test flow. Verdex uses isolated browser contexts to maintain separate sessions without auth/data leakage.

**Use cases**:
- Admin creates content → User sees content
- Provider adds product → Customer purchases product
- Manager approves request → Employee receives notification
- Admin changes settings → All users see updated UI

---

## Configuration

### 1. Create Authentication Files

Use Playwright's `storageState` format to capture authenticated sessions:

```javascript
// auth.setup.ts
import { test as setup } from '@playwright/test';

setup('admin auth', async ({ page }) => {
  await page.goto('https://example.com/admin/login');
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('admin_password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('https://example.com/admin/dashboard');
  
  // Save admin session
  await page.context().storageState({ 
    path: 'playwright/.auth/admin.json' 
  });
});

setup('user auth', async ({ page }) => {
  await page.goto('https://example.com/login');
  await page.getByLabel('Email').fill('user@example.com');
  await page.getByLabel('Password').fill('user_password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('https://example.com/dashboard');
  
  // Save user session
  await page.context().storageState({ 
    path: 'playwright/.auth/user.json' 
  });
});
```

Run setup:
```bash
npx playwright test auth.setup.ts
```

### 2. Configure Verdex MCP with Roles

Add role configuration to your MCP settings:

```json
{
  "mcpServers": {
    "verdex": {
      "command": "npx",
      "args": [
        "@verdex/mcp@latest",
        "--role", "admin", "./playwright/.auth/admin.json", "https://example.com/admin",
        "--role", "user", "./playwright/.auth/user.json", "https://example.com/app"
      ]
    }
  }
}
```

**Parameters**:
- `--role <name> <auth_file> <default_url>`
- `name`: Role identifier (admin, user, customer, etc.)
- `auth_file`: Path to Playwright storageState JSON
- `default_url`: Default URL when selecting this role

---

## Role Management Tools

### `list_current_roles`

Shows all configured roles and their default URLs.

```javascript
list_current_roles()

// Returns:
{
  "roles": [
    { "name": "default", "defaultUrl": "about:blank", "isActive": false },
    { "name": "admin", "defaultUrl": "https://example.com/admin", "isActive": true },
    { "name": "user", "defaultUrl": "https://example.com/app", "isActive": false }
  ]
}
```

### `get_current_role`

Returns the currently active role.

```javascript
get_current_role()

// Returns:
{
  "currentRole": "admin",
  "defaultUrl": "https://example.com/admin"
}
```

### `select_role`

Switch to a different role context.

```javascript
select_role("user")

// Switches to user context with user authentication
// All subsequent operations use this context
```

---

## Multi-Role Testing Patterns

### Pattern 1: Admin Creates → User Views

**Scenario**: Admin creates a promotional discount, user sees it on product page.

```javascript
// ====================
// Step 1: Admin creates promo
// ====================
select_role("admin")
browser_navigate("https://example.com/admin/promotions")

// Explore and create promotion
resolve_container(ref="e1")  // Find "New Promotion" button container
browser_click("e1")      // Click "New Promotion"

// Fill form
browser_type("e2", "SAVE20")         // Promo code
browser_type("e3", "20")             // Discount percentage
browser_click("e4")                   // Save button

// Wait for creation
wait_for_browser(1000)

// ====================
// Step 2: User sees promo
// ====================
select_role("user")
browser_navigate("https://example.com/products/iphone-15")

// Verify promo banner appears
browser_snapshot()
// Should show: banner "Save 20% with code SAVE20"

// Generate verification selector
resolve_container(ref="e5")  // Banner ref
// Create stable selector for Playwright test:
// page.getByTestId("promo-banner")
//     .getByText("Save 20% with code SAVE20")
```

**Corresponding Playwright test**:
```javascript
test('admin creates promo, user sees it', async ({ page, context }) => {
  // Admin creates
  await context.clearCookies();
  await context.addCookies(adminCookies);
  await page.goto('https://example.com/admin/promotions');
  await page.getByRole('button', { name: 'New Promotion' }).click();
  await page.getByLabel('Code').fill('SAVE20');
  await page.getByLabel('Discount %').fill('20');
  await page.getByRole('button', { name: 'Save' }).click();
  
  // User views
  await context.clearCookies();
  await context.addCookies(userCookies);
  await page.goto('https://example.com/products/iphone-15');
  await expect(
    page.getByTestId('promo-banner')
  ).toContainText('Save 20% with code SAVE20');
});
```

---

### Pattern 2: Provider Adds Product → Customer Purchases

**Scenario**: Marketplace where provider adds product, customer buys it.

```javascript
// ====================
// Step 1: Provider adds product
// ====================
select_role("provider")
browser_navigate("https://example.com/provider/products")

browser_click("e1")  // "Add Product" button

// Fill product form
browser_type("e2", "Handmade Pottery Vase")
browser_type("e3", "Beautiful ceramic vase")
browser_type("e4", "49.99")
browser_click("e5")  // Publish button

// ====================
// Step 2: Customer searches
// ====================
select_role("customer")
browser_navigate("https://example.com/marketplace")

browser_type("e6", "pottery vase")  // Search box
browser_click("e7")                  // Search button

// Verify product appears
browser_snapshot()
// Shows: heading "Handmade Pottery Vase"

// ====================
// Step 3: Customer purchases
// ====================
resolve_container(ref="e8")  // Product card ref
// Find: data-testid="product-card" at level 1

browser_click("e8")  // Click product

// Add to cart
resolve_container(ref="e9")  // "Add to Cart" button
browser_click("e9")

// Checkout
browser_click("e10")  // Checkout button
// ... complete checkout flow
```

---

### Pattern 3: Manager Approves → Employee Sees Status

**Scenario**: Employee submits request, manager approves, employee sees approval.

```javascript
// ====================
// Step 1: Employee submits
// ====================
select_role("employee")
browser_navigate("https://example.com/requests/new")

browser_type("e1", "Need new laptop")
browser_click("e2")  // Submit

// Store request ID from URL or page
// https://example.com/requests/123
const requestId = "123"

// ====================
// Step 2: Manager approves
// ====================
select_role("manager")
browser_navigate(`https://example.com/manager/requests/${requestId}`)

// Explore approval button
resolve_container(ref="e3")
browser_click("e3")  // Approve button

// Confirm
browser_click("e4")  // Confirm modal button

// ====================
// Step 3: Employee sees approval
// ====================
select_role("employee")
browser_navigate(`https://example.com/requests/${requestId}`)

// Verify status changed
browser_snapshot()
// Should show: status "Approved"
```

---

### Pattern 4: Admin Changes Settings → All Users Affected

**Scenario**: Admin enables feature flag, all users see new feature.

```javascript
// ====================
// Step 1: Verify feature hidden
// ====================
select_role("user")
browser_navigate("https://example.com/dashboard")

browser_snapshot()
// Confirm: No "AI Assistant" button visible

// ====================
// Step 2: Admin enables feature
// ====================
select_role("admin")
browser_navigate("https://example.com/admin/features")

// Find and toggle AI Assistant
resolve_container(ref="e1")  // Toggle switch ref
browser_click("e1")       // Enable

// ====================
// Step 3: User sees new feature
// ====================
select_role("user")
browser_navigate("https://example.com/dashboard")  // Refresh

browser_snapshot()
// Should show: button "AI Assistant" [ref=e2]

// Generate selector for verification
resolve_container(ref="e2")
// Create test: page.getByRole('button', { name: 'AI Assistant' })
```

---

## Best Practices

### 1. Always Verify Initial State

Before making changes in one role, verify the expected initial state in other roles.

```javascript
// ✅ Good: Verify before and after
select_role("user")
browser_snapshot()  // Confirm no promo banner

select_role("admin")
// ... create promo

select_role("user")
browser_navigate(url)  // Refresh
browser_snapshot()  // Verify promo banner appears

// ❌ Bad: Only check after
select_role("admin")
// ... create promo

select_role("user")
browser_snapshot()  // What if promo was already there?
```

### 2. Use Explicit Navigation After Role Switch

Always navigate after switching roles to ensure you're on the correct page for that role.

```javascript
// ✅ Good
select_role("admin")
browser_navigate("https://example.com/admin/dashboard")

// ❌ Bad: No navigation, might be on wrong page
select_role("admin")
browser_click("e1")  // What page are we on?
```

### 3. Capture Identifiers for Cross-Role References

Store IDs, codes, or unique identifiers when creating resources so other roles can reference them.

```javascript
// Admin creates with code "SAVE20"
select_role("admin")
browser_type("e1", "SAVE20")  // Store this code
const promoCode = "SAVE20"

// User searches for code
select_role("user")
browser_type("e2", promoCode)  // Use stored code
```

### 4. Wait for Propagation

Some systems have eventual consistency. Add waits when necessary.

```javascript
select_role("admin")
browser_click("e1")  // Publish

// Wait for database propagation
wait_for_browser(2000)

select_role("user")
browser_navigate(url)  // Now should see changes
```

### 5. Clean Up Between Test Runs

If running multiple tests, clean up created resources to avoid interference.

```javascript
// At end of test flow
select_role("admin")
browser_navigate(`https://example.com/admin/promotions/${promoId}`)
browser_click("deleteButton")  // Clean up
```

---

## Role Isolation Architecture

### How Isolation Works

Each role runs in its own **incognito browser context**:

```
Browser Instance
├── Default Context (role: "default")
│   └── Empty session
│
├── Incognito Context (role: "admin")
│   ├── Cookies from admin.json
│   ├── localStorage from admin.json
│   └── Isolated CDP session
│
└── Incognito Context (role: "user")
    ├── Cookies from user.json
    ├── localStorage from user.json
    └── Isolated CDP session
```

**What's isolated**:
- ✅ Cookies
- ✅ localStorage
- ✅ sessionStorage
- ✅ IndexedDB
- ✅ Service workers
- ✅ Cache storage

**What's NOT isolated**:
- ❌ Browser extensions
- ❌ Browser-level settings
- ❌ DNS cache (shared by OS)

### Session Persistence

Sessions persist for the lifetime of the MCP server:

```javascript
// First interaction
select_role("admin")
browser_navigate("https://example.com/admin")
// Admin session established

// ... many operations later ...

// Session still active
select_role("admin")  // Switches back
browser_navigate("https://example.com/admin/settings")
// Still logged in as admin, no re-auth needed
```

---

## Common Workflows

### Workflow 1: Create → Verify → Edit → Verify

```javascript
// 1. Create (Admin)
select_role("admin")
browser_navigate(createUrl)
// ... create resource

// 2. Verify (User)
select_role("user")
browser_navigate(viewUrl)
// ... verify visible

// 3. Edit (Admin)
select_role("admin")
browser_navigate(editUrl)
// ... modify resource

// 4. Verify Changes (User)
select_role("user")
browser_navigate(viewUrl)
// ... verify changes visible
```

### Workflow 2: Parallel User Actions

```javascript
// User A adds to cart
select_role("user_a")
browser_navigate(productUrl)
browser_click(addToCartButton)

// User B adds same product
select_role("user_b")
browser_navigate(productUrl)
browser_click(addToCartButton)

// Verify: Both have separate carts
select_role("user_a")
// ... verify cart has 1 item

select_role("user_b")
// ... verify cart has 1 item (not 2)
```

### Workflow 3: Permission Testing

```javascript
// User tries admin action (should fail)
select_role("user")
browser_navigate("https://example.com/admin/users")

browser_snapshot()
// Should show: "Access Denied" or redirect

// Admin performs same action (should succeed)
select_role("admin")
browser_navigate("https://example.com/admin/users")

browser_snapshot()
// Should show: users table
```

---

## Troubleshooting

### Problem: Role switch doesn't preserve auth

**Cause**: Auth file may be invalid or expired

**Solution**: Regenerate auth files
```bash
npx playwright test auth.setup.ts
```

### Problem: Changes not visible in other role

**Cause**: Page not refreshed after role switch

**Solution**: Always navigate after switching
```javascript
select_role("user")
browser_navigate(url)  // Force refresh
```

### Problem: Contexts interfering with each other

**Cause**: Shared browser-level state (rare)

**Solution**: Restart Verdex MCP server to get fresh browser instance

### Problem: Can't switch back to previous role

**Cause**: Role name typo

**Solution**: Use `list_current_roles()` to see exact role names

---

## Integration with Playwright Tests

After using Verdex to explore and verify multi-role flows, translate to Playwright using fixtures:

```javascript
// playwright.config.ts
export default defineConfig({
  projects: [
    {
      name: 'admin',
      use: { 
        storageState: 'playwright/.auth/admin.json',
        baseURL: 'https://example.com/admin'
      }
    },
    {
      name: 'user',
      use: { 
        storageState: 'playwright/.auth/user.json',
        baseURL: 'https://example.com'
      }
    }
  ]
});

// test.spec.ts
test('multi-role flow', async ({ browser }) => {
  // Create contexts with different auth
  const adminContext = await browser.newContext({
    storageState: 'playwright/.auth/admin.json'
  });
  const userContext = await browser.newContext({
    storageState: 'playwright/.auth/user.json'
  });
  
  const adminPage = await adminContext.newPage();
  const userPage = await userContext.newPage();
  
  // Admin creates
  await adminPage.goto('/admin/promotions');
  await adminPage.getByRole('button', { name: 'New' }).click();
  // ...
  
  // User views
  await userPage.goto('/products');
  await expect(userPage.getByTestId('promo-banner')).toBeVisible();
  
  await adminContext.close();
  await userContext.close();
});
```

---

## Summary

**Key concepts**:
1. Each role = isolated browser context with separate auth
2. Use `select_role()` to switch contexts
3. Always navigate after switching roles
4. Verify initial state before making changes
5. Use Verdex to explore, Playwright to execute

**Pattern**:
```
select_role(actor)
  → browser_navigate(url)
  → explore with resolve_container/siblings/descendants
  → browser_click/browser_type
  → repeat for other actors
  → translate to Playwright test
```

