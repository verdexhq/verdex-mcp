// uses playwright to run the selectors
// uses the selector extractor to extract the selectors
// uses the selector engine to run the selectors
// returns the results to handle-payload.ts

import { chromium, Browser, Page } from "playwright";
import { Selector, SelectorTestResult, SelectorTestError } from "./types";
import * as path from "path";

export async function runSelectors(
  selectors: Selector[],
  authFile: string,
  url: string,
  file: string
): Promise<SelectorTestResult> {
  let browser: Browser | null = null;
  const errors: SelectorTestError[] = [];
  let successful = 0;
  let failed = 0;

  try {
    // Launch browser with auth state
    browser = await chromium.launch();
    const context = await browser.newContext({
      storageState: authFile,
    });
    const page = await context.newPage();

    // Navigate to URL
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    } catch (error) {
      // Navigation failed - all selectors will fail
      const navError: SelectorTestError = {
        name: "navigation",
        selector: url,
        line: 0,
        error_type: "navigation_error",
        error_message: `Failed to navigate to ${url}: ${
          (error as Error).message
        }`,
      };

      return {
        file: path.basename(file),
        url,
        summary: {
          total: selectors.length,
          successful: 0,
          failed: selectors.length,
        },
        errors: [navError],
      };
    }

    // Test each selector
    for (const selector of selectors) {
      const error = await testSingleSelector(page, selector);
      if (error) {
        errors.push(error);
        failed++;
      } else {
        successful++;
      }
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return {
    file: path.basename(file),
    url,
    summary: {
      total: selectors.length,
      successful,
      failed,
    },
    errors,
  };
}

async function testSingleSelector(
  page: Page,
  selector: Selector
): Promise<SelectorTestError | null> {
  try {
    // Execute the selector as JavaScript code to get the locator
    let locator;
    try {
      // Create a function that executes the selector with page in scope
      const selectorFunction = new Function(
        "page",
        `return ${selector.selector}`
      );
      locator = selectorFunction(page);
    } catch (evalError) {
      // If execution fails, try as a CSS selector fallback
      locator = page.locator(selector.selector);
    }

    const count = await locator.count();

    if (count === 0) {
      return {
        name: selector.name,
        selector: selector.selector,
        line: selector.line,
        error_type: "timeout_error",
        error_message: `Timeout exceeded waiting for ${selector.selector}`,
      };
    }

    // Check for ambiguous selectors (multiple matches without .first() or .last())
    if (
      count > 1 &&
      !selector.selector.includes(".first()") &&
      !selector.selector.includes(".last()")
    ) {
      return {
        name: selector.name,
        selector: selector.selector,
        line: selector.line,
        error_type: "ambiguous_selector",
        error_message: `Selector matches ${count} elements but may be ambiguous`,
        element_count: count,
      };
    }

    return null; // Success
  } catch (error) {
    const errorMessage = (error as Error).message;

    // Categorize different types of selector errors
    if (errorMessage.includes("is not a valid role")) {
      return {
        name: selector.name,
        selector: selector.selector,
        line: selector.line,
        error_type: "invalid_selector",
        error_message: errorMessage,
      };
    }

    if (errorMessage.includes("Timeout")) {
      return {
        name: selector.name,
        selector: selector.selector,
        line: selector.line,
        error_type: "timeout_error",
        error_message: errorMessage,
      };
    }

    // Generic selector error
    return {
      name: selector.name,
      selector: selector.selector,
      line: selector.line,
      error_type: "invalid_selector",
      error_message: errorMessage,
    };
  }
}
