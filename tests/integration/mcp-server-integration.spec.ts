/**
 * Integration test for MCP server with bundled bridge
 * Tests that the bridge works correctly when called through the MCP server layer
 *
 * ⚠️  DEMO FILE DEPENDENCY:
 * This test relies on demo/worst-case/demo-page.html for integration testing.
 * The demo page must contain:
 * - "Add to Cart" buttons
 * - Search input with "Search products" placeholder/label
 * - Product card structure with repeating patterns
 *
 * If you move or modify the demo file structure, update DEMO_PAGE_PATH below!
 */
import { test, expect } from "@playwright/test";
import { VerdexMCPServer } from "../../src/index.js";
import path from "path";
import { fileURLToPath } from "url";

// ⚠️ DEMO FILE PATH - Be careful when moving/renaming demo files!
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEMO_PAGE_PATH = `file://${path.resolve(
  __dirname,
  "../../demo/worst-case/demo-page.html"
)}`;

test.describe("MCP Server Integration with Bundled Bridge", () => {
  let server: VerdexMCPServer;

  test.beforeEach(async () => {
    server = new VerdexMCPServer();
    // Note: We're testing the server instance directly, not via stdio transport
  });

  test.afterEach(async () => {
    if (server) {
      // @ts-ignore - Access private browser for cleanup
      if ((server as any).browser) {
        // Add a small delay to ensure all async operations complete before closing
        await new Promise((resolve) => setTimeout(resolve, 100));
        await (server as any).browser.close();
      }
    }
  });

  test("should initialize browser and verify bridge injection via MCP layer", async () => {
    // Initialize browser through MCP server
    // @ts-ignore - Access private browser for testing
    await server.browser.initialize();

    // Verify browser is initialized
    // @ts-ignore
    expect(server.browser).toBeDefined();

    // Navigate to a page
    // @ts-ignore
    const snapshot = await server.browser.navigate("https://example.com");

    // Verify the bridge worked - snapshot should have data
    expect(snapshot).toBeDefined();
    expect(snapshot.text).toBeDefined();
    expect(snapshot.elementCount).toBeGreaterThanOrEqual(0);
    expect(snapshot.navigation).toBeDefined();
    expect(snapshot.navigation?.success).toBe(true);

    console.log(`✅ Bridge injection verified via MCP server`);
    console.log(`   - Elements found: ${snapshot.elementCount}`);
    console.log(`   - Page title: ${snapshot.navigation?.pageTitle}`);
  });

  test("should successfully call browser_snapshot through MCP server", async () => {
    // @ts-ignore
    await server.browser.initialize();
    // @ts-ignore
    await server.browser.navigate("https://example.com");

    // Take snapshot through browser instance (simulates MCP tool call)
    // @ts-ignore
    const snapshot = await server.browser.snapshot();

    expect(snapshot).toBeDefined();
    expect(snapshot.text).toBeTruthy();
    expect(snapshot.elementCount).toBeGreaterThan(0);

    console.log(`✅ browser_snapshot working via MCP server`);
    console.log(`   - Snapshot text length: ${snapshot.text.length} chars`);
  });

  test("should successfully call browser_click through MCP server", async () => {
    // @ts-ignore
    await server.browser.initialize();

    // Load the demo page
    // @ts-ignore
    await server.browser.navigate(DEMO_PAGE_PATH);

    // Take snapshot to find interactive elements
    // @ts-ignore
    const snapshot = await server.browser.snapshot();

    // Find first "Add to Cart" button ref
    const addToCartMatch = snapshot.text.match(/Add to Cart.*?\[ref=(e\d+)\]/);
    expect(addToCartMatch).toBeTruthy();

    const buttonRef = addToCartMatch![1];
    console.log(`✅ Found Add to Cart button: ${buttonRef}`);

    // Click the button through MCP server
    // @ts-ignore
    await server.browser.click(buttonRef);

    // Take a snapshot after click to ensure operation completed
    // @ts-ignore
    await server.browser.snapshot();

    console.log(`✅ browser_click working via MCP server`);
    console.log(`   - Successfully clicked button ref: ${buttonRef}`);
  });

  test("should successfully call browser_type through MCP server", async () => {
    // @ts-ignore
    await server.browser.initialize();

    // @ts-ignore
    await server.browser.navigate(DEMO_PAGE_PATH);

    // @ts-ignore
    const snapshot = await server.browser.snapshot();

    // Find the search input
    const searchInputMatch = snapshot.text.match(
      /Search products.*?\[ref=(e\d+)\]/
    );
    expect(searchInputMatch).toBeTruthy();

    const inputRef = searchInputMatch![1];
    console.log(`✅ Found search input: ${inputRef}`);

    // Type into the input through MCP server
    const searchText = "iPhone 15 Pro";
    // @ts-ignore
    await server.browser.type(inputRef, searchText);

    // Take a snapshot after typing to ensure operation completed
    // @ts-ignore
    await server.browser.snapshot();

    console.log(`✅ browser_type working via MCP server`);
    console.log(`   - Successfully typed "${searchText}" into ${inputRef}`);
  });

  test("should successfully call resolve_container through MCP server", async () => {
    // @ts-ignore
    await server.browser.initialize();

    // @ts-ignore
    await server.browser.navigate(DEMO_PAGE_PATH);

    // @ts-ignore
    const snapshot = await server.browser.snapshot();

    // Find an "Add to Cart" button
    const buttonMatch = snapshot.text.match(/Add to Cart.*?\[ref=(e\d+)\]/);
    expect(buttonMatch).toBeTruthy();

    const buttonRef = buttonMatch![1];

    // Get ancestors through MCP server
    // @ts-ignore
    const ancestorsResult = await server.browser.resolve_container(buttonRef);

    expect(ancestorsResult).toBeDefined();
    expect(ancestorsResult.target).toBeDefined();
    expect(ancestorsResult.target.ref).toBe(buttonRef);
    expect(ancestorsResult.ancestors).toBeDefined();
    expect(Array.isArray(ancestorsResult.ancestors)).toBe(true);

    console.log(`✅ resolve_container working via MCP server`);
    console.log(`   - Target: ${ancestorsResult.target.tagName}`);
    console.log(`   - Ancestor levels: ${ancestorsResult.ancestors.length}`);

    // Verify we found meaningful ancestors
    expect(ancestorsResult.ancestors.length).toBeGreaterThan(0);
  });

  test("should successfully call inspect_pattern through MCP server", async () => {
    // @ts-ignore
    await server.browser.initialize();

    // @ts-ignore
    await server.browser.navigate(DEMO_PAGE_PATH);

    // @ts-ignore
    const snapshot = await server.browser.snapshot();

    // Find a product card button
    const buttonMatch = snapshot.text.match(/Add to Cart.*?\[ref=(e\d+)\]/);
    expect(buttonMatch).toBeTruthy();

    const buttonRef = buttonMatch![1];

    // First get ancestors to find a good level
    // @ts-ignore
    const ancestorsResult = await server.browser.resolve_container(buttonRef);

    // Try ancestor level 3 (should be around product card level)
    const testLevel = Math.min(3, ancestorsResult.ancestors.length);

    // Get siblings through MCP server
    // @ts-ignore
    const siblingsResult = await server.browser.inspect_pattern(
      buttonRef,
      testLevel
    );

    expect(siblingsResult).toBeDefined();
    expect(siblingsResult.siblings).toBeDefined();
    expect(Array.isArray(siblingsResult.siblings)).toBe(true);

    console.log(`✅ inspect_pattern working via MCP server`);
    console.log(`   - Ancestor level: ${siblingsResult.ancestorLevel}`);
    console.log(`   - Siblings found: ${siblingsResult.siblings.length}`);
  });

  test("should successfully call extract_anchors through MCP server", async () => {
    // @ts-ignore
    await server.browser.initialize();

    // @ts-ignore
    await server.browser.navigate(DEMO_PAGE_PATH);

    // @ts-ignore
    const snapshot = await server.browser.snapshot();

    // Find a product card button
    const buttonMatch = snapshot.text.match(/Add to Cart.*?\[ref=(e\d+)\]/);
    expect(buttonMatch).toBeTruthy();

    const buttonRef = buttonMatch![1];

    // First get ancestors
    // @ts-ignore
    const ancestorsResult = await server.browser.resolve_container(buttonRef);

    // Try ancestor level 2-3 (should show product card internals)
    const testLevel = Math.min(2, ancestorsResult.ancestors.length);

    // Get descendants through MCP server
    // @ts-ignore
    const descendantsResult = await server.browser.extract_anchors(
      buttonRef,
      testLevel
    );

    expect(descendantsResult).toBeDefined();
    expect(descendantsResult.ancestorAt).toBeDefined();
    expect(descendantsResult.descendants).toBeDefined();
    expect(Array.isArray(descendantsResult.descendants)).toBe(true);

    console.log(`✅ extract_anchors working via MCP server`);
    console.log(`   - Ancestor: ${descendantsResult.ancestorAt.tagName}`);
    console.log(
      `   - Direct descendants: ${descendantsResult.descendants.length}`
    );
    console.log(
      `   - Total descendants: ${descendantsResult.totalDescendants}`
    );
    console.log(`   - Max depth reached: ${descendantsResult.maxDepthReached}`);
  });
});
