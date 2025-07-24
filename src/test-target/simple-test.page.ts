import { Page, Locator } from "@playwright/test";

/**
 * Page Object for the Simple Test HTML page
 * Built using browser-bridge exploration and stable selector patterns
 */
export class SimpleTestPage {
  readonly page: Page;

  // Main containers with data-testid attributes (most stable)
  readonly filterSidebar: Locator;
  readonly productsGrid: Locator;
  readonly pagination: Locator;

  // Filter elements
  readonly filtersHeading: Locator;
  readonly electronicsFilter: Locator;
  readonly clothingFilter: Locator;

  // Pagination elements
  readonly previousPageButton: Locator;
  readonly nextPageButton: Locator;
  readonly pageNumber1Button: Locator;
  readonly pageNumber2Button: Locator;
  readonly pageNumber3Button: Locator;

  // Product card elements
  readonly productCardContainer: Locator;

  constructor(page: Page) {
    this.page = page;

    // Main containers - using data-testid for maximum stability where available
    this.filterSidebar = page.getByTestId("filter-sidebar");
    // Products grid: Use CSS selector since data-testid is not available
    // This grid is uniquely identified by its responsive grid classes
    this.productsGrid = page.locator(
      ".grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-3.gap-6"
    );
    this.pagination = page.getByTestId("pagination");

    this.productCardContainer = this.productsGrid.locator("> div");

    // Filter elements - scoped within filter sidebar
    this.filtersHeading = this.filterSidebar.getByRole("heading", {
      name: "Filters",
    });
    this.electronicsFilter = this.filterSidebar.getByTestId(
      "category-electronics"
    );
    this.clothingFilter = this.filterSidebar.getByTestId("category-clothing");

    // Pagination elements - using semantic targeting within pagination container
    this.previousPageButton = this.pagination.getByRole("button", {
      name: "‹",
    });
    this.nextPageButton = this.pagination.getByRole("button", { name: "›" });
    this.pageNumber1Button = this.pagination.getByRole("button", { name: "1" });
    this.pageNumber2Button = this.pagination.getByRole("button", { name: "2" });
    this.pageNumber3Button = this.pagination.getByRole("button", { name: "3" });
  }

  /**
   * Navigate to the simple test page
   */
  async goto() {
    const currentDir = process.cwd();
    await this.page.goto(
      `file://${currentDir}/src/test-target/simple-test.html`
    );
  }

  /**
   * Get a product card by its name - using content-based filtering
   * This is the most stable approach for repeated elements
   */
  //   getProductCard(productName: string): Locator {
  //     return this.productsGrid
  //       .locator("> div.bg-white.rounded-lg.shadow-md")
  //       .filter({ hasText: productName });
  //   }

  getProductCard(productName: string): Locator {
    return this.productCardContainer.filter({
      has: this.page.locator(`h3:has-text("${productName}")`),
    });
  }

  /**
   * Get a product's "Add to Cart" button by product name
   * Uses container-first approach with content filtering
   */
  getAddToCartButton(productName: string): Locator {
    return this.getProductCard(productName).getByRole("button", {
      name: /add to cart/i,
    });
  }

  /**
   * Get a product's title heading
   */
  getProductTitle(productName: string): Locator {
    return this.getProductCard(productName).getByRole("heading", {
      name: productName,
    });
  }

  /**
   * Get a product's price display
   */
  getProductPrice(productName: string): Locator {
    return this.getProductCard(productName)
      .locator("span")
      .filter({ hasText: /^\$\d+$/ });
  }

  /**
   * Get all product cards
   */
  getAllProductCards(): Locator {
    return this.productCardContainer;
  }

  /**
   * Get all available (non-disabled) "Add to Cart" buttons
   */
  getAvailableAddToCartButtons(): Locator {
    return this.productCardContainer
      .getByRole("button", { name: /add to cart/i })
      .and(this.page.locator(":not([disabled])"));
  }

  /**
   * Get all out of stock products
   */
  getOutOfStockProducts(): Locator {
    return this.productCardContainer.filter({ hasText: "Out of Stock" });
  }

  /**
   * Filter Actions
   */
  async selectElectronicsFilter() {
    await this.electronicsFilter.check();
  }

  async selectClothingFilter() {
    await this.clothingFilter.check();
  }

  async unselectElectronicsFilter() {
    await this.electronicsFilter.uncheck();
  }

  async unselectClothingFilter() {
    await this.clothingFilter.uncheck();
  }

  /**
   * Product Actions
   */
  async addProductToCart(productName: string) {
    await this.getAddToCartButton(productName).click();
  }

  /**
   * Pagination Actions
   */
  async goToPage(pageNumber: number) {
    switch (pageNumber) {
      case 1:
        await this.pageNumber1Button.click();
        break;
      case 2:
        await this.pageNumber2Button.click();
        break;
      case 3:
        await this.pageNumber3Button.click();
        break;
      default:
        throw new Error(`Page number ${pageNumber} not supported`);
    }
  }

  async goToNextPage() {
    await this.nextPageButton.click();
  }

  async goToPreviousPage() {
    await this.previousPageButton.click();
  }

  /**
   * Verification Methods
   */
  async isProductVisible(productName: string): Promise<boolean> {
    return await this.getProductCard(productName).isVisible();
  }

  async isAddToCartButtonEnabled(productName: string): Promise<boolean> {
    return await this.getAddToCartButton(productName).isEnabled();
  }

  async getProductCount(): Promise<number> {
    return await this.getAllProductCards().count();
  }

  async isFilterSelected(
    filterType: "electronics" | "clothing"
  ): Promise<boolean> {
    const filter =
      filterType === "electronics"
        ? this.electronicsFilter
        : this.clothingFilter;
    return await filter.isChecked();
  }

  /**
   * Wait for page to be ready
   */
  async waitForPageLoad() {
    await this.productsGrid.waitFor({ state: "visible" });
    await this.filterSidebar.waitFor({ state: "visible" });
    await this.pagination.waitFor({ state: "visible" });
  }
}

/**
 * Specific product selectors for commonly tested products
 * These use the stable content-based filtering approach
 */
export class ProductSelectors {
  static readonly ELECTRONICS_PRODUCT = "Product 1 - Electronics";
  static readonly CLOTHING_PRODUCT = "Product 2 - Clothing";
  static readonly BOOKS_PRODUCT = "Product 3 - Books";
}

/**
 * Example usage:
 *
 * const page = new SimpleTestPage(page);
 * await page.goto();
 * await page.waitForPageLoad();
 *
 * // Filter products
 * await page.selectElectronicsFilter();
 *
 * // Add specific product to cart
 * await page.addProductToCart(ProductSelectors.ELECTRONICS_PRODUCT);
 *
 * // Navigate pagination
 * await page.goToPage(2);
 *
 * // Verify states
 * expect(await page.isProductVisible(ProductSelectors.ELECTRONICS_PRODUCT)).toBe(true);
 * expect(await page.getProductCount()).toBe(3);
 */
