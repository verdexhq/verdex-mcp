import { Page, Locator } from "@playwright/test";

/**
 * Find Classes Modal Page Object
 *
 * Dedicated page object for the class booking modal that can appear
 * from multiple contexts (dashboard, calendar, etc.)
 *
 * Built using VERDEX methodology:
 * - Test-id scoped for maximum resilience
 * - Role-based targeting for accessibility
 * - Container + Filter + Role patterns for class selection
 */
export class FindClassesModalPage {
  readonly page: Page;

  // Modal Container (Test-id scoped - VERDEX Priority #5)
  readonly modal: Locator;

  // Modal Header Elements
  readonly modalHeading: Locator;
  readonly closeButton: Locator;

  // Filter and Search Controls
  readonly filtersButton: Locator;
  readonly locationLink: Locator;

  // Class List Container
  readonly classesContainer: Locator;

  // Common Action Buttons (will be scoped to specific classes)
  readonly joinWaitlistButton: Locator;
  readonly bookButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Modal container - using data-testid for maximum resilience
    // This was discovered during exploration at ancestor level 11
    this.modal = page.getByTestId("modal");

    // Header elements - scoped within modal
    this.modalHeading = this.modal.getByRole("heading", {
      name: "Find classes",
    });
    this.closeButton = this.modal.getByRole("button", {
      name: "Close modal",
    });

    // Filter controls
    this.filtersButton = this.modal.getByRole("button", { name: "Filters" });
    this.locationLink = this.modal.getByRole("link", { name: "Allendale" });

    // Class list container - for scoping class-specific interactions
    this.classesContainer = this.modal.locator('[class*="space-y"]').first();

    // Generic action buttons - use with specific class targeting
    this.joinWaitlistButton = this.modal.getByRole("button", {
      name: "Join waitlist",
    });
    this.bookButton = this.modal.getByRole("button", { name: /^book/i });
  }

  /**
   * Wait for modal to be visible and fully loaded
   */
  async waitForModalOpen() {
    await this.modal.waitFor({ state: "visible" });
    await this.modalHeading.waitFor();
  }

  /**
   * Close the modal and wait for it to be hidden
   */
  async close() {
    await this.closeButton.click();
    await this.modal.waitFor({ state: "hidden" });
  }

  /**
   * Open filters panel
   */
  async openFilters() {
    await this.filtersButton.click();
  }

  /**
   * Change location/studio
   */
  async selectLocation(locationName: string) {
    await this.modal.getByRole("link", { name: locationName }).click();
  }

  /**
   * VERDEX Pattern 3: List Interactions (Role + Filter)
   * Find a specific class by name
   */
  getClassByName(className: string): Locator {
    return this.modal
      .getByRole("listitem")
      .filter({ hasText: className })
      .first();
  }

  /**
   * Get class by heading (alternative approach)
   */
  getClassByHeading(className: string): Locator {
    return this.modal
      .getByRole("heading", { name: className })
      .locator("..") // Go up to parent container
      .first();
  }

  /**
   * VERDEX Pattern 1: Container + Filter + Role
   * Get action button for a specific class
   */
  getClassActionButton(
    className: string,
    action: "Book" | "Join waitlist" | "View details"
  ): Locator {
    return this.getClassByName(className).getByRole("button", {
      name: new RegExp(action, "i"),
    });
  }

  /**
   * Advanced filtering: Get available classes (not waitlist/full)
   */
  getAvailableClasses(): Locator {
    return this.modal
      .getByRole("listitem")
      .filter({ hasNotText: "Waitlist" })
      .filter({ hasNotText: "Full" })
      .filter({ hasNotText: "Cancelled" });
  }

  /**
   * Get classes by time slot
   */
  getClassesByTime(timePattern: string | RegExp): Locator {
    return this.modal.getByRole("listitem").filter({ hasText: timePattern });
  }

  /**
   * Get classes by instructor
   */
  getClassesByInstructor(instructorName: string): Locator {
    return this.modal.getByRole("listitem").filter({ hasText: instructorName });
  }

  /**
   * Book a specific class
   */
  async bookClass(className: string) {
    const classCard = this.getClassByName(className);
    const bookButton = classCard.getByRole("button", { name: /book/i });
    await bookButton.click();
  }

  /**
   * Join waitlist for a specific class
   */
  async joinWaitlist(className: string) {
    const classCard = this.getClassByName(className);
    const waitlistButton = classCard.getByRole("button", {
      name: /join waitlist/i,
    });
    await waitlistButton.click();
  }

  /**
   * Book first available class
   */
  async bookFirstAvailableClass() {
    const firstAvailable = this.getAvailableClasses().first();
    const bookButton = firstAvailable.getByRole("button", { name: /book/i });
    await bookButton.click();
  }

  /**
   * Get class information
   */
  async getClassInfo(className: string): Promise<{
    name: string;
    time?: string;
    instructor?: string;
    status?: string;
  }> {
    const classCard = this.getClassByName(className);
    const name = await classCard.getByRole("heading").first().textContent();

    return {
      name: name || className,
      // Add more fields as needed based on actual class card structure
    };
  }

  /**
   * Utility methods for assertions
   */
  async isVisible(): Promise<boolean> {
    return await this.modal.isVisible();
  }

  async getClassCount(): Promise<number> {
    return await this.modal.getByRole("listitem").count();
  }

  async getAvailableClassCount(): Promise<number> {
    return await this.getAvailableClasses().count();
  }

  /**
   * Check if a specific class is available for booking
   */
  async isClassAvailable(className: string): Promise<boolean> {
    const classCard = this.getClassByName(className);
    const bookButton = classCard.getByRole("button", { name: /book/i });
    return await bookButton.isVisible();
  }

  /**
   * Check if a class requires waitlist
   */
  async isClassWaitlisted(className: string): Promise<boolean> {
    const classCard = this.getClassByName(className);
    const waitlistButton = classCard.getByRole("button", {
      name: /join waitlist/i,
    });
    return await waitlistButton.isVisible();
  }
}
