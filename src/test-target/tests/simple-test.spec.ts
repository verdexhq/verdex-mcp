import { test, expect } from "@playwright/test";
import { SimpleTestPage, ProductSelectors } from "../simple-test.page";

test.describe("Simple Test HTML Page", () => {
  let simplePage: SimpleTestPage;

  test.beforeEach(async ({ page }) => {
    simplePage = new SimpleTestPage(page);
    await simplePage.goto();
    await simplePage.waitForPageLoad();
  });

  test.describe("Page Structure", () => {
    test("should display main page elements", async () => {
      // Verify main containers are visible
      await expect(simplePage.filterSidebar).toBeVisible();
      await expect(simplePage.productsGrid).toBeVisible();
      await expect(simplePage.pagination).toBeVisible();

      // Verify page title
      await expect(
        simplePage.page.getByRole("heading", {
          name: "Product Listing Test App",
        })
      ).toBeVisible();
    });

    test("should show correct number of products", async () => {
      const productCount = await simplePage.getProductCount();
      expect(productCount).toBe(3);
    });

    test("should display all three products with correct names", async () => {
      await expect(
        simplePage.isProductVisible(ProductSelectors.ELECTRONICS_PRODUCT)
      ).resolves.toBe(true);
      await expect(
        simplePage.isProductVisible(ProductSelectors.CLOTHING_PRODUCT)
      ).resolves.toBe(true);
      await expect(
        simplePage.isProductVisible(ProductSelectors.BOOKS_PRODUCT)
      ).resolves.toBe(true);
    });
  });

  test.describe("Filter Functionality", () => {
    test("should have filters section with correct heading", async () => {
      await expect(simplePage.filtersHeading).toBeVisible();
      await expect(simplePage.filtersHeading).toHaveText("Filters");
    });

    test("should have unchecked filters by default", async () => {
      expect(await simplePage.isFilterSelected("electronics")).toBe(false);
      expect(await simplePage.isFilterSelected("clothing")).toBe(false);
    });

    test("should allow selecting and unselecting electronics filter", async () => {
      // Select electronics filter
      await simplePage.selectElectronicsFilter();
      expect(await simplePage.isFilterSelected("electronics")).toBe(true);

      // Unselect electronics filter
      await simplePage.unselectElectronicsFilter();
      expect(await simplePage.isFilterSelected("electronics")).toBe(false);
    });

    test("should allow selecting and unselecting clothing filter", async () => {
      // Select clothing filter
      await simplePage.selectClothingFilter();
      expect(await simplePage.isFilterSelected("clothing")).toBe(true);

      // Unselect clothing filter
      await simplePage.unselectClothingFilter();
      expect(await simplePage.isFilterSelected("clothing")).toBe(false);
    });

    test("should allow selecting both filters simultaneously", async () => {
      await simplePage.selectElectronicsFilter();
      await simplePage.selectClothingFilter();

      expect(await simplePage.isFilterSelected("electronics")).toBe(true);
      expect(await simplePage.isFilterSelected("clothing")).toBe(true);
    });
  });

  test.describe("Product Interactions", () => {
    test("should display product titles correctly", async () => {
      await expect(
        simplePage.getProductTitle(ProductSelectors.ELECTRONICS_PRODUCT)
      ).toBeVisible();
      await expect(
        simplePage.getProductTitle(ProductSelectors.CLOTHING_PRODUCT)
      ).toBeVisible();
      await expect(
        simplePage.getProductTitle(ProductSelectors.BOOKS_PRODUCT)
      ).toBeVisible();
    });

    test("should display product prices", async () => {
      await expect(
        simplePage.getProductPrice(ProductSelectors.ELECTRONICS_PRODUCT)
      ).toHaveText("$299");
      await expect(
        simplePage.getProductPrice(ProductSelectors.CLOTHING_PRODUCT)
      ).toHaveText("$79");
      await expect(
        simplePage.getProductPrice(ProductSelectors.BOOKS_PRODUCT)
      ).toHaveText("$24");
    });

    test("should have enabled add to cart buttons for available products", async () => {
      expect(
        await simplePage.isAddToCartButtonEnabled(
          ProductSelectors.ELECTRONICS_PRODUCT
        )
      ).toBe(true);
      expect(
        await simplePage.isAddToCartButtonEnabled(
          ProductSelectors.CLOTHING_PRODUCT
        )
      ).toBe(true);
    });

    test("should have disabled add to cart button for out of stock product", async () => {
      expect(
        await simplePage.isAddToCartButtonEnabled(
          ProductSelectors.BOOKS_PRODUCT
        )
      ).toBe(false);
    });

    test("should correctly identify out of stock products", async () => {
      const outOfStockProducts = simplePage.getOutOfStockProducts();
      await expect(outOfStockProducts).toHaveCount(1);
      await expect(outOfStockProducts).toContainText("Product 3 - Books");
    });

    test("should get only available add to cart buttons", async () => {
      const availableButtons = simplePage.getAvailableAddToCartButtons();
      await expect(availableButtons).toHaveCount(2); // Electronics and Clothing only
    });

    test("should successfully add electronics product to cart", async () => {
      const addToCartButton = simplePage.getAddToCartButton(
        ProductSelectors.ELECTRONICS_PRODUCT
      );
      await expect(addToCartButton).toBeEnabled();
      await expect(addToCartButton).toHaveText("🛒 Add to Cart");

      // Click the button
      await simplePage.addProductToCart(ProductSelectors.ELECTRONICS_PRODUCT);

      // Wait for any animation to complete and verify button returns to normal state
      await expect(addToCartButton).toHaveText("🛒 Add to Cart", {
        timeout: 3000,
      });
      await expect(addToCartButton).toBeEnabled();
    });

    test("should successfully add clothing product to cart", async () => {
      const addToCartButton = simplePage.getAddToCartButton(
        ProductSelectors.CLOTHING_PRODUCT
      );
      await expect(addToCartButton).toBeEnabled();
      await expect(addToCartButton).toHaveText("🛒 Add to Cart");

      // Click the button
      await simplePage.addProductToCart(ProductSelectors.CLOTHING_PRODUCT);

      // Wait for any animation to complete and verify button returns to normal state
      await expect(addToCartButton).toHaveText("🛒 Add to Cart", {
        timeout: 3000,
      });
      await expect(addToCartButton).toBeEnabled();
    });
  });

  test.describe("Pagination Controls", () => {
    test("should display all pagination buttons", async () => {
      await expect(simplePage.previousPageButton).toBeVisible();
      await expect(simplePage.pageNumber1Button).toBeVisible();
      await expect(simplePage.pageNumber2Button).toBeVisible();
      await expect(simplePage.pageNumber3Button).toBeVisible();
      await expect(simplePage.nextPageButton).toBeVisible();
    });

    test("should have previous button disabled on page 1", async () => {
      await expect(simplePage.previousPageButton).toBeDisabled();
    });

    test("should have page 1 button highlighted by default", async () => {
      await expect(simplePage.pageNumber1Button).toHaveClass(/bg-blue-600/);
    });

    test("should allow clicking page 2 button", async () => {
      await simplePage.goToPage(2);
      // Note: Since this is a static page, we can't verify actual page change
      // but we can verify the button click worked
      await expect(simplePage.pageNumber2Button).toBeVisible();
    });

    test("should allow clicking page 3 button", async () => {
      await simplePage.goToPage(3);
      await expect(simplePage.pageNumber3Button).toBeVisible();
    });

    test("should handle invalid page numbers gracefully", async () => {
      await expect(simplePage.goToPage(99)).rejects.toThrow(
        "Page number 99 not supported"
      );
    });

    test("should allow clicking next page button", async () => {
      await simplePage.goToNextPage();
      await expect(simplePage.nextPageButton).toBeVisible();
    });
  });

  test.describe("Page Object Methods", () => {
    test("should correctly get product cards by name", async () => {
      const electronicsCard = simplePage.getProductCard(
        ProductSelectors.ELECTRONICS_PRODUCT
      );
      const clothingCard = simplePage.getProductCard(
        ProductSelectors.CLOTHING_PRODUCT
      );
      const booksCard = simplePage.getProductCard(
        ProductSelectors.BOOKS_PRODUCT
      );

      await expect(electronicsCard).toBeVisible();
      await expect(clothingCard).toBeVisible();
      await expect(booksCard).toBeVisible();

      await expect(electronicsCard).toContainText("Product 1 - Electronics");
      await expect(clothingCard).toContainText("Product 2 - Clothing");
      await expect(booksCard).toContainText("Product 3 - Books");
    });

    test("should correctly identify product visibility", async () => {
      expect(
        await simplePage.isProductVisible(ProductSelectors.ELECTRONICS_PRODUCT)
      ).toBe(true);
      expect(
        await simplePage.isProductVisible(ProductSelectors.CLOTHING_PRODUCT)
      ).toBe(true);
      expect(
        await simplePage.isProductVisible(ProductSelectors.BOOKS_PRODUCT)
      ).toBe(true);
      expect(await simplePage.isProductVisible("Non-existent Product")).toBe(
        false
      );
    });

    test("should get all product cards correctly", async () => {
      const allCards = simplePage.getAllProductCards();
      await expect(allCards).toHaveCount(3);
    });
  });

  test.describe("Complex Workflows", () => {
    test("should handle multiple filter selections and product interactions", async () => {
      // Select both filters
      await simplePage.selectElectronicsFilter();
      await simplePage.selectClothingFilter();

      // Verify both are selected
      expect(await simplePage.isFilterSelected("electronics")).toBe(true);
      expect(await simplePage.isFilterSelected("clothing")).toBe(true);

      // Add electronics product to cart
      await simplePage.addProductToCart(ProductSelectors.ELECTRONICS_PRODUCT);

      // Wait for animation and verify button returns to normal
      await expect(
        simplePage.getAddToCartButton(ProductSelectors.ELECTRONICS_PRODUCT)
      ).toHaveText("🛒 Add to Cart", { timeout: 2000 });

      // Navigate to page 2
      await simplePage.goToPage(2);

      // Unselect electronics filter
      await simplePage.unselectElectronicsFilter();
      expect(await simplePage.isFilterSelected("electronics")).toBe(false);
      expect(await simplePage.isFilterSelected("clothing")).toBe(true);
    });

    test("should handle adding multiple products to cart sequentially", async () => {
      // Add electronics product
      await simplePage.addProductToCart(ProductSelectors.ELECTRONICS_PRODUCT);
      await expect(
        simplePage.getAddToCartButton(ProductSelectors.ELECTRONICS_PRODUCT)
      ).toHaveText("🛒 Add to Cart", { timeout: 2000 });

      // Add clothing product
      await simplePage.addProductToCart(ProductSelectors.CLOTHING_PRODUCT);
      await expect(
        simplePage.getAddToCartButton(ProductSelectors.CLOTHING_PRODUCT)
      ).toHaveText("🛒 Add to Cart", { timeout: 2000 });

      // Verify both buttons are back to normal state
      expect(
        await simplePage.isAddToCartButtonEnabled(
          ProductSelectors.ELECTRONICS_PRODUCT
        )
      ).toBe(true);
      expect(
        await simplePage.isAddToCartButtonEnabled(
          ProductSelectors.CLOTHING_PRODUCT
        )
      ).toBe(true);
    });
  });
});
