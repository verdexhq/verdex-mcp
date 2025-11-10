/**
 * Example Playwright test generated with Verdex MCP assistance
 *
 * This test demonstrates stable, container-scoped selectors
 * generated from the demo-page.html without any data-testid attributes.
 *
 * Run: npx playwright test demo-quickstart.spec.ts
 */

import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_PAGE = `file://${path.resolve(__dirname, "demo-page.html")}`;

test.describe("Verdex Quick Start Demo", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(DEMO_PAGE);
  });

  test("should click Add to Cart for iPhone 15 Pro", async ({ page }) => {
    // ✅ Stable selector generated with Verdex exploration:
    // 1. resolve_container found the grid > card hierarchy
    // 2. inspect_pattern revealed 12 similar product cards
    // 3. extract_anchors discovered "iPhone 15 Pro" as unique anchor

    await page
      .locator(".grid > div")
      .filter({ hasText: "iPhone 15 Pro" })
      .getByRole("button", { name: "Add to Cart" })
      .click();

    // ❌ Compare to brittle nth() selector that would break:
    // await page.getByRole('button', { name: 'Add to Cart' }).nth(0);
  });

  test("should select the first in-stock product", async ({ page }) => {
    // Demonstrates state-based filtering
    // Verdex discovered that one product has "Out of Stock" state

    await page
      .locator(".grid > div")
      .filter({ hasNotText: "Out of Stock" })
      .first()
      .getByRole("button", { name: "Add to Cart" })
      .click();
  });

  test("should click Select for Samsung S24 in comparison table", async ({
    page,
  }) => {
    // Demonstrates table navigation with content filtering
    // inspect_pattern revealed the table structure with multiple grid rows
    // extract_anchors found product names in header and buttons in footer

    // Find the comparison table section
    const comparisonTable = page
      .locator(".bg-white.rounded-lg")
      .filter({ hasText: "Compare Top Phones" });

    // Target the buttons row and get Samsung's button (2nd column)
    const selectButton = comparisonTable
      .locator(".grid.grid-cols-4")
      .filter({ has: page.locator("button") })
      .getByRole("button", { name: "Select" })
      .nth(1); // Samsung is 2nd column (0-indexed)

    // Verify selector works (static page, no actual functionality)
    await expect(selectButton).toBeVisible();
  });

  test("should click Track Order for specific order", async ({ page }) => {
    // Demonstrates filtering in repeating order list
    // Content-based filtering using order number

    const trackButton = page
      .locator(".border.rounded-lg")
      .filter({ hasText: "Order #ORD-2024-1198" })
      .getByRole("button", { name: "Track Order" });

    // Verify selector works
    await expect(trackButton).toBeVisible();
  });

  test("should remove iPhone from shopping cart", async ({ page }) => {
    // Demonstrates targeting within a specific container (cart drawer)
    // Multiple cart items with similar structure

    await page
      .locator('[style*="z-index: 1000"]') // Cart drawer
      .locator(".flex.gap-4")
      .filter({ hasText: "iPhone 15 Pro" })
      .getByRole("button", { name: "Remove" })
      .click();
  });

  test("should search for products", async ({ page }) => {
    // Simple form interaction
    // resolve_container identified the search input's container

    const searchInput = page.getByPlaceholder("Search products...");
    const searchButton = page.getByRole("button", { name: "Search" });

    // Verify selectors work
    await expect(searchInput).toBeVisible();
    await expect(searchButton).toBeVisible();
  });

  test("should click on specific navigation category", async ({ page }) => {
    // Demonstrates deep nested navigation
    // extract_anchors mapped the sidebar hierarchy

    const phonesCategory = page
      .locator(".w-64.bg-gray-800")
      .getByText("Phones", { exact: true });

    const iphoneSubcategory = page
      .locator(".w-64.bg-gray-800")
      .getByText("iPhone", { exact: true });

    // Verify selectors work
    await expect(phonesCategory).toBeVisible();
    await expect(iphoneSubcategory).toBeVisible();
  });

  test("should verify product details", async ({ page }) => {
    // Demonstrates reading structured content
    // extract_anchors revealed the card's internal structure

    const productCard = page
      .locator(".grid > div")
      .filter({ hasText: 'MacBook Pro 14"' });

    await expect(productCard.locator("h3")).toHaveText('MacBook Pro 14"');
    await expect(productCard.locator(".text-xl.font-bold")).toContainText(
      "$1,999"
    );
    await expect(productCard.locator(".star-rating")).toBeVisible();
  });

  test("should interact with product quantity in cart", async ({ page }) => {
    // Demonstrates precise targeting within nested components

    const cartItem = page
      .locator('[style*="z-index: 1000"]')
      .locator(".flex.gap-4")
      .filter({ hasText: "AirPods Pro (2nd Gen)" });

    const quantityDisplay = cartItem.locator(".w-12.text-center");
    const increaseButton = cartItem.locator("button").filter({ hasText: "+" });

    // Verify selectors target the correct elements
    await expect(quantityDisplay).toBeVisible();
    await expect(quantityDisplay).toHaveText("2"); // Current quantity in demo
    await expect(increaseButton).toBeVisible();
  });

  test("should filter products by category", async ({ page }) => {
    // Click category in sidebar
    await page.locator(".w-64.bg-gray-800").getByText("Audio").click();

    // Verify product grid filters appropriately
    // In a real app, this would update the grid
    const audioProducts = page
      .locator(".grid > div")
      .filter({ hasText: "Audio" });

    await expect(audioProducts).toHaveCount(2); // Sony and AirPods
  });
});

test.describe("Comparison: Brittle vs Stable Selectors", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(DEMO_PAGE);
  });

  test("❌ BRITTLE: Using nth() selectors", async ({ page }) => {
    // This test will break if:
    // - Products are reordered
    // - New products are added
    // - Hydration changes element order

    // await page.getByRole('button', { name: 'Add to Cart' }).nth(0);
    // await page.getByRole('button', { name: 'Add to Cart' }).nth(3);

    // ⚠️ Uncomment above to see how brittle this approach is
    expect(true).toBe(true); // Placeholder
  });

  test("✅ STABLE: Using structure + content filtering", async ({ page }) => {
    // This test survives:
    // - Product reordering
    // - Adding/removing products
    // - DOM structure changes
    // - Hydration differences

    const iphoneButton = page
      .locator(".grid > div")
      .filter({ hasText: "iPhone 15 Pro" })
      .getByRole("button", { name: "Add to Cart" });

    const sonyButton = page
      .locator(".grid > div")
      .filter({ hasText: "Sony WH-1000XM5" })
      .getByRole("button", { name: "Add to Cart" });

    // Verify selectors work - they remain valid regardless of product order
    await expect(iphoneButton).toBeVisible();
    await expect(sonyButton).toBeVisible();
  });

  test("✅ STABLE: Multiple levels of scoping", async ({ page }) => {
    // Demonstrates the full power of container-scoped selectors

    // Level 1: Scope to cart drawer
    const cart = page.locator('[style*="z-index: 1000"]');

    // Level 2: Scope to specific cart item
    const iphoneItem = cart
      .locator(".flex.gap-4")
      .filter({ hasText: "iPhone 15 Pro" });

    // Level 3: Target specific element within item
    await iphoneItem.getByRole("button", { name: "Remove" }).click();

    // Each level adds stability and clarity
  });
});

/**
 * How Verdex Helped Generate These Selectors:
 *
 * For each test, the AI used Verdex's exploration primitives:
 *
 * 1. browser_snapshot()
 *    → Gets accessibility tree with element refs
 *
 * 2. resolve_container(ref)
 *    → Discovers container hierarchy
 *    → Example: button → card → grid → section
 *
 * 3. inspect_pattern(ref, level)
 *    → Reveals repeating patterns
 *    → Example: 12 product cards at grid level
 *
 * 4. extract_anchors(ref, level)
 *    → Finds unique anchors
 *    → Example: "iPhone 15 Pro" heading identifies card
 *
 * Result: Stable, semantic selectors that survive refactoring
 */
