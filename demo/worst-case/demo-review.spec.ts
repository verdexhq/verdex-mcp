import { test, expect } from "@playwright/test";

/**
 * Verdex-Powered E2E Test: Orders and Reviews
 *
 * This test demonstrates robust Playwright selectors discovered through
 * Verdex's structural exploration tools (resolve_container, inspect_pattern).
 *
 * Exploration Summary:
 * - Order cards (e46): resolve_container → Level 3: div.border.rounded-lg.p-4
 *   inspect_pattern → 3 sibling order cards with unique order numbers
 *
 * - Review cards (e32): resolve_container → Level 4-5: div.border.rounded-lg.p-4
 *   inspect_pattern → 5 sibling review cards with unique reviewer names
 *
 * Selector Strategy:
 * All selectors follow: Container → Content Filter → Role pattern
 */

test.describe("ShopFast - Orders and Reviews Management", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to demo page
    await page.goto(
      "file://" + process.cwd() + "/demo/worst-case/demo-page.html"
    );

    // Wait for page to be fully loaded
    await expect(page.getByText("ShopFast")).toBeVisible();

    // Wait for auto-dismiss animations to complete
    // Toast notifications auto-dismiss after 1.5-2.5 seconds
    await page.waitForTimeout(3000);

    // Close shopping cart sidebar if it's blocking content
    // Using Verdex Pattern 2: Container → Content Filter → Role
    // "Shopping Cart (3)" is unique, so this returns exactly 1 element (no .first() needed)
    const cartCloseButton = page
      .locator("div")
      .filter({ hasText: "Shopping Cart (3)" })
      .getByRole("button", { name: "✕" });

    if (await cartCloseButton.isVisible().catch(() => false)) {
      await cartCloseButton.click();
      await page.waitForTimeout(500); // Wait for close animation
    }
  });

  test("should track specific order by order number", async ({ page }) => {
    /**
     * Verdex Discovery:
     * - resolve_container(e46) → Found Level 3: div.border.rounded-lg.p-4
     * - inspect_pattern(e46, 3) → 3 order cards with unique order numbers
     *
     * Pattern: Container → Content Filter → Role
     * Result: page.locator("div.border.rounded-lg.p-4")
     *           .filter({ hasText: "Order #ORD-2024-1234" })
     *           .getByRole("button", { name: "Track Order" })
     */

    // Scroll to orders section
    await page
      .getByRole("heading", { level: 2, name: "Your Orders" })
      .scrollIntoViewIfNeeded();

    // Click "Track Order" for Order #ORD-2024-1234
    const trackButton = page
      .locator("div.border.rounded-lg.p-4")
      .filter({ hasText: "Order #ORD-2024-1234" })
      .getByRole("button", { name: "Track Order" });

    // Verify uniqueness
    await expect(trackButton).toHaveCount(1);

    // Verify visibility and click
    await expect(trackButton).toBeVisible();
    await trackButton.click();
  });

  test("should view details of shipped order", async ({ page }) => {
    /**
     * Same container pattern, different order number
     * Demonstrates reusable selector strategy
     */

    await page
      .getByRole("heading", { level: 2, name: "Your Orders" })
      .scrollIntoViewIfNeeded();

    const viewDetailsButton = page
      .locator("div.border.rounded-lg.p-4")
      .filter({ hasText: "Order #ORD-2024-1198" })
      .getByRole("button", { name: "View Details" });

    await expect(viewDetailsButton).toHaveCount(1);
    await expect(viewDetailsButton).toBeVisible();
    await viewDetailsButton.click();

    // Verify we're looking at the correct order (Shipped status)
    const orderCard = page
      .locator("div.border.rounded-lg.p-4")
      .filter({ hasText: "Order #ORD-2024-1198" });

    await expect(orderCard).toContainText("Shipped");
    await expect(orderCard).toContainText("Sony WH-1000XM5 Headphones");
  });

  test("should mark Mike Rodriguez review as helpful", async ({ page }) => {
    /**
     * Verdex Discovery:
     * - resolve_container(e32) → Found Level 4-5: div.border.rounded-lg.p-4
     * - inspect_pattern(e32, 5) → 5 review cards with unique reviewer names
     *
     * Pattern: Container → Content Filter → Role
     * Result: page.locator("div.border.rounded-lg.p-4")
     *           .filter({ hasText: "Mike Rodriguez" })
     *           .getByRole("button", { name: /Helpful/ })
     */

    // Scroll to reviews section
    await page
      .getByRole("heading", { level: 2, name: "Customer Reviews" })
      .scrollIntoViewIfNeeded();

    // Click "Helpful" on Mike Rodriguez's review
    const helpfulButton = page
      .locator("div.border.rounded-lg.p-4")
      .filter({ hasText: "Mike Rodriguez" })
      .getByRole("button", { name: /Helpful/ });

    await expect(helpfulButton).toHaveCount(1);
    await expect(helpfulButton).toBeVisible();
    await helpfulButton.click();

    // Verify we're interacting with the correct review
    const reviewCard = page
      .locator("div.border.rounded-lg.p-4")
      .filter({ hasText: "Mike Rodriguez" });

    await expect(reviewCard).toContainText("Sony WH-1000XM5 Headphones");
    await expect(reviewCard).toContainText("★★★★★");
  });

  test("should report Emily Chen review", async ({ page }) => {
    /**
     * Same review card pattern, different reviewer
     * Demonstrates pattern reusability across similar elements
     */

    await page
      .getByRole("heading", { level: 2, name: "Customer Reviews" })
      .scrollIntoViewIfNeeded();

    const reportButton = page
      .locator("div.border.rounded-lg.p-4")
      .filter({ hasText: "Emily Chen" })
      .getByRole("button", { name: "Report" });

    await expect(reportButton).toHaveCount(1);
    await expect(reportButton).toBeVisible();
    await reportButton.click();

    // Verify correct review
    const reviewCard = page
      .locator("div.border.rounded-lg.p-4")
      .filter({ hasText: "Emily Chen" });

    await expect(reviewCard).toContainText("Samsung Galaxy S24 Ultra");
    await expect(reviewCard).toContainText("★★★☆☆");
  });

  test("should interact with all reviews systematically", async ({ page }) => {
    /**
     * Demonstrates scalability: same pattern works for all 5 reviewers
     */

    await page
      .getByRole("heading", { level: 2, name: "Customer Reviews" })
      .scrollIntoViewIfNeeded();

    const reviewers = [
      { name: "John Doe", product: "iPhone 15 Pro", rating: "★★★★★" },
      { name: "Sarah Martinez", product: 'MacBook Pro 14"', rating: "★★★★☆" },
      {
        name: "Mike Rodriguez",
        product: "Sony WH-1000XM5 Headphones",
        rating: "★★★★★",
      },
      {
        name: "Emily Chen",
        product: "Samsung Galaxy S24 Ultra",
        rating: "★★★☆☆",
      },
      {
        name: "David Wilson",
        product: "AirPods Pro (2nd Gen)",
        rating: "★★★★★",
      },
    ];

    for (const reviewer of reviewers) {
      // Verify each review card exists and is unique
      const reviewCard = page
        .locator("div.border.rounded-lg.p-4")
        .filter({ hasText: reviewer.name });

      await expect(reviewCard).toHaveCount(1);
      await expect(reviewCard).toContainText(reviewer.product);
      await expect(reviewCard).toContainText(reviewer.rating);

      // Verify both buttons are accessible
      const helpfulButton = reviewCard.getByRole("button", { name: /Helpful/ });
      const reportButton = reviewCard.getByRole("button", { name: "Report" });

      await expect(helpfulButton).toBeVisible();
      await expect(reportButton).toBeVisible();
    }
  });

  test("should filter orders by status", async ({ page }) => {
    /**
     * Demonstrates interaction with filter buttons
     * Uses simple semantic targeting (buttons are unique by name)
     */

    await page
      .getByRole("heading", { level: 2, name: "Your Orders" })
      .scrollIntoViewIfNeeded();

    // Click on different order status tabs
    const pendingButton = page.getByRole("button", { name: "Pending Orders" });
    const completedButton = page.getByRole("button", {
      name: "Completed Orders",
    });
    const cancelledButton = page.getByRole("button", {
      name: "Cancelled Orders",
    });

    // Verify all buttons exist and are unique
    await expect(pendingButton).toHaveCount(1);
    await expect(completedButton).toHaveCount(1);
    await expect(cancelledButton).toHaveCount(1);

    // Click through the tabs
    await pendingButton.click();
    await completedButton.click();
    await cancelledButton.click();
  });

  test("should interact with multi-item order", async ({ page }) => {
    /**
     * Order #ORD-2024-1087 contains multiple products
     * Tests selector stability with more complex content
     */

    await page
      .getByRole("heading", { level: 2, name: "Your Orders" })
      .scrollIntoViewIfNeeded();

    const orderCard = page
      .locator("div.border.rounded-lg.p-4")
      .filter({ hasText: "Order #ORD-2024-1087" });

    // Verify order contains multiple products
    await expect(orderCard).toContainText('MacBook Pro 14"');
    await expect(orderCard).toContainText("AirPods Pro (2nd Gen)");
    await expect(orderCard).toContainText("Quantity: 1"); // Should appear twice

    // Interact with buttons
    const trackButton = orderCard.getByRole("button", { name: "Track Order" });
    const viewButton = orderCard.getByRole("button", { name: "View Details" });

    await expect(trackButton).toBeVisible();
    await expect(viewButton).toBeVisible();

    await trackButton.click();
  });

  test("should verify review metadata and actions", async ({ page }) => {
    /**
     * Tests that we can access all elements within a review card
     * using the Container → Content Filter → Role pattern
     */

    await page
      .getByRole("heading", { level: 2, name: "Customer Reviews" })
      .scrollIntoViewIfNeeded();

    const johnDoeReview = page
      .locator("div.border.rounded-lg.p-4")
      .filter({ hasText: "John Doe" });

    // Verify all review metadata is accessible
    await expect(johnDoeReview).toContainText("2 days ago");
    await expect(johnDoeReview).toContainText("Purchased: iPhone 15 Pro");
    await expect(johnDoeReview).toContainText("★★★★★");
    await expect(johnDoeReview).toContainText(
      "Amazing phone! The camera quality is outstanding"
    );

    // Verify button with count is accessible
    const helpfulButton = johnDoeReview.getByRole("button", {
      name: /Helpful.*23/,
    });
    await expect(helpfulButton).toBeVisible();
    await expect(helpfulButton).toContainText("23");
  });

  test("should handle order status badges correctly", async ({ page }) => {
    /**
     * Verifies that status badges don't interfere with content filtering
     */

    await page
      .getByRole("heading", { level: 2, name: "Your Orders" })
      .scrollIntoViewIfNeeded();

    // Order #ORD-2024-1234 has "Processing" status
    const processingOrder = page
      .locator("div.border.rounded-lg.p-4")
      .filter({ hasText: "Order #ORD-2024-1234" });

    await expect(processingOrder).toContainText("Processing");

    // Order #ORD-2024-1198 has "Shipped" status
    const shippedOrder = page
      .locator("div.border.rounded-lg.p-4")
      .filter({ hasText: "Order #ORD-2024-1198" });

    await expect(shippedOrder).toContainText("Shipped");

    // Verify we can still target buttons despite status badges
    await expect(
      processingOrder.getByRole("button", { name: "Track Order" })
    ).toBeVisible();

    await expect(
      shippedOrder.getByRole("button", { name: "Track Order" })
    ).toBeVisible();
  });
});

/**
 * Key Takeaways from this test:
 *
 * 1. Container → Content Filter → Role pattern works consistently
 * 2. Same container class used for both orders and reviews (div.border.rounded-lg.p-4)
 * 3. Content filtering (order number, reviewer name) provides uniqueness
 * 4. Pattern is scalable: works for 3 orders, 5 reviews, easily extends to more
 * 5. No brittle nth() selectors or positional dependencies
 * 6. Selectors survive DOM reordering and content changes
 *
 * Verdex Token Cost: ~1,500 tokens total
 * - browser_navigate + snapshot: ~800 tokens
 * - resolve_container (2 calls): ~400 tokens
 * - inspect_pattern (4 calls): ~300 tokens
 *
 * Result: 9 robust, maintainable tests using proven selector patterns
 */
