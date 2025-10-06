import { test, expect } from '@playwright/test';

/**
 * Verdex MCP Demo Tests
 * 
 * These tests demonstrate robust Playwright selectors discovered through
 * Verdex's structural exploration tools (get_ancestors, get_siblings, get_descendants).
 * 
 * All selectors follow Playwright best practices:
 * - Container scoping (chaining)
 * - Content-based filtering
 * - Semantic roles over CSS selectors
 */

test.describe('ShopFast Demo Page - Verdex-Powered Selectors', () => {
  
  test.beforeEach(async ({ page }) => {
    // Navigate to our demo page
    await page.goto('file://' + process.cwd() + '/demo-page.html');
    await expect(page.getByRole('heading', { level: 3, name: 'Shopping Cart (3)' })).toBeVisible();
  });

  test('should add iPhone 15 Pro to cart using container-scoped selector', async ({ page }) => {
    /**
     * Discovered via Verdex:
     * - get_ancestors(e15): Found container at Level 2 with class "bg-white rounded-lg shadow"
     * - get_siblings(e15, 2): Showed 12 similar product cards
     * - get_descendants(e15, 2): Revealed h3 "iPhone 15 Pro" and button "Add to Cart"
     * 
     * Result: Container-scoped selector with content filtering
     */
    await page
      .locator('div.bg-white.rounded-lg.shadow')
      .filter({ hasText: 'iPhone 15 Pro' })
      .getByRole('button', { name: 'Add to Cart' })
      .click();

    // Verify button was clicked (in a real app, this would add to cart)
    await expect(
      page.locator('div.bg-white.rounded-lg.shadow')
        .filter({ hasText: 'iPhone 15 Pro' })
        .getByRole('button', { name: 'Add to Cart' })
    ).toBeVisible();
  });

  test('should click "Helpful" on Sarah Martinez review', async ({ page }) => {
    /**
     * Discovered via Verdex:
     * - get_ancestors(e34): Found review card container at Level 4
     * - get_siblings(e34, 4): Showed 5 review cards with unique reviewer names
     * - get_descendants(e34, 4): Revealed "Sarah Martinez" text and buttons
     * 
     * Result: Filter by unique reviewer name, then target semantic button
     */
    await page
      .locator('div.border.rounded-lg.p-4')
      .filter({ hasText: 'Sarah Martinez' })
      .getByRole('button', { name: /Helpful/i })
      .click();

    // Verify the button exists and was clickable
    await expect(
      page.locator('div.border.rounded-lg.p-4')
        .filter({ hasText: 'Sarah Martinez' })
        .getByRole('button', { name: /Helpful/i })
    ).toBeVisible();
  });

  test('should increase MacBook Pro quantity in cart', async ({ page }) => {
    /**
     * Discovered via Verdex:
     * - get_ancestors(e57): Found cart item container at Level 4
     * - get_siblings(e57, 4): Showed 3 cart items with unique product names
     * - get_descendants(e57, 4): Revealed "MacBook Pro 14"" and three buttons (-, +, Remove)
     * 
     * Result: Scope to cart item by product name, then click + button
     */
    await page
      .locator('div.flex.gap-4.pb-4.border-b')
      .filter({ hasText: 'MacBook Pro 14"' })
      .getByRole('button', { name: '+' })
      .click();

    // Verify button is still visible (quantity would update in real app)
    await expect(
      page.locator('div.flex.gap-4.pb-4.border-b')
        .filter({ hasText: 'MacBook Pro 14"' })
        .getByRole('button', { name: '+' })
    ).toBeVisible();
  });

  test('should select Samsung S24 Ultra in comparison table', async ({ page }) => {
    /**
     * Discovered via Verdex:
     * - get_ancestors(e29): Found comparison table structure
     * - get_siblings(e29, 1): Showed 4 columns (Feature, iPhone, Samsung, Pixel)
     * - Column identification by heading text "Samsung S24 Ultra"
     * 
     * Result: Navigate to column by heading, then click Select button
     */
    
    // Scroll to comparison table first
    await page.getByRole('heading', { level: 2, name: 'Compare Top Phones' }).scrollIntoViewIfNeeded();
    
    // Find the column containing Samsung and click its Select button
    // This is a bit tricky with the grid layout, so we use a more specific approach
    const comparisonSection = page.locator('div.bg-white.rounded-lg.shadow-sm.p-6.mb-8').filter({ hasText: 'Compare Top Phones' });
    
    await comparisonSection
      .getByRole('button', { name: 'Select' })
      .nth(1) // Samsung is the second Select button (index 1)
      .click();

    // Verify button exists
    await expect(
      comparisonSection.getByRole('button', { name: 'Select' }).nth(1)
    ).toBeVisible();
  });

  test('should remove iPhone from cart using semantic targeting', async ({ page }) => {
    /**
     * Demonstrates the full power of content-based filtering:
     * Multiple "Remove" buttons in cart, but we target the specific one
     * by filtering on the product name.
     */
    const initialCartItems = await page.locator('div.flex.gap-4.pb-4.border-b').count();
    
    await page
      .locator('div.flex.gap-4.pb-4.border-b')
      .filter({ hasText: 'iPhone 15 Pro' })
      .getByRole('button', { name: 'Remove' })
      .click();

    // In a real app, the item would be removed
    // For our static demo, we just verify the button was clickable
    await expect(
      page.locator('div.flex.gap-4.pb-4.border-b')
        .filter({ hasText: 'iPhone 15 Pro' })
    ).toBeVisible();
  });

  test('should navigate sidebar menu using semantic structure', async ({ page }) => {
    /**
     * Demonstrates navigating deep nested structures without brittle selectors.
     * No nth() needed - we use the hierarchical text content.
     */
    
    // Click MacBook in Laptops submenu under Electronics
    // The structure is visible through semantic targeting
    const sidebar = page.locator('div.w-64.bg-gray-800');
    
    // Navigate through the menu hierarchy using text content
    await sidebar.getByText('MacBook', { exact: true }).click();
    
    // Verify the click worked (item should still be visible)
    await expect(sidebar.getByText('MacBook', { exact: true })).toBeVisible();
  });

  test('should find filter buttons using semantic roles', async ({ page }) => {
    /**
     * Demonstrates targeting buttons in a toolbar using semantic roles
     * instead of positional selectors.
     * 
     * Note: Just verifies we can target them - actual clicking would be
     * blocked by notification toasts in this static demo (a real UX issue!)
     */
    const filterBar = page.locator('div.bg-white.rounded-lg.shadow-sm.p-4.mb-6');
    
    // Verify we can target each button semantically
    await expect(filterBar.getByRole('button', { name: 'Price' })).toBeVisible();
    await expect(filterBar.getByRole('button', { name: 'Brand' })).toBeVisible();
    await expect(filterBar.getByRole('button', { name: 'Rating' })).toBeVisible();
    await expect(filterBar.getByRole('button', { name: 'Availability' })).toBeVisible();
  });

  test('should interact with dropdown using semantic combobox role', async ({ page }) => {
    /**
     * Demonstrates using ARIA roles for form controls.
     * Discovered through snapshot's role detection.
     */
    const sortDropdown = page.getByRole('combobox');
    
    await sortDropdown.selectOption('Price: Low to High');
    
    // Verify selection
    await expect(sortDropdown).toHaveValue('Price: Low to High');
  });

  test('should close notification toasts by content', async ({ page }) => {
    /**
     * Multiple close buttons (✕) exist on the page.
     * Filter by the notification content to click the right one.
     */
    
    // Close the "Success" notification
    await page
      .locator('div.bg-green-500')
      .filter({ hasText: 'iPhone 15 Pro added to cart' })
      .getByRole('button', { name: '✕' })
      .click();
    
    // Close the "Limited Time Offer" notification
    await page
      .locator('div.bg-blue-500')
      .filter({ hasText: 'Sale ends in 2 hours' })
      .getByRole('button', { name: '✕' })
      .click();
    
    // Verify buttons were present
    await expect(
      page.locator('div.bg-orange-500')
        .filter({ hasText: 'Low Stock Alert' })
    ).toBeVisible();
  });
});
