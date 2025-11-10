import { test, expect } from "@playwright/test";

/**
 * Test: Verdex MCP Exploration - Scenario 1 (Well-Structured)
 *
 * Exploration Summary:
 * - Used browser_snapshot() → Found 6 "Add to Cart" buttons (e25-e30)
 * - Used resolve_container(e25) → Found data-testid="product-card" at Level 2
 * - Used inspect_pattern(e25, 2) → Confirmed 6 product cards with unique names
 *
 * Token Cost: ~1,200 tokens (snapshot + resolve_container + inspect_pattern)
 *
 * Selector Strategy:
 * Option 1 (Simplest): Check if button + text filter is unique
 * Option 2 (Fallback): Scope with test ID if needed
 */

test.describe("Verdex Selector Validation - Scenario 1", () => {
  test('should click "Add to Cart" for iPhone 15 Pro using correct selector pattern', async ({
    page,
  }) => {
    // Navigate to the well-structured demo page
    await page.goto(
      "file:///Users/johnchildseddy/Desktop/testnexus-codebase/TESTING/verdex-mcp/tests/demo-scenario-1-well-structured.html"
    );

    // CORRECT Pattern: Scope to container first, THEN filter by content, THEN target button
    // This is necessary because filter({ hasText }) looks for text IN the filtered elements,
    // not in their ancestors/siblings. The button text is "Add to Cart", not "iPhone 15 Pro".
    const correctSelector = page
      .getByTestId("product-card")
      .filter({ hasText: "iPhone 15 Pro" })
      .getByRole("button", { name: "Add to Cart" });

    // Verify it returns exactly 1 element (determinism check)
    const count = await correctSelector.count();
    expect(count).toBe(1);

    // Verify it's visible
    await expect(correctSelector).toBeVisible();

    // Click it
    await correctSelector.click();

    console.log("✅ SUCCESS: Correct selector pattern works!");
    console.log(
      '   Selector: page.getByTestId("product-card").filter({ hasText: "iPhone 15 Pro" }).getByRole("button", { name: "Add to Cart" })'
    );
    console.log("   Pattern: Container → Content Filter → Role");
    console.log(
      "   Token cost: ~1,200 tokens (resolve_container + inspect_pattern)"
    );
    console.log('   Verdex found data-testid="product-card" at Level 2');
  });

  test('should click "Add to Cart" for iPhone 15 Pro using test ID scoped selector (fallback)', async ({
    page,
  }) => {
    await page.goto(
      "file:///Users/johnchildseddy/Desktop/testnexus-codebase/TESTING/verdex-mcp/tests/demo-scenario-1-well-structured.html"
    );

    // Strategy 2: Test ID scoped (more specific but unnecessary if simple works)
    const scopedSelector = page
      .getByTestId("product-card")
      .filter({ hasText: "iPhone 15 Pro" })
      .getByRole("button", { name: "Add to Cart" });

    // Verify it returns exactly 1 element
    const count = await scopedSelector.count();
    expect(count).toBe(1);

    // Verify it's visible
    await expect(scopedSelector).toBeVisible();

    // Click it
    await scopedSelector.click();

    console.log("✅ SUCCESS: Scoped selector also works!");
    console.log(
      '   Selector: page.getByTestId("product-card").filter({ hasText: "iPhone 15 Pro" }).getByRole("button", { name: "Add to Cart" })'
    );
    console.log("   Token cost: ~1,200 tokens");
    console.log("   Complexity: MEDIUM (includes test ID scoping)");
  });

  test("should verify selector uniqueness - multiple products", async ({
    page,
  }) => {
    await page.goto(
      "file:///Users/johnchildseddy/Desktop/testnexus-codebase/TESTING/verdex-mcp/tests/demo-scenario-1-well-structured.html"
    );

    // Test that we can uniquely select different products
    const products = [
      "iPhone 15 Pro",
      'MacBook Pro 14"',
      "Samsung Galaxy S24 Ultra",
      "Sony WH-1000XM5 Headphones",
      "Apple Watch Series 9",
    ];

    for (const productName of products) {
      // CORRECT: Container → Content Filter → Role
      const selector = page
        .getByTestId("product-card")
        .filter({ hasText: productName })
        .getByRole("button", { name: "Add to Cart" });

      const count = await selector.count();
      expect(count).toBe(1);
      await expect(selector).toBeVisible();

      console.log(`✅ Product "${productName}" → Unique selector found`);
    }

    console.log(
      "\n✅ ALL PRODUCTS: Container-scoped pattern works universally"
    );
    console.log(
      '   Pattern: page.getByTestId("product-card").filter({ hasText: PRODUCT_NAME }).getByRole("button", { name: "Add to Cart" })'
    );
  });

  test('should handle disabled "Out of Stock" button correctly', async ({
    page,
  }) => {
    await page.goto(
      "file:///Users/johnchildseddy/Desktop/testnexus-codebase/TESTING/verdex-mcp/tests/demo-scenario-1-well-structured.html"
    );

    // Out of Stock button should be unique by text alone
    const outOfStockButton = page.getByRole("button", { name: "Out of Stock" });

    // Verify it's unique
    const count = await outOfStockButton.count();
    expect(count).toBe(1);

    // Verify it's disabled
    await expect(outOfStockButton).toBeDisabled();

    console.log(
      "✅ SUCCESS: Out of Stock button is unique and properly disabled"
    );
    console.log(
      '   Selector: page.getByRole("button", { name: "Out of Stock" })'
    );
    console.log("   Complexity: SIMPLEST (no scoping or filtering needed)");
  });
});
