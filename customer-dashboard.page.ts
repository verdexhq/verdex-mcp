import { Page, Locator } from "@playwright/test";
import { FindClassesModalPage } from "./find-classes-modal.page";

/**
 * Customer Dashboard Page Object
 *
 * Built using VERDEX methodology with effectively scoped selectors
 * following official Playwright best practices:
 * 1. Role-first approach for interactive elements
 * 2. Semantic targeting with accessible names
 * 3. Container scoping for resilience
 * 4. Test-id fallbacks for maximum stability
 */
export class CustomerDashboardPage {
  readonly page: Page;

  // Navigation Elements (Role-based, semantically scoped)
  readonly navigation: Locator;
  readonly dashboardLink: Locator;
  readonly calendarLink: Locator;
  readonly shopLink: Locator;
  readonly purchaseHistoryLink: Locator;
  readonly settingsLink: Locator;
  readonly supportButton: Locator;
  readonly sidebarToggle: Locator;

  // Main Dashboard Content (Container-scoped)
  readonly mainContent: Locator;
  readonly dashboardHeading: Locator;

  // Booking Section (Following VERDEX Pattern 1: Container + Filter + Role)
  readonly bookingSection: Locator;
  readonly bookingTypeHeading: Locator;
  readonly bookClassButton: Locator;
  readonly registerEventsButton: Locator;
  readonly scheduleAppointmentButton: Locator;

  // Calendar Section
  readonly calendarSection: Locator;
  readonly calendarHeading: Locator;

  // Credits Section
  readonly creditsSection: Locator;
  readonly creditsHeading: Locator;

  // Modal Page Objects (Composition over inheritance)
  readonly findClassesModal: FindClassesModalPage;

  constructor(page: Page) {
    this.page = page;

    // Navigation - Using semantic nav element with role-based children
    // VERDEX Pattern 5: Navigation (Role-Based)
    this.navigation = page.getByRole("navigation");
    this.dashboardLink = this.navigation.getByRole("link", {
      name: "Dashboard",
    });
    this.calendarLink = this.navigation.getByRole("link", {
      name: "My calendar",
    });
    this.shopLink = this.navigation.getByRole("link", { name: "Shop" });
    this.purchaseHistoryLink = this.navigation.getByRole("link", {
      name: "Purchase history",
    });
    this.settingsLink = this.navigation.getByRole("link", { name: "Settings" });
    this.supportButton = this.navigation.getByRole("button", {
      name: "Chat with support",
    });

    // Sidebar toggle - scoped to avoid conflicts with modal buttons
    this.sidebarToggle = page.getByRole("button", { name: "Open sidebarMenu" });

    // Main content area - semantic main element
    this.mainContent = page.getByRole("main");

    // Dashboard heading - role-based heading targeting
    this.dashboardHeading = this.mainContent.getByRole("heading", {
      name: "Dashboard",
    });

    // Booking Section - Container + Filter + Role pattern
    // Using heading as container anchor, then targeting buttons by specific names
    this.bookingTypeHeading = this.mainContent.getByRole("heading", {
      name: "Choose booking type",
    });

    // Booking buttons - scoped to main content to avoid modal conflicts
    this.bookClassButton = this.mainContent.getByRole("button", {
      name: "Book a class",
    });
    this.registerEventsButton = this.mainContent.getByRole("button", {
      name: "Register for events",
    });
    this.scheduleAppointmentButton = this.mainContent.getByRole("button", {
      name: "Schedule an appointment",
    });

    // Calendar Section
    this.calendarHeading = this.mainContent.getByRole("heading", {
      name: "Your calendar",
    });

    // Credits Section
    this.creditsHeading = this.mainContent.getByRole("heading", {
      name: "Your credits",
    });

    // Modal Page Objects - Composition pattern for better separation of concerns
    this.findClassesModal = new FindClassesModalPage(page);
  }

  /**
   * Navigate to the customer dashboard
   * Assumes user is already authenticated via the customer role
   */
  async goto() {
    await this.page.goto("https://cs-fit.staging01.joinzipper.com");
    await this.dashboardHeading.waitFor();
  }

  /**
   * Navigate to different sections using the main navigation
   * Following VERDEX Pattern 5: Navigation (Role-Based)
   */
  async navigateToCalendar() {
    await this.calendarLink.click();
    await this.page.getByRole("heading", { name: "My calendar" }).waitFor();
  }

  async navigateToShop() {
    await this.shopLink.click();
  }

  async navigateToPurchaseHistory() {
    await this.purchaseHistoryLink.click();
  }

  async navigateToSettings() {
    await this.settingsLink.click();
  }

  /**
   * Booking workflow methods
   * Following VERDEX Pattern 1: Container + Filter + Role
   * Now delegates to appropriate modal page objects
   */
  async openBookClassModal(): Promise<FindClassesModalPage> {
    await this.bookClassButton.click();
    await this.findClassesModal.waitForModalOpen();
    return this.findClassesModal;
  }

  async openRegisterEventsModal() {
    await this.registerEventsButton.click();
    // TODO: Create RegisterEventsModalPage when needed
  }

  async openScheduleAppointmentModal() {
    await this.scheduleAppointmentButton.click();
    // TODO: Create ScheduleAppointmentModalPage when needed
  }

  /**
   * Class booking workflow - complete customer journey
   * Demonstrates composition pattern with modal page objects
   */
  async bookClass(className?: string) {
    // Step 1: Open booking modal and get modal page object
    const modal = await this.openBookClassModal();

    // Step 2: Use modal page object for class-specific interactions
    if (className) {
      await modal.bookClass(className);
    } else {
      // Default: book first available class
      await modal.bookFirstAvailableClass();
    }
  }

  /**
   * Support interaction
   */
  async openSupportChat() {
    await this.supportButton.click();
  }

  /**
   * Utility methods for assertions and waits
   */
  async waitForDashboardLoad() {
    await this.dashboardHeading.waitFor();
    await this.bookingTypeHeading.waitFor();
    await this.calendarHeading.waitFor();
    await this.creditsHeading.waitFor();
  }

  async isBookClassModalOpen(): Promise<boolean> {
    return await this.findClassesModal.isVisible();
  }

  async getCurrentPageHeading(): Promise<string> {
    const heading = this.mainContent.getByRole("heading").first();
    return (await heading.textContent()) || "";
  }

  /**
   * Dashboard-specific selector examples following VERDEX patterns
   */

  // Pattern 4: Table Interactions (if calendar has table view)
  getCalendarEventByTitle(eventTitle: string): Locator {
    return this.mainContent
      .getByRole("table")
      .getByRole("row")
      .filter({ hasText: eventTitle });
  }

  // Credits section interactions
  getCreditsByType(creditType: string): Locator {
    return this.mainContent
      .getByRole("region")
      .filter({ hasText: "Your credits" })
      .getByText(creditType);
  }
}

/**
 * Usage Example:
 *
 * import { test, expect } from '@playwright/test';
 * import { CustomerDashboardPage } from './customer-dashboard.page';
 *
 * test('customer can book a class', async ({ page }) => {
 *   const dashboard = new CustomerDashboardPage(page);
 *
 *   await dashboard.goto();
 *   await dashboard.waitForDashboardLoad();
 *
 *   // Book a specific class - uses composition with modal page object
 *   await dashboard.bookClass('Pilates Level 1');
 *
 *   // Verify modal is closed after booking
 *   await expect(dashboard.findClassesModal.modal).toBeHidden();
 * });
 *
 * test('customer can interact with modal directly', async ({ page }) => {
 *   const dashboard = new CustomerDashboardPage(page);
 *
 *   await dashboard.goto();
 *   const modal = await dashboard.openBookClassModal();
 *
 *   // Use modal page object directly for complex interactions
 *   await modal.openFilters();
 *   await modal.selectLocation('Downtown Studio');
 *
 *   const availableCount = await modal.getAvailableClassCount();
 *   expect(availableCount).toBeGreaterThan(0);
 *
 *   await modal.close();
 * });
 *
 * test('customer can navigate sections', async ({ page }) => {
 *   const dashboard = new CustomerDashboardPage(page);
 *
 *   await dashboard.goto();
 *   await dashboard.navigateToCalendar();
 *
 *   expect(await dashboard.getCurrentPageHeading()).toBe('My calendar');
 * });
 */
