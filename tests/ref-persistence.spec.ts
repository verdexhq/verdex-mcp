/**
 * Tests for ref persistence across snapshots
 * Verifies that element refs stay consistent within a page session
 */
import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../src/runtime/MultiContextBrowser.js";

test.describe("Ref Persistence", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.initialize();
  });

  test.afterEach(async () => {
    if (browser) {
      await browser.close();
    }
  });

  test("Test 1: refs persist across snapshots", async () => {
    // Navigate to a simple page
    await browser.navigate("data:text/html,<button>Click me</button>");

    // Take first snapshot
    const snapshot1 = await browser.snapshot();
    expect(snapshot1.text).toContain("[ref=e1]");

    // Take second snapshot - ref should stay the same
    const snapshot2 = await browser.snapshot();
    expect(snapshot2.text).toContain("[ref=e1]");

    // Click should still work with the original ref
    await browser.click("e1");
  });

  test("Test 2: refs cleaned when element removed", async () => {
    // Create a page with buttons that can be removed
    await browser.navigate(
      "data:text/html,<button id='btn1'>Target</button><button id='btn2'>Keeper</button><button onclick=\"document.getElementById('btn1').remove()\">Remove</button>"
    );

    // Take snapshot - should have three buttons
    const snapshot1 = await browser.snapshot();
    const refs1 = snapshot1.text.match(/\[ref=e\d+\]/g) || [];
    expect(refs1.length).toBe(3); // Three interactive buttons
    expect(snapshot1.text).toContain("Target");
    expect(snapshot1.text).toContain("Keeper");

    // Find the Remove button ref (should be e3)
    const removeButtonMatch = snapshot1.text.match(
      /button Remove \[ref=(e\d+)\]/
    );
    expect(removeButtonMatch).toBeTruthy();
    const removeButtonRef = removeButtonMatch![1];

    // Click the remove button to remove Target button
    await browser.click(removeButtonRef);

    // Wait a moment for removal
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Take new snapshot - Target button should be gone, but Keeper and Remove should persist
    const snapshot2 = await browser.snapshot();
    expect(snapshot2.text).not.toContain("Target"); // Target button is gone
    expect(snapshot2.text).toContain("Keeper"); // Keeper button still exists
    expect(snapshot2.text).toContain("Remove"); // Remove button still exists

    // Should only have 2 refs now
    const refs2 = snapshot2.text.match(/\[ref=e\d+\]/g) || [];
    expect(refs2.length).toBe(2); // Only two buttons remain
  });

  test("Test 3: refs reset on navigation", async () => {
    // Navigate to first page
    await browser.navigate("data:text/html,<button>Page 1</button>");
    const snapshot1 = await browser.snapshot();
    expect(snapshot1.text).toContain("[ref=e1]");

    // Navigate to second page
    await browser.navigate("data:text/html,<button>Page 2</button>");
    const snapshot2 = await browser.snapshot();

    // Counter should reset - new page starts with e1 again
    expect(snapshot2.text).toContain("[ref=e1]");
    expect(snapshot2.text).toContain("Page 2");
  });

  test("Test 4: handles browser back/forward", async () => {
    const context = await browser["ensureCurrentRoleContext"]();

    // Navigate to first page
    await browser.navigate("data:text/html,<button>Page 1</button>");
    const snap1 = await browser.snapshot();
    expect(snap1.text).toContain("[ref=e1]");

    // Navigate to second page
    await browser.navigate("data:text/html,<button>Page 2</button>");

    // Go back using Puppeteer API
    await context.page.goBack();

    // Wait a moment for navigation
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Take snapshot - should have fresh refs
    const snap2 = await browser.snapshot();
    expect(snap2.text).toContain("[ref=e1]");
    expect(snap2.text).toContain("Page 1");

    // Click should work
    await browser.click("e1");
  });

  test("Test 5: Multi-turn LLM workflow", async () => {
    // Create a page that simulates a product card with modal
    await browser.navigate(`data:text/html,
      <div>
        <button id="addToCart">Add to Cart</button>
        <dialog id="modal">
          <p>Added to cart!</p>
          <button onclick="document.getElementById('modal').close()">Close</button>
        </dialog>
      </div>
      <script>
        document.getElementById('addToCart').onclick = () => {
          document.getElementById('modal').showModal();
        };
      </script>
    `);

    // Turn 1: Navigate and take snapshot
    const snap1 = await browser.snapshot();
    expect(snap1.text).toContain("Add to Cart");
    expect(snap1.text).toContain("[ref=e1]"); // The "Add to Cart" button

    // Turn 2: Explore structure (would use resolve_container in real workflow)
    const container = await browser.resolve_container("e1");
    expect(container).toBeTruthy();
    expect(container.target.tagName.toUpperCase()).toBe("BUTTON");

    // Turn 3: Interact - click to open modal
    await browser.click("e1");

    // Turn 4: Check result - take new snapshot
    const snap2 = await browser.snapshot();
    expect(snap2.text).toContain("Added to cart");
    expect(snap2.text).toContain("[ref=e2]"); // Close button in modal

    // Turn 5: CRITICAL - Can still explore original element
    // The "Add to Cart" button (e1) should still be valid
    const containerAgain = await browser.resolve_container("e1");
    expect(containerAgain).toBeTruthy();
    expect(containerAgain.target.tagName.toUpperCase()).toBe("BUTTON");

    // And we can interact with the new modal elements
    await browser.click("e2"); // Close the modal

    // Final snapshot should still show e1
    const snap3 = await browser.snapshot();
    expect(snap3.text).toContain("[ref=e1]");
  });

  test("Additional: refs persist after dynamic content changes", async () => {
    // Create a page with dynamic content that adds (not replaces) buttons
    await browser.navigate(`data:text/html,
      <button id="btn">Click me</button>
      <div id="content"></div>
      <script>
        let count = 0;
        document.getElementById('btn').onclick = () => {
          count++;
          const newBtn = document.createElement('button');
          newBtn.textContent = 'New button ' + count;
          newBtn.id = 'new' + count;
          document.getElementById('content').appendChild(newBtn);
        };
      </script>
    `);

    // Initial snapshot
    const snap1 = await browser.snapshot();
    expect(snap1.text).toContain("[ref=e1]"); // Original button

    // Click to add new content
    await browser.click("e1");
    await new Promise((resolve) => setTimeout(resolve, 50));

    // New snapshot - original button should keep e1
    const snap2 = await browser.snapshot();
    expect(snap2.text).toContain("[ref=e1]"); // Original button persists
    expect(snap2.text).toContain("[ref=e2]"); // New button gets e2

    // Original button should still work
    await browser.click("e1");
    await new Promise((resolve) => setTimeout(resolve, 50));

    // After another click, new content gets e3
    const snap3 = await browser.snapshot();
    expect(snap3.text).toContain("[ref=e1]"); // Still has e1
    expect(snap3.text).toContain("[ref=e2]"); // First new button keeps e2
    expect(snap3.text).toContain("[ref=e3]"); // Second new button gets e3
  });

  test("Additional: error handling for missing refs", async () => {
    await browser.navigate("data:text/html,<button>Test</button>");
    const snap = await browser.snapshot();
    expect(snap.text).toContain("[ref=e1]");

    // Try to click non-existent ref
    await expect(browser.click("e99")).rejects.toThrow("Element e99 not found");
  });

  test("Additional: error handling for stale refs", async () => {
    // Create page where we can remove the button
    await browser.navigate(`data:text/html,
      <div>
        <button id="btn">Click to remove me</button>
        <script>
          document.getElementById('btn').onclick = function() {
            setTimeout(() => {
              document.getElementById('btn').remove();
            }, 50);
          };
        </script>
      </div>
    `);

    const snap = await browser.snapshot();
    expect(snap.text).toContain("[ref=e1]");

    // Click the button (which will remove itself)
    await browser.click("e1");

    // Wait for element to be removed
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Try to click removed element
    await expect(browser.click("e1")).rejects.toThrow("was removed from DOM");
  });
});
