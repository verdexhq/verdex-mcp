import { Page, Locator, expect } from "@playwright/test";

export class YouTubeLoginPage {
  readonly page: Page;

  // YouTube Homepage selectors
  readonly headerSignInButton: Locator;
  readonly sidebarSignInButton: Locator;
  readonly searchBox: Locator;
  readonly homeTab: Locator;

  // Google Login Page selectors
  readonly emailInput: Locator;
  readonly nextButton: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;
  readonly createAccountButton: Locator;
  readonly forgotEmailLink: Locator;
  readonly signInPageHeading: Locator;

  constructor(page: Page) {
    this.page = page;

    // YouTube Homepage elements - using semantic selectors with proper scoping
    // Header sign-in: Scoped to banner region to distinguish from sidebar
    this.headerSignInButton = page
      .getByRole("banner")
      .getByRole("link", { name: "Sign in" });

    // Sidebar sign-in: Scoped to navigation region
    this.sidebarSignInButton = page
      .getByRole("navigation")
      .getByRole("link", { name: "Sign in" });

    // Global elements that don't need scoping
    this.searchBox = page.getByRole("combobox", { name: "Search" });
    this.homeTab = page.getByRole("tab", { name: "Home" });

    // Google Login Page elements - using accessible selectors with fallbacks
    this.emailInput = page
      .getByLabel("Email or phone")
      .or(page.locator("#identifierId"));
    this.nextButton = page.getByRole("button", { name: "Next" });
    this.passwordInput = page
      .getByLabel("Enter your password")
      .or(page.getByLabel("Password"));
    this.signInButton = page.getByRole("button", { name: "Sign in" });
    this.createAccountButton = page.getByRole("button", {
      name: "Create account",
    });
    this.forgotEmailLink = page.getByRole("button", { name: "Forgot email?" });
    this.signInPageHeading = page.getByRole("heading", { name: "Sign in" });
  }

  /**
   * Navigate to YouTube homepage
   */
  async goto() {
    await this.page.goto("https://www.youtube.com");
    await expect(this.homeTab).toBeVisible();
  }

  /**
   * Click the main sign-in button in the header
   */
  async clickHeaderSignIn() {
    await expect(this.headerSignInButton).toBeVisible();
    await this.headerSignInButton.click();

    // Wait for Google login page to load
    await expect(this.signInPageHeading).toBeVisible();
    await expect(this.emailInput).toBeVisible();
  }

  /**
   * Click the sign-in button in the sidebar navigation
   */
  async clickSidebarSignIn() {
    await expect(this.sidebarSignInButton).toBeVisible();
    await this.sidebarSignInButton.click();

    // Wait for Google login page to load
    await expect(this.signInPageHeading).toBeVisible();
    await expect(this.emailInput).toBeVisible();
  }

  /**
   * Enter email on Google login page
   */
  async enterEmail(email: string) {
    await expect(this.emailInput).toBeVisible();
    await this.emailInput.clear();
    await this.emailInput.fill(email);
  }

  /**
   * Click the Next button after entering email
   */
  async clickNext() {
    await expect(this.nextButton).toBeVisible();
    await this.nextButton.click();
  }

  /**
   * Enter password on Google login page (after email step)
   */
  async enterPassword(password: string) {
    // Wait for password input to appear after clicking Next
    await expect(this.passwordInput).toBeVisible();
    await this.passwordInput.clear();
    await this.passwordInput.fill(password);
  }

  /**
   * Complete the sign-in process
   */
  async completeSignIn() {
    await expect(this.signInButton).toBeVisible();
    await this.signInButton.click();
  }

  /**
   * Full login flow with email and password
   */
  async login(email: string, password: string) {
    await this.enterEmail(email);
    await this.clickNext();
    await this.enterPassword(password);
    await this.completeSignIn();
  }

  /**
   * Navigate to create account flow
   */
  async clickCreateAccount() {
    await expect(this.createAccountButton).toBeVisible();
    await this.createAccountButton.click();
  }

  /**
   * Click forgot email link
   */
  async clickForgotEmail() {
    await expect(this.forgotEmailLink).toBeVisible();
    await this.forgotEmailLink.click();
  }

  /**
   * Verify we're on YouTube homepage
   */
  async verifyOnHomepage() {
    await expect(this.page).toHaveURL(/youtube\.com/);
    await expect(this.headerSignInButton).toBeVisible();
    await expect(this.homeTab).toBeVisible();
  }

  /**
   * Verify we're on Google login page
   */
  async verifyOnLoginPage() {
    await expect(this.page).toHaveURL(/accounts\.google\.com/);
    await expect(this.signInPageHeading).toBeVisible();
    await expect(this.emailInput).toBeVisible();
  }

  /**
   * Search for content on YouTube (when not signed in)
   */
  async search(query: string) {
    await expect(this.searchBox).toBeVisible();
    await this.searchBox.fill(query);
    await this.searchBox.press("Enter");
  }

  /**
   * Check if user appears to be signed in (header sign-in button should not be visible)
   */
  async isSignedIn(): Promise<boolean> {
    try {
      await expect(this.headerSignInButton).toBeHidden({ timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Wait for navigation after login completion
   */
  async waitForLoginSuccess() {
    // Wait for redirect back to YouTube
    await expect(this.page).toHaveURL(/youtube\.com/, { timeout: 10000 });

    // Verify sign-in button is no longer visible (indicating successful login)
    await expect(this.headerSignInButton).toBeHidden();
  }
}
