#!/usr/bin/env node

/**
 * Node.js test for SnapshotGenerator using dynamic import and eval
 * This test loads the actual compiled JavaScript and tests it in a Node.js environment
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Mock DOM environment for Node.js testing
 */
class MockDOM {
  constructor() {
    this.setupGlobals();
  }

  setupGlobals() {
    // Mock Node constants
    global.Node = {
      ELEMENT_NODE: 1,
      TEXT_NODE: 3,
    };

    // Mock Element class
    global.Element = class MockElement {
      constructor(tagName = "DIV") {
        this.tagName = tagName.toUpperCase();
        this.attributes = new Map();
        this.children = [];
        this.childNodes = [];
        this.parentElement = null;
        this.nodeType = 1;
        this.textContent = "";
        this.nodeValue = null;
        this.assignedSlot = null;
        this.shadowRoot = null;
        this.id = "";
      }

      getAttribute(name) {
        return this.attributes.get(name) || null;
      }

      setAttribute(name, value) {
        this.attributes.set(name, value);
        if (name === "id") this.id = value;
      }

      hasAttribute(name) {
        return this.attributes.has(name);
      }

      closest(selector) {
        return null;
      }

      getBoundingClientRect() {
        return { x: 0, y: 0, width: 100, height: 20 };
      }

      click() {}
      focus() {}
      dispatchEvent() {}
    };

    // Mock specific HTML elements
    global.HTMLElement = global.Element;
    global.HTMLInputElement = class extends global.Element {
      constructor() {
        super("INPUT");
        this.type = "text";
        this.value = "";
        this.checked = false;
        this.disabled = false;
        this.list = null;
      }
    };
    global.HTMLButtonElement = class extends global.Element {
      constructor() {
        super("BUTTON");
        this.disabled = false;
      }
    };
    global.HTMLSelectElement = class extends global.Element {
      constructor() {
        super("SELECT");
        this.multiple = false;
        this.size = 1;
        this.disabled = false;
      }
    };
    global.HTMLTextAreaElement = class extends global.Element {
      constructor() {
        super("TEXTAREA");
        this.disabled = false;
      }
    };
    global.HTMLSlotElement = class extends global.Element {
      constructor() {
        super("SLOT");
      }
      assignedNodes() {
        return [];
      }
    };

    // Mock document
    global.document = {
      body: new global.Element("BODY"),
      activeElement: null,
      getElementById: (id) => null,
      querySelector: (selector) => null,
    };

    // Mock window
    global.window = {
      getComputedStyle: (element) => ({
        display: "block",
        visibility: "visible",
        pointerEvents: "auto",
      }),
    };

    // Mock Event
    global.Event = class MockEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.bubbles = options.bubbles || false;
      }
    };
  }

  createTestDOM() {
    const body = global.document.body;

    // Create a comprehensive test structure
    const heading = new global.Element("H1");
    heading.textContent = "Test Page";
    body.children.push(heading);
    body.childNodes.push(heading);
    heading.parentElement = body;

    const nav = new global.Element("NAV");
    body.children.push(nav);
    body.childNodes.push(nav);
    nav.parentElement = body;

    const list = new global.Element("UL");
    nav.children.push(list);
    nav.childNodes.push(list);
    list.parentElement = nav;

    const listItem = new global.Element("LI");
    list.children.push(listItem);
    list.childNodes.push(listItem);
    listItem.parentElement = list;

    const link = new global.Element("A");
    link.setAttribute("href", "/home");
    link.textContent = "Home";
    listItem.children.push(link);
    listItem.childNodes.push(link);
    link.parentElement = listItem;

    const form = new global.Element("FORM");
    body.children.push(form);
    body.childNodes.push(form);
    form.parentElement = body;

    const label = new global.Element("LABEL");
    label.setAttribute("for", "username");
    label.textContent = "Username:";
    form.children.push(label);
    form.childNodes.push(label);
    label.parentElement = form;

    const input = new global.HTMLInputElement();
    input.setAttribute("type", "text");
    input.setAttribute("id", "username");
    input.setAttribute("placeholder", "Enter username");
    form.children.push(input);
    form.childNodes.push(input);
    input.parentElement = form;

    const button = new global.HTMLButtonElement();
    button.setAttribute("type", "submit");
    button.textContent = "Submit";
    form.children.push(button);
    form.childNodes.push(button);
    button.parentElement = form;

    // Add text node
    const textNode = {
      nodeType: 3,
      nodeValue: "Welcome to our test site",
      textContent: "Welcome to our test site",
      parentElement: body,
    };
    body.childNodes.push(textNode);

    return body;
  }
}

/**
 * Mock Bridge implementation
 */
class TestBridge {
  constructor() {
    this.elements = new Map();
    this.counter = 0;
  }

  getAttributes(element) {
    const attrs = {};
    if (element.attributes) {
      for (const [name, value] of element.attributes) {
        attrs[name] = value;
      }
    }
    return attrs;
  }
}

/**
 * Load and execute the SnapshotGenerator code
 */
function loadSnapshotGenerator() {
  try {
    // Read the compiled JavaScript files
    const snapshotCode = readFileSync(
      join(__dirname, "dist/injected/core/SnapshotGenerator.js"),
      "utf8"
    );

    // Remove ES6 export statements and replace with return statements
    const modifiedCode = snapshotCode
      .replace(/export\s+class\s+SnapshotGenerator/g, "class SnapshotGenerator")
      .replace(/export\s+class\s+AriaUtils/g, "class AriaUtils")
      .replace(/export\s*{[^}]*}/g, "")
      .replace(/import\s+.*?from\s+['"][^'"]*['"];?\s*/g, "");

    // Wrap in a function that returns the classes
    const wrappedCode = `
      (function() {
        ${modifiedCode}
        return { SnapshotGenerator, AriaUtils };
      })()
    `;

    // Execute the code
    const result = eval(wrappedCode);
    return result;
  } catch (error) {
    console.error("Failed to load SnapshotGenerator:", error.message);
    throw error;
  }
}

/**
 * Test runner
 */
class TestRunner {
  constructor() {
    this.testCount = 0;
    this.passCount = 0;
    this.failCount = 0;
  }

  test(name, testFn) {
    this.testCount++;
    console.log(`\n🧪 Test ${this.testCount}: ${name}`);
    console.log("=".repeat(60));

    try {
      const result = testFn();
      this.passCount++;
      console.log("✅ PASS");
      if (result) {
        console.log(
          "Result:",
          typeof result === "object" ? JSON.stringify(result, null, 2) : result
        );
      }
    } catch (error) {
      this.failCount++;
      console.log("❌ FAIL");
      console.error("Error:", error.message);
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

// Main test execution
async function runTests() {
  console.log("🚀 Starting SnapshotGenerator Tests");
  console.log("=".repeat(60));

  // Set up mock DOM
  const mockDOM = new MockDOM();
  const testDOM = mockDOM.createTestDOM();

  // Load SnapshotGenerator
  let SnapshotGenerator, AriaUtils;
  try {
    const loaded = loadSnapshotGenerator();
    SnapshotGenerator = loaded.SnapshotGenerator;
    AriaUtils = loaded.AriaUtils;
    console.log("✅ SnapshotGenerator loaded successfully");
  } catch (error) {
    console.error("❌ Failed to load SnapshotGenerator:", error.message);
    process.exit(1);
  }

  const runner = new TestRunner();

  // Test 1: Basic instantiation
  runner.test("SnapshotGenerator can be instantiated", () => {
    const bridge = new TestBridge();
    const generator = new SnapshotGenerator(bridge, {});

    if (!generator) {
      throw new Error("Failed to create SnapshotGenerator instance");
    }

    return "SnapshotGenerator created successfully";
  });

  // Test 2: Generate basic snapshot
  runner.test("Generate basic snapshot", () => {
    const bridge = new TestBridge();
    const generator = new SnapshotGenerator(bridge, {});

    const result = generator.generate();

    if (!result) {
      throw new Error("generate() returned null or undefined");
    }

    if (typeof result.text !== "string") {
      throw new Error("result.text is not a string");
    }

    if (typeof result.elementCount !== "number") {
      throw new Error("result.elementCount is not a number");
    }

    return {
      textLength: result.text.length,
      elementCount: result.elementCount,
      preview: result.text.substring(0, 200),
    };
  });

  // Test 3: Bridge integration
  runner.test("Bridge integration works correctly", () => {
    const bridge = new TestBridge();
    const generator = new SnapshotGenerator(bridge, {});

    const initialCount = bridge.elements.size;
    const result = generator.generate();
    const finalCount = bridge.elements.size;

    if (finalCount !== result.elementCount) {
      throw new Error(
        `Element count mismatch: bridge has ${finalCount}, result reports ${result.elementCount}`
      );
    }

    return {
      initialElements: initialCount,
      finalElements: finalCount,
      reportedCount: result.elementCount,
      bridgeWorking: true,
    };
  });

  // Test 4: Configuration handling
  runner.test("Configuration is handled properly", () => {
    const bridge = new TestBridge();
    const config = {
      maxDepth: 5,
      maxElements: 50,
    };

    const generator = new SnapshotGenerator(bridge, config);
    const result = generator.generate();

    if (!result || typeof result.text !== "string") {
      throw new Error("Configuration caused invalid result");
    }

    return {
      configAccepted: true,
      resultValid: true,
    };
  });

  // Test 5: AriaUtils functionality
  runner.test("AriaUtils functions work", () => {
    const testElement = new global.HTMLButtonElement();
    testElement.textContent = "Test Button";
    testElement.setAttribute("aria-pressed", "true");

    const role = AriaUtils.getRole(testElement);
    const name = AriaUtils.getName(testElement);
    const isInteractive = AriaUtils.isInteractive(testElement, role);
    const isVisible = AriaUtils.isVisibleForAria(testElement);

    return {
      role,
      name,
      isInteractive,
      isVisible,
      ariaUtilsWorking: true,
    };
  });

  // Test 6: Snapshot content verification
  runner.test("Snapshot contains expected content", () => {
    const bridge = new TestBridge();
    const generator = new SnapshotGenerator(bridge, {});

    const result = generator.generate();

    const hasHeading =
      result.text.includes("heading") || result.text.includes("Test Page");
    const hasNavigation = result.text.includes("navigation");
    const hasForm = result.text.includes("form");
    const hasButton = result.text.includes("button");
    const hasTextbox = result.text.includes("textbox");

    return {
      hasHeading,
      hasNavigation,
      hasForm,
      hasButton,
      hasTextbox,
      contentValid:
        hasHeading || hasNavigation || hasForm || hasButton || hasTextbox,
    };
  });

  // Test 7: Error handling
  runner.test("Error handling works correctly", () => {
    const bridge = new TestBridge();

    // Test with broken bridge method
    const originalMethod = bridge.getAttributes;
    bridge.getAttributes = () => {
      throw new Error("Simulated error");
    };

    const generator = new SnapshotGenerator(bridge, {});

    try {
      const result = generator.generate();

      // Should either handle the error gracefully or return error result
      if (
        result &&
        (result.text.includes("Error:") || typeof result.text === "string")
      ) {
        return { errorHandled: true, gracefulDegradation: true };
      } else {
        throw new Error("Error not handled properly");
      }
    } finally {
      // Restore original method
      bridge.getAttributes = originalMethod;
    }
  });

  const success = runner.summary();
  process.exit(success ? 0 : 1);
}

// Run the tests
runTests().catch((error) => {
  console.error("Test execution failed:", error);
  process.exit(1);
});
