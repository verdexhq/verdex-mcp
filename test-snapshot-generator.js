#!/usr/bin/env node

/**
 * Comprehensive test for SnapshotGenerator
 * Tests the SnapshotGenerator as it would be used by the MCP server
 */

import { JSDOM } from "jsdom";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the compiled SnapshotGenerator code
const snapshotGeneratorCode = readFileSync(
  join(__dirname, "dist/injected/core/SnapshotGenerator.js"),
  "utf8"
);
const ariaUtilsCode = readFileSync(
  join(__dirname, "dist/injected/utils/AriaUtils.js"),
  "utf8"
);

/**
 * Mock Bridge implementation that mimics the IBridge interface
 */
class MockBridge {
  constructor() {
    this.elements = new Map();
    this.counter = 0;
  }

  getAttributes(element) {
    const attrs = {};
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      attrs[attr.name] = attr.value;
    }
    return attrs;
  }
}

/**
 * Set up a DOM environment with the given HTML
 */
function setupDOM(html) {
  const dom = new JSDOM(html, {
    url: "http://localhost",
    pretendToBeVisual: true,
    resources: "usable",
  });

  const window = dom.window;
  const document = window.document;

  // Make global objects available
  global.window = window;
  global.document = document;
  global.Element = window.Element;
  global.Node = window.Node;
  global.HTMLElement = window.HTMLElement;
  global.HTMLInputElement = window.HTMLInputElement;
  global.HTMLButtonElement = window.HTMLButtonElement;
  global.HTMLSelectElement = window.HTMLSelectElement;
  global.HTMLTextAreaElement = window.HTMLTextAreaElement;
  global.HTMLSlotElement = window.HTMLSlotElement;

  return { window, document };
}

/**
 * Inject and execute the SnapshotGenerator code in the DOM context
 */
function injectSnapshotGenerator(window) {
  // Create a script element and execute the code
  const script = window.document.createElement("script");
  script.textContent = `
    ${ariaUtilsCode}
    ${snapshotGeneratorCode}
    
    // Make classes available globally
    window.SnapshotGenerator = SnapshotGenerator;
    window.AriaUtils = AriaUtils;
  `;

  window.document.head.appendChild(script);

  return {
    SnapshotGenerator: window.SnapshotGenerator,
    AriaUtils: window.AriaUtils,
  };
}

/**
 * Test runner
 */
class SnapshotGeneratorTest {
  constructor() {
    this.testCount = 0;
    this.passCount = 0;
    this.failCount = 0;
  }

  test(name, testFn) {
    this.testCount++;
    console.log(`\n🧪 Test ${this.testCount}: ${name}`);
    console.log("=".repeat(50));

    try {
      testFn();
      this.passCount++;
      console.log("✅ PASS");
    } catch (error) {
      this.failCount++;
      console.log("❌ FAIL");
      console.error("Error:", error.message);
      if (error.stack) {
        console.error("Stack:", error.stack);
      }
    }
  }

  assertEqual(actual, expected, message = "") {
    if (actual !== expected) {
      throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`);
    }
  }

  assertContains(text, substring, message = "") {
    if (!text.includes(substring)) {
      throw new Error(
        `${message}\nExpected text to contain: "${substring}"\nActual text: "${text}"`
      );
    }
  }

  assertMatches(text, regex, message = "") {
    if (!regex.test(text)) {
      throw new Error(
        `${message}\nExpected text to match: ${regex}\nActual text: "${text}"`
      );
    }
  }

  summary() {
    console.log("\n" + "=".repeat(60));
    console.log("📊 TEST SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total tests: ${this.testCount}`);
    console.log(`✅ Passed: ${this.passCount}`);
    console.log(`❌ Failed: ${this.failCount}`);

    if (this.failCount === 0) {
      console.log("\n🎉 All tests passed!");
      return true;
    } else {
      console.log(`\n💥 ${this.failCount} test(s) failed`);
      return false;
    }
  }
}

// Run the tests
const tester = new SnapshotGeneratorTest();

// Test 1: Basic HTML structure
tester.test("Basic HTML structure with button", () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head><title>Test Page</title></head>
      <body>
        <h1>Welcome</h1>
        <button>Click me</button>
        <p>Some text content</p>
      </body>
    </html>
  `;

  const { window, document } = setupDOM(html);
  const { SnapshotGenerator } = injectSnapshotGenerator(window);

  const bridge = new MockBridge();
  const generator = new SnapshotGenerator(bridge, {});
  const result = generator.generate();

  console.log("Generated snapshot:");
  console.log(result.text);

  // Verify basic structure
  tester.assertContains(
    result.text,
    '- heading "Welcome"',
    "Should contain heading"
  );
  tester.assertContains(
    result.text,
    '- button "Click me"',
    "Should contain button"
  );
  tester.assertContains(
    result.text,
    '- text: "Some text content"',
    "Should contain text"
  );

  // Verify button got a reference
  tester.assertMatches(
    result.text,
    /- button "Click me" \[ref=e\d+\]/,
    "Button should have reference"
  );

  // Verify element count
  tester.assertEqual(
    result.elementCount,
    1,
    "Should have 1 interactive element"
  );
});

// Test 2: Form elements
tester.test("Form elements with various input types", () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <body>
        <form>
          <label for="name">Name:</label>
          <input type="text" id="name" placeholder="Enter your name">
          
          <label for="email">Email:</label>
          <input type="email" id="email">
          
          <input type="checkbox" id="subscribe"> Subscribe to newsletter
          
          <select id="country">
            <option value="us">United States</option>
            <option value="ca">Canada</option>
          </select>
          
          <textarea id="message" placeholder="Your message"></textarea>
          
          <button type="submit">Submit</button>
        </form>
      </body>
    </html>
  `;

  const { window, document } = setupDOM(html);
  const { SnapshotGenerator } = injectSnapshotGenerator(window);

  const bridge = new MockBridge();
  const generator = new SnapshotGenerator(bridge, {});
  const result = generator.generate();

  console.log("Generated snapshot:");
  console.log(result.text);

  // Verify form elements are captured
  tester.assertContains(
    result.text,
    '- textbox "Name:"',
    "Should contain name textbox"
  );
  tester.assertContains(
    result.text,
    '- textbox "Email:"',
    "Should contain email textbox"
  );
  tester.assertContains(result.text, "- checkbox", "Should contain checkbox");
  tester.assertContains(
    result.text,
    "- combobox",
    "Should contain select as combobox"
  );
  tester.assertContains(
    result.text,
    '- textbox "Your message"',
    "Should contain textarea"
  );
  tester.assertContains(
    result.text,
    '- button "Submit"',
    "Should contain submit button"
  );

  // Verify all interactive elements got references
  const refCount = (result.text.match(/\[ref=e\d+\]/g) || []).length;
  tester.assertEqual(
    refCount,
    result.elementCount,
    "All interactive elements should have refs"
  );
});

// Test 3: ARIA properties
tester.test("ARIA properties and states", () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <body>
        <button aria-pressed="true">Toggle Button</button>
        <input type="checkbox" checked aria-label="Accept terms">
        <div role="tab" aria-selected="true" tabindex="0">Active Tab</div>
        <button aria-expanded="false" aria-controls="menu">Menu</button>
        <input type="text" aria-disabled="true" value="Disabled input">
        <h2 aria-level="2">Level 2 Heading</h2>
      </body>
    </html>
  `;

  const { window, document } = setupDOM(html);
  const { SnapshotGenerator } = injectSnapshotGenerator(window);

  const bridge = new MockBridge();
  const generator = new SnapshotGenerator(bridge, {});
  const result = generator.generate();

  console.log("Generated snapshot:");
  console.log(result.text);

  // Verify ARIA properties are captured
  tester.assertContains(result.text, "[pressed]", "Should show pressed state");
  tester.assertContains(result.text, "[checked]", "Should show checked state");
  tester.assertContains(
    result.text,
    "[selected]",
    "Should show selected state"
  );
  tester.assertContains(
    result.text,
    "[disabled]",
    "Should show disabled state"
  );
  tester.assertContains(result.text, "[level=2]", "Should show heading level");
});

// Test 4: Visibility rules
tester.test("Visibility and exclusion rules", () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <body>
        <button>Visible Button</button>
        <button style="display: none;">Hidden Button</button>
        <button aria-hidden="true">ARIA Hidden Button</button>
        <script>console.log('script content');</script>
        <style>.test { color: red; }</style>
        <div style="visibility: hidden;">
          <button>Button in hidden container</button>
        </div>
        <img src="test.jpg" alt="">
        <img src="test2.jpg" alt="Visible image">
      </body>
    </html>
  `;

  const { window, document } = setupDOM(html);
  const { SnapshotGenerator } = injectSnapshotGenerator(window);

  const bridge = new MockBridge();
  const generator = new SnapshotGenerator(bridge, {});
  const result = generator.generate();

  console.log("Generated snapshot:");
  console.log(result.text);

  // Verify visibility rules
  tester.assertContains(
    result.text,
    '- button "Visible Button"',
    "Should contain visible button"
  );
  tester.assertContains(
    result.text,
    '- img "Visible image"',
    "Should contain image with alt text"
  );

  // Verify hidden elements are excluded
  const hiddenButtonCount = (result.text.match(/Hidden Button/g) || []).length;
  tester.assertEqual(hiddenButtonCount, 0, "Hidden buttons should not appear");

  // Verify script and style are excluded
  tester.assertEqual(
    result.text.includes("script content"),
    false,
    "Script content should be excluded"
  );
  tester.assertEqual(
    result.text.includes("color: red"),
    false,
    "Style content should be excluded"
  );
});

// Test 5: Complex nested structure
tester.test("Complex nested structure with lists and navigation", () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <body>
        <nav>
          <ul>
            <li><a href="/home">Home</a></li>
            <li><a href="/about">About</a></li>
            <li>
              <span>Products</span>
              <ul>
                <li><a href="/products/laptops">Laptops</a></li>
                <li><a href="/products/phones">Phones</a></li>
              </ul>
            </li>
          </ul>
        </nav>
        
        <main>
          <article>
            <header>
              <h1>Article Title</h1>
              <p>By Author Name</p>
            </header>
            <section>
              <h2>Section 1</h2>
              <p>Content goes here...</p>
            </section>
          </article>
        </main>
      </body>
    </html>
  `;

  const { window, document } = setupDOM(html);
  const { SnapshotGenerator } = injectSnapshotGenerator(window);

  const bridge = new MockBridge();
  const generator = new SnapshotGenerator(bridge, {});
  const result = generator.generate();

  console.log("Generated snapshot:");
  console.log(result.text);

  // Verify semantic structure
  tester.assertContains(
    result.text,
    "- navigation",
    "Should contain navigation"
  );
  tester.assertContains(result.text, "- main", "Should contain main");
  tester.assertContains(result.text, "- article", "Should contain article");
  tester.assertContains(result.text, "- list", "Should contain lists");
  tester.assertContains(result.text, "- listitem", "Should contain list items");
  tester.assertContains(result.text, '- link "Home"', "Should contain links");

  // Verify proper nesting with indentation
  const lines = result.text.split("\n");
  const hasProperIndentation = lines.some(
    (line) => line.startsWith("    - ") || line.startsWith("      - ")
  );
  tester.assertEqual(
    hasProperIndentation,
    true,
    "Should have proper indentation for nested elements"
  );
});

// Test 6: Error handling
tester.test("Error handling and edge cases", () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <body>
        <!-- Empty body should not crash -->
      </body>
    </html>
  `;

  const { window, document } = setupDOM(html);
  const { SnapshotGenerator } = injectSnapshotGenerator(window);

  const bridge = new MockBridge();
  const generator = new SnapshotGenerator(bridge, {});
  const result = generator.generate();

  console.log("Generated snapshot:");
  console.log(result.text);

  // Should not crash and should return valid result
  tester.assertEqual(typeof result.text, "string", "Should return string text");
  tester.assertEqual(
    typeof result.elementCount,
    "number",
    "Should return number elementCount"
  );
  tester.assertEqual(
    result.elementCount,
    0,
    "Empty body should have 0 interactive elements"
  );
});

// Test 7: Integration test - simulate MCP server usage
tester.test("Integration test - MCP server usage simulation", () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head><title>Login Page</title></head>
      <body>
        <header>
          <h1>Welcome to MyApp</h1>
          <nav>
            <a href="/login">Login</a>
            <a href="/signup">Sign Up</a>
          </nav>
        </header>
        
        <main>
          <form id="loginForm">
            <h2>Login</h2>
            <div>
              <label for="username">Username:</label>
              <input type="text" id="username" required>
            </div>
            <div>
              <label for="password">Password:</label>
              <input type="password" id="password" required>
            </div>
            <div>
              <input type="checkbox" id="remember"> Remember me
            </div>
            <button type="submit">Login</button>
            <a href="/forgot-password">Forgot password?</a>
          </form>
        </main>
        
        <footer>
          <p>&copy; 2024 MyApp. All rights reserved.</p>
        </footer>
      </body>
    </html>
  `;

  const { window, document } = setupDOM(html);
  const { SnapshotGenerator } = injectSnapshotGenerator(window);

  const bridge = new MockBridge();
  const generator = new SnapshotGenerator(bridge, {});
  const result = generator.generate();

  console.log("Generated snapshot:");
  console.log(result.text);
  console.log(`\nElement count: ${result.elementCount}`);
  console.log("Stored elements:");
  for (const [ref, info] of bridge.elements) {
    console.log(`  ${ref}: ${info.role} "${info.name}" (${info.tagName})`);
  }

  // Verify the snapshot contains expected elements
  tester.assertContains(
    result.text,
    '- heading "Welcome to MyApp"',
    "Should contain main heading"
  );
  tester.assertContains(
    result.text,
    "- navigation",
    "Should contain navigation"
  );
  tester.assertContains(
    result.text,
    '- link "Login"',
    "Should contain login link"
  );
  tester.assertContains(result.text, "- form", "Should contain form");
  tester.assertContains(
    result.text,
    '- textbox "Username:"',
    "Should contain username field"
  );
  tester.assertContains(
    result.text,
    '- textbox "Password:"',
    "Should contain password field"
  );
  tester.assertContains(result.text, "- checkbox", "Should contain checkbox");
  tester.assertContains(
    result.text,
    '- button "Login"',
    "Should contain login button"
  );

  // Verify interactive elements are properly tracked
  tester.assertEqual(
    result.elementCount > 0,
    true,
    "Should have interactive elements"
  );
  tester.assertEqual(
    bridge.elements.size,
    result.elementCount,
    "Bridge should store all interactive elements"
  );

  // Verify references are assigned
  const refMatches = result.text.match(/\[ref=e\d+\]/g) || [];
  tester.assertEqual(
    refMatches.length,
    result.elementCount,
    "All interactive elements should have references"
  );

  // Verify we can find specific elements by their references
  let usernameRef = null;
  let loginButtonRef = null;

  for (const [ref, info] of bridge.elements) {
    if (info.role === "textbox" && info.name.includes("Username")) {
      usernameRef = ref;
    }
    if (info.role === "button" && info.name === "Login") {
      loginButtonRef = ref;
    }
  }

  tester.assertEqual(
    usernameRef !== null,
    true,
    "Should find username textbox reference"
  );
  tester.assertEqual(
    loginButtonRef !== null,
    true,
    "Should find login button reference"
  );
});

// Run all tests and show summary
const allPassed = tester.summary();

// Exit with appropriate code
process.exit(allPassed ? 0 : 1);
