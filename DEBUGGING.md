# Debugging Verdex and Playwright Selectors

Comprehensive troubleshooting guide for common selector issues, exploration problems, and test failures.

---

## Quick Diagnosis Guide

| Symptom | Likely Cause | Quick Fix | Detailed Section |
|---------|--------------|-----------|------------------|
| "Element not found" | Selector too specific or wrong structure | Re-explore with `resolve_container` | [Element Not Found](#element-not-found) |
| "Multiple elements match" | Missing content filter or container scope | Add `.filter({ hasText })` | [Multiple Matches](#multiple-elements-match) |
| "Works once then breaks" | Dynamic content, wrong container | Use more stable container | [Flaky Selectors](#flaky-selectors) |
| "Timeout waiting for element" | Wrong page, timing issue, element hidden | Check visibility, add wait | [Timeouts](#timeout-errors) |
| "nth() selector failing" | Order changed | Replace with content filter | [Position-Based Issues](#position-based-selectors-breaking) |
| "resolve_container returns empty" | Invalid ref or navigation issue | Verify snapshot has ref | [Tool Errors](#tool-errors) |

---

## Element Not Found

### Symptom

```javascript
Error: locator.click: Target closed
Error: locator.click: Error: node is not attached to the document
Error: locator.click: Element not found
```

### Diagnosis Process

**Step 1: Verify the element exists**

```javascript
// Take fresh snapshot
browser_snapshot()

// Check if element appears in snapshot
// Look for expected role/text
```

**Possible causes**:
- Element is on a different page (navigation issue)
- Element is hidden/not rendered
- Wrong selector after DOM changes
- Element inside iframe (not currently supported)

**Step 2: Re-explore structure**

```javascript
// Find element in snapshot (e.g., ref=e5)
resolve_container(ref="e5")

// Check returned structure matches your selector expectations
```

**Step 3: Verify container still exists**

```javascript
// If using data-testid="product-card"
// Check ancestors response confirms this container exists
```

### Common Fixes

#### Fix 1: Element structure changed

**Before** (breaks after refactor):
```javascript
page.getByTestId("old-container")
    .getByRole("button", { name: "Submit" })
```

**After** (re-explored):
```javascript
// resolve_container revealed new structure
page.getByTestId("new-container")
    .locator('[data-testid="form-actions"]')
    .getByRole("button", { name: "Submit" })
```

#### Fix 2: Element is conditionally rendered

**Problem**: Element only appears after certain actions

**Solution**: Add waits or checks
```javascript
// Wait for container to be visible
await page.getByTestId("modal").waitFor({ state: "visible" });

// Then interact with elements inside
await page.getByTestId("modal")
    .getByRole("button", { name: "Confirm" })
    .click();
```

#### Fix 3: Element is in shadow DOM

**Problem**: Verdex doesn't currently support shadow DOM exploration

**Solution**: Use Playwright's piercing selectors
```javascript
// If element is inside shadow root
await page.locator('my-component').locator('button').click();
```

#### Fix 4: Timing issue with dynamic content

**Problem**: Element loads after navigation

**Solution**: Use Verdex waits or Playwright auto-waiting
```javascript
// Verdex exploration
browser_navigate(url)
wait_for_browser(2000)  // Wait for dynamic content
browser_snapshot()      // Get fresh refs

// Playwright test
await page.goto(url);
await page.waitForLoadState("networkidle");
await page.getByTestId("container").waitFor();
```

---

## Multiple Elements Match

### Symptom

```javascript
Error: strict mode violation: locator resolved to 12 elements
```

### Diagnosis Process

**Step 1: Count matches**

```javascript
// In Playwright test
const count = await page.locator(yourSelector).count();
console.log(`Found ${count} elements`);
```

**Step 2: Check sibling patterns**

```javascript
// Use Verdex to understand why there are multiple
inspect_pattern(ref="e3", ancestorLevel=1)

// Response shows multiple similar containers
```

**Step 3: Find unique differentiator**

```javascript
// Explore content in target container
extract_anchors(ref="e3", ancestorLevel=1)

// Look for unique text, attributes, or state
```

### Common Fixes

#### Fix 1: Missing container scope

**Problem**: Selector matches across multiple sections

**Before**:
```javascript
// Matches all product cards on page
page.getByRole("button", { name: "Add to Cart" })
```

**After**:
```javascript
// Scoped to specific section
page.getByTestId("product-card")
    .filter({ hasText: "iPhone 15 Pro" })
    .getByRole("button", { name: "Add to Cart" })
```

#### Fix 2: Missing content filter

**Problem**: Multiple identical-looking elements

**Before**:
```javascript
// Matches all product cards with data-testid
page.getByTestId("product-card")
    .getByRole("button", { name: "Add to Cart" })
```

**After**:
```javascript
// Filter by unique content
page.getByTestId("product-card")
    .filter({ hasText: "iPhone 15 Pro" })  // Unique product name
    .getByRole("button", { name: "Add to Cart" })
```

#### Fix 3: Ambiguous text content

**Problem**: Multiple elements contain the same text

**Before**:
```javascript
// Multiple products might have "Save 20%"
page.getByText("Save 20%")
```

**After**:
```javascript
// Combine multiple filters
page.getByTestId("product-card")
    .filter({ hasText: "iPhone 15 Pro" })
    .filter({ hasText: "Save 20%" })
```

#### Fix 4: Need to select specific instance

**Problem**: Legitimately have multiple matches, need one specific instance

**Solutions**:

```javascript
// Option 1: Use .first() if order is stable
page.getByTestId("notification")
    .first()
    .getByRole("button", { name: "Dismiss" })

// Option 2: Use .last() for most recent
page.getByTestId("notification")
    .last()
    .getByRole("button", { name: "Dismiss" })

// Option 3: Use .filter() with more specific content
page.getByTestId("notification")
    .filter({ hasText: "Order #12345 shipped" })
    .getByRole("button", { name: "Dismiss" })

// Option 4: Use .nth() as last resort
page.getByTestId("notification")
    .nth(0)  // Document why this is necessary
    .getByRole("button", { name: "Dismiss" })
```

---

## Flaky Selectors

### Symptom

Test passes sometimes, fails other times without code changes.

### Common Causes

#### Cause 1: Race conditions

**Problem**: Element state changes during interaction

**Diagnosis**:
```javascript
// Check if element is still loading
browser_snapshot()  // Immediately after navigation
// vs
wait_for_browser(2000)
browser_snapshot()  // After delay
// Compare: Do refs change? Does structure change?
```

**Fix**: Add explicit waits
```javascript
// Wait for specific element to be stable
await page.getByTestId("product-card")
    .filter({ hasText: "iPhone 15 Pro" })
    .waitFor({ state: "visible" });

// Then interact
await page.getByTestId("product-card")
    .filter({ hasText: "iPhone 15 Pro" })
    .getByRole("button", { name: "Add to Cart" })
    .click();
```

#### Cause 2: Client-side hydration reordering

**Problem**: React/Vue hydration changes DOM order

**Diagnosis**:
```javascript
// Compare server-rendered vs client-rendered structure
browser_navigate(url)
browser_snapshot()  // Might show different order after hydration
```

**Fix**: Don't rely on order, use content filtering
```javascript
// ❌ Bad: Position-dependent
page.locator("div").nth(3)

// ✅ Good: Content-dependent
page.locator("div")
    .filter({ hasText: "Unique Content" })
```

#### Cause 3: Animation/transition timing

**Problem**: Element is mid-animation when selector runs

**Fix**: Wait for animations to complete
```javascript
// Option 1: Wait for element to be stable
await page.getByTestId("modal").waitFor({ state: "visible" });
await page.waitForTimeout(300);  // Wait for CSS animation

// Option 2: Disable animations in test mode
// Add to test setup:
await page.addStyleTag({
  content: '*, *::before, *::after { transition: none !important; animation: none !important; }'
});
```

#### Cause 4: Conditional rendering based on data

**Problem**: Element structure differs based on backend state

**Example**: Product card with/without discount badge

**Fix**: Make selector resilient to optional elements
```javascript
// Don't require discount badge to exist
page.getByTestId("product-card")
    .filter({ hasText: "iPhone 15 Pro" })  // Required content
    .getByRole("button", { name: "Add to Cart" })

// Separate test for discount presence
await expect(
  page.getByTestId("product-card")
    .filter({ hasText: "iPhone 15 Pro" })
).toContainText("Save 20%");  // Optional verification
```

---

## Timeout Errors

### Symptom

```javascript
Error: Timeout 30000ms exceeded
Error: waiting for locator('...') to be visible
```

### Diagnosis Process

**Step 1: Verify element exists at all**

```javascript
browser_snapshot()
// Check if element with expected role/text appears
```

**Step 2: Check element visibility**

```javascript
// In Playwright test
const isVisible = await page.locator(yourSelector).isVisible();
const isHidden = await page.locator(yourSelector).isHidden();
console.log({ isVisible, isHidden });
```

**Step 3: Check if element is obscured**

```javascript
// Element might exist but be covered by modal/overlay
const boundingBox = await page.locator(yourSelector).boundingBox();
console.log(boundingBox);  // null if not visible in viewport
```

### Common Fixes

#### Fix 1: Element is hidden by CSS

**Problem**: `display: none` or `visibility: hidden`

**Diagnosis**:
```javascript
// Check computed styles
await page.locator(yourSelector).evaluate(el => ({
  display: window.getComputedStyle(el).display,
  visibility: window.getComputedStyle(el).visibility,
  opacity: window.getComputedStyle(el).opacity
}));
```

**Fix**: Wait for element to become visible or use force option
```javascript
// Option 1: Wait for visibility
await page.getByTestId("content").waitFor({ state: "visible" });

// Option 2: Force click if element is functionally clickable
await page.getByTestId("hidden-trigger").click({ force: true });
```

#### Fix 2: Wrong page or navigation didn't complete

**Problem**: Selector is for page B but you're on page A

**Fix**: Verify URL and add navigation waits
```javascript
// Verify you're on correct page
await page.waitForURL(/\/products\/\d+/);

// Or wait for specific element that indicates page loaded
await page.getByTestId("product-details").waitFor();
```

#### Fix 3: Element loads after async operation

**Problem**: Data fetching delays render

**Fix**: Wait for network to settle
```javascript
// Option 1: Wait for network idle
await page.goto(url);
await page.waitForLoadState("networkidle");

// Option 2: Wait for specific API call
await page.waitForResponse(
  response => response.url().includes('/api/products') && response.status() === 200
);

// Option 3: Wait for loading spinner to disappear
await page.getByTestId("loading-spinner").waitFor({ state: "hidden" });
```

#### Fix 4: Increase timeout for slow operations

**Problem**: Operation legitimately takes longer than default timeout

**Fix**: Increase timeout for specific action
```javascript
// Increase timeout for slow operation
await page.getByRole("button", { name: "Generate Report" })
  .click({ timeout: 60000 });  // 60 second timeout

// Wait for report to be ready
await page.getByTestId("report-content")
  .waitFor({ state: "visible", timeout: 60000 });
```

---

## Position-Based Selectors Breaking

### Symptom

Selectors using `.nth()`, `.first()`, `.last()` suddenly fail or select wrong element.

### Why This Happens

1. **Dynamic content order changes** (sorting, filtering, pagination)
2. **New items added** (new products, notifications, etc.)
3. **Client-side hydration reordering**
4. **A/B testing variations**

### Migration Strategy

#### Step 1: Re-explore with Verdex

```javascript
// Get fresh snapshot
browser_snapshot()
// Note ref of target element (e.g., e5)

// Find stable containers
resolve_container(ref="e5")
// Look for data-testid or semantic containers

// Check sibling patterns
inspect_pattern(ref="e5", ancestorLevel=1)
// Identify what makes each sibling unique

// Mine unique content
extract_anchors(ref="e5", ancestorLevel=1)
// Find text/attributes that distinguish this element
```

#### Step 2: Replace with content-based selector

**Before** (brittle):
```javascript
page.getByRole("button", { name: "Add to Cart" }).nth(3)
```

**After** (stable):
```javascript
page.getByTestId("product-card")
    .filter({ hasText: "iPhone 15 Pro" })
    .getByRole("button", { name: "Add to Cart" })
```

#### Step 3: Document exceptions

If you **must** use `.nth()`, document why:
```javascript
// Note: Using nth() because all notification messages have identical structure
// and we specifically want to dismiss the oldest one (index 0)
// TODO: Add unique IDs to notifications to enable content-based selection
await page.getByTestId("notification")
    .nth(0)
    .getByRole("button", { name: "Dismiss" })
    .click();
```

---

## Tool Errors

### Verdex-Specific Issues

#### Error: "Invalid ref"

**Symptom**:
```
Error: Element reference 'e99' not found
```

**Cause**: Ref from old snapshot, page navigated, or ref doesn't exist

**Fix**:
```javascript
// Take fresh snapshot
browser_snapshot()

// Use refs from THIS snapshot, not old ones
resolve_container(ref="e3")  // Use current ref
```

#### Error: "Level out of range"

**Symptom**:
```
Error: ancestorLevel 10 exceeds maximum depth
```

**Cause**: Requested level is beyond document.body

**Fix**:
```javascript
// Check resolve_container output first
resolve_container(ref="e3")
// Returns levels 1-5

// Use valid level
inspect_pattern(ref="e3", ancestorLevel=3)  // ✅ Valid
inspect_pattern(ref="e3", ancestorLevel=10) // ❌ Too high
```

#### Error: "No siblings found"

**Symptom**: `inspect_pattern` returns empty array

**Cause**: Element is only child at that level

**Fix**:
```javascript
// Try different ancestor level
inspect_pattern(ref="e3", ancestorLevel=1)  // No siblings
inspect_pattern(ref="e3", ancestorLevel=2)  // Might have siblings here
```

---

## Selector Anti-Patterns

### Anti-Pattern 1: Over-Specific Selectors

**Bad**:
```javascript
page.locator("div.container > div.row > div.col-md-6 > div.card > div.card-body > button.btn.btn-primary")
```

**Why bad**: Breaks when any intermediate class changes

**Good**:
```javascript
page.getByTestId("product-card")
    .filter({ hasText: "iPhone 15 Pro" })
    .getByRole("button", { name: "Add to Cart" })
```

### Anti-Pattern 2: XPath Without Good Reason

**Bad**:
```javascript
page.locator("//div[@class='products']/div[3]/button")
```

**Why bad**: Fragile, hard to read, position-dependent

**Good**:
```javascript
page.getByTestId("products")
    .locator("div")
    .filter({ hasText: "Product Name" })
    .getByRole("button")
```

**Exception**: XPath is OK when you need features not available in CSS/role selectors:
```javascript
// Finding element by following-sibling
page.locator("//label[text()='Email']/following-sibling::input")

// Better: Use proper label association
page.getByLabel("Email")
```

### Anti-Pattern 3: Class Name Dependency

**Bad**:
```javascript
page.locator(".btn.btn-primary.btn-lg.product-add-btn")
```

**Why bad**: CSS classes change frequently, especially with CSS-in-JS

**Good**:
```javascript
page.getByRole("button", { name: "Add to Cart" })
// Or with container scope:
page.getByTestId("product-card")
    .getByRole("button", { name: "Add to Cart" })
```

### Anti-Pattern 4: Deep nth() Chains

**Bad**:
```javascript
page.locator("div").nth(2).locator("div").nth(1).locator("button").nth(0)
```

**Why bad**: Ultra-fragile, breaks on any structural change

**Good**:
```javascript
page.getByTestId("product-card")
    .filter({ hasText: "iPhone 15 Pro" })
    .getByRole("button", { name: "Add to Cart" })
```

---

## Debugging Workflow

### Standard Debugging Process

```
1. Reproduce failure
   ↓
2. Take fresh Verdex snapshot
   → browser_snapshot()
   ↓
3. Verify element exists in snapshot
   → Look for expected role/text/ref
   ↓
4. Re-explore structure
   → resolve_container(ref)
   → inspect_pattern(ref, level)
   → extract_anchors(ref, level)
   ↓
5. Compare with existing selector
   → Has container changed?
   → Has content changed?
   → Has structure changed?
   ↓
6. Update selector based on new structure
   ↓
7. Verify in Playwright test
   ↓
8. Document why change was needed
```

### Emergency Fixes

When you need a quick fix and can't re-explore:

#### Quick Fix 1: Add timeout
```javascript
await page.locator(yourSelector).click({ timeout: 60000 });
```

#### Quick Fix 2: Add wait
```javascript
await page.waitForTimeout(2000);
await page.locator(yourSelector).click();
```

#### Quick Fix 3: Force the action
```javascript
await page.locator(yourSelector).click({ force: true });
```

#### Quick Fix 4: Broader selector temporarily
```javascript
// Instead of specific product
await page.getByRole("button", { name: "Add to Cart" }).first().click();
```

**Important**: These are **temporary workarounds**. Always follow up with proper re-exploration and selector fixes.

---

## Testing Selector Stability

### Manual Testing

```javascript
// Test 1: Count matches (should be 1)
console.log(await page.locator(yourSelector).count());

// Test 2: Verify visibility
console.log(await page.locator(yourSelector).isVisible());

// Test 3: Get element info
const element = page.locator(yourSelector);
console.log(await element.getAttribute("class"));
console.log(await element.textContent());

// Test 4: Test on different data
// Navigate to different products/items
// Verify selector still finds correct element
```

### Automated Stability Tests

```javascript
test('selector stability across data variations', async ({ page }) => {
  const products = ['iPhone 15 Pro', 'MacBook Pro', 'iPad Air'];
  
  for (const product of products) {
    await page.goto(`/product/${product}`);
    
    // Verify selector finds exactly one element
    const selector = page.getByTestId("product-details")
      .getByRole("button", { name: "Add to Cart" });
    
    await expect(selector).toHaveCount(1);
    await expect(selector).toBeVisible();
    await selector.click();
    
    // Verify action worked
    await expect(page.getByTestId("cart-count")).toContainText("1");
  }
});
```

---

## Common Verdex Exploration Mistakes

### Mistake 1: Using old refs after navigation

**Wrong**:
```javascript
browser_navigate(url1)
browser_snapshot()  // Shows ref=e3

browser_navigate(url2)  // New page
resolve_container(ref="e3")  // ❌ e3 is from old page
```

**Right**:
```javascript
browser_navigate(url1)
browser_snapshot()  // Shows ref=e3
resolve_container(ref="e3")  // ✅

browser_navigate(url2)
browser_snapshot()  // Get NEW refs
resolve_container(ref="e5")  // ✅ Use new ref
```

### Mistake 2: Wrong ancestor level

**Wrong**:
```javascript
resolve_container(ref="e3")
// Returns levels 1-5

inspect_pattern(ref="e3", ancestorLevel=1)
// Returns: Just this card, no siblings

// Should have tried level 2!
```

**Right**:
```javascript
resolve_container(ref="e3")
// Level 1: div (product card)
// Level 2: section (products grid) ← Try this
// Level 3: main

inspect_pattern(ref="e3", ancestorLevel=2)
// Returns: All product cards ✅
```

### Mistake 3: Not using descendants when needed

**Insufficient exploration**:
```javascript
resolve_container(ref="e3")
// See: data-testid="product-card" at level 1

// Generate selector without unique content:
page.getByTestId("product-card")  // ❌ Matches 12 cards
    .getByRole("button")
```

**Complete exploration**:
```javascript
resolve_container(ref="e3")
inspect_pattern(ref="e3", ancestorLevel=2)  // See multiple cards
extract_anchors(ref="e3", ancestorLevel=1)  // Find unique content

// Generate selector with unique content:
page.getByTestId("product-card")
    .filter({ hasText: "iPhone 15 Pro" })  // ✅ Unique
    .getByRole("button")
```

---

## Getting Help

### Information to Provide

When asking for help with selector issues:

1. **Verdex exploration output**:
   - `browser_snapshot()` result
   - `resolve_container(ref)` result
   - `inspect_pattern(ref, level)` result (if applicable)
   - `extract_anchors(ref, level)` result (if applicable)

2. **Current selector**:
   - What selector you're trying to use
   - What error you're getting

3. **Expected behavior**:
   - What should happen
   - What actually happens

4. **Page context**:
   - URL or page description
   - Any relevant user actions before the failure

### Reporting Issues

If you think you've found a Verdex bug:
1. Provide minimal reproduction steps
2. Include browser/OS versions
3. Share Verdex tool outputs
4. Include relevant HTML snippet if possible

**GitHub Issues**: https://github.com/verdexhq/verdex-mcp/issues

---

## Summary: Debugging Checklist

- [ ] Take fresh snapshot after any navigation
- [ ] Verify element exists in snapshot
- [ ] Re-explore structure with resolve_container
- [ ] Check for sibling patterns with inspect_pattern
- [ ] Find unique content with extract_anchors
- [ ] Use container-scoped selectors, not page-global
- [ ] Prefer content filters over position (nth)
- [ ] Add explicit waits for dynamic content
- [ ] Test selector stability across variations
- [ ] Document any necessary compromises

**Remember**: Most selector issues come from insufficient exploration or relying on brittle patterns (position, classes). When in doubt, re-explore with Verdex's primitives.

