#!/usr/bin/env node

/**
 * Integration test that demonstrates SnapshotGenerator working exactly as used by MCP server
 * This test simulates the complete flow from MCP server call to snapshot generation
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load the BridgeFactory and SnapshotGenerator as they would be injected
 */
function loadBridgeComponents() {
  try {
    // Read all the compiled components
    const snapshotCode = readFileSync(
      join(__dirname, "dist/injected/core/SnapshotGenerator.js"),
      "utf8"
    );
    const ariaUtilsCode = readFileSync(
      join(__dirname, "dist/injected/utils/AriaUtils.js"),
      "utf8"
    );
    const domAnalyzerCode = readFileSync(
      join(__dirname, "dist/injected/utils/DOMAnalyzer.js"),
      "utf8"
    );
    const bridgeFactoryCode = readFileSync(
      join(__dirname, "dist/injected/bridge/BridgeFactory.js"),
      "utf8"
    );

    // Remove ES6 imports/exports and combine all code
    const cleanCode = (code) =>
      code
        .replace(/export\s+class\s+/g, "class ")
        .replace(/export\s*{[^}]*}/g, "")
        .replace(/import\s+.*?from\s+['"][^'"]*['"];?\s*/g, "");

    const combinedCode = `
      ${cleanCode(ariaUtilsCode)}
      ${cleanCode(domAnalyzerCode)}
      ${cleanCode(snapshotCode)}
      ${cleanCode(bridgeFactoryCode)}
      
      // Return the factory for creating bridges
      return { BridgeFactory, SnapshotGenerator, AriaUtils, DOMAnalyzer };
    `;

    // Wrap in function and execute
    const wrappedCode = `(function() { ${combinedCode} })()`;
    return eval(wrappedCode);
  } catch (error) {
    console.error("Failed to load bridge components:", error.message);
    throw error;
  }
}

/**
 * Mock DOM environment that closely mimics a real browser page
 */
class RealisticMockDOM {
  constructor() {
    this.setupGlobals();
    this.createRealisticPage();
  }

  setupGlobals() {
    // Mock Node constants
    global.Node = {
      ELEMENT_NODE: 1,
      TEXT_NODE: 3,
    };

    // Mock Element class with realistic behavior
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
        // Simple implementation for common cases
        if (selector === "label" && this.tagName === "INPUT") {
          return this.parentElement?.tagName === "LABEL"
            ? this.parentElement
            : null;
        }
        return null;
      }

      getBoundingClientRect() {
        return { x: 0, y: 0, width: 100, height: 20 };
      }

      click() {
        console.log(
          `[MOCK] Clicked ${this.tagName}${this.id ? "#" + this.id : ""}`
        );
      }

      focus() {
        global.document.activeElement = this;
      }

      dispatchEvent(event) {
        console.log(`[MOCK] Dispatched ${event.type} on ${this.tagName}`);
      }
    };

    // Mock specific HTML elements with realistic properties
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

    // Mock document with realistic structure
    global.document = {
      body: new global.Element("BODY"),
      activeElement: null,
      getElementById: (id) => {
        // Simple traversal to find element by ID
        const findById = (element) => {
          if (element.id === id) return element;
          for (const child of element.children || []) {
            const found = findById(child);
            if (found) return found;
          }
          return null;
        };
        return findById(global.document.body);
      },
      querySelector: (selector) => null,
    };

    // Mock window with realistic computed styles
    global.window = {
      getComputedStyle: (element) => {
        // Return different styles based on element properties
        const isHidden =
          element.getAttribute("style")?.includes("display: none") ||
          element.getAttribute("style")?.includes("visibility: hidden");

        return {
          display: isHidden ? "none" : "block",
          visibility: isHidden ? "hidden" : "visible",
          pointerEvents:
            element.getAttribute("aria-disabled") === "true" ? "none" : "auto",
        };
      },
    };

    // Mock Event
    global.Event = class MockEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.bubbles = options.bubbles || false;
      }
    };
  }

  createRealisticPage() {
    const body = global.document.body;

    // Create a realistic login page structure
    this.createElement("HEADER", body, (header) => {
      this.createElement("H1", header, (h1) => {
        h1.textContent = "MyApp Login";
      });

      this.createElement("NAV", header, (nav) => {
        this.createElement("UL", nav, (ul) => {
          this.createElement("LI", ul, (li) => {
            this.createElement("A", li, (a) => {
              a.setAttribute("href", "/home");
              a.textContent = "Home";
            });
          });
          this.createElement("LI", ul, (li) => {
            this.createElement("A", li, (a) => {
              a.setAttribute("href", "/about");
              a.textContent = "About";
            });
          });
        });
      });
    });

    this.createElement("MAIN", body, (main) => {
      this.createElement("FORM", main, (form) => {
        form.setAttribute("id", "loginForm");

        this.createElement("H2", form, (h2) => {
          h2.textContent = "Please Login";
        });

        // Username field with label
        this.createElement("DIV", form, (div) => {
          this.createElement("LABEL", div, (label) => {
            label.setAttribute("for", "username");
            label.textContent = "Username:";
          });
          this.createElement("INPUT", div, (input) => {
            input.setAttribute("type", "text");
            input.setAttribute("id", "username");
            input.setAttribute("name", "username");
            input.setAttribute("placeholder", "Enter your username");
            input.setAttribute("required", "");
          });
        });

        // Password field with label
        this.createElement("DIV", form, (div) => {
          this.createElement("LABEL", div, (label) => {
            label.setAttribute("for", "password");
            label.textContent = "Password:";
          });
          this.createElement("INPUT", div, (input) => {
            input.setAttribute("type", "password");
            input.setAttribute("id", "password");
            input.setAttribute("name", "password");
            input.setAttribute("placeholder", "Enter your password");
            input.setAttribute("required", "");
          });
        });

        // Remember me checkbox
        this.createElement("DIV", form, (div) => {
          this.createElement("LABEL", div, (label) => {
            this.createElement("INPUT", label, (input) => {
              input.setAttribute("type", "checkbox");
              input.setAttribute("id", "remember");
              input.setAttribute("name", "remember");
            });
            this.addTextNode(label, " Remember me");
          });
        });

        // Submit button
        this.createElement("BUTTON", form, (button) => {
          button.setAttribute("type", "submit");
          button.textContent = "Login";
        });

        // Forgot password link
        this.createElement("A", form, (a) => {
          a.setAttribute("href", "/forgot-password");
          a.textContent = "Forgot your password?";
        });
      });

      // Error message (initially hidden)
      this.createElement("DIV", main, (div) => {
        div.setAttribute("role", "alert");
        div.setAttribute("id", "errorMessage");
        div.setAttribute("style", "display: none;");
        div.textContent = "Invalid username or password";
      });
    });

    this.createElement("FOOTER", body, (footer) => {
      this.createElement("P", footer, (p) => {
        p.textContent = "© 2024 MyApp. All rights reserved.";
      });
    });

    // Add some text nodes for realistic content
    this.addTextNode(body, "\n  ");
  }

  createElement(tagName, parent, setupFn) {
    const element = new global.Element(tagName);
    parent.children.push(element);
    parent.childNodes.push(element);
    element.parentElement = parent;

    if (setupFn) {
      setupFn(element);
    }

    return element;
  }

  addTextNode(parent, text) {
    const textNode = {
      nodeType: 3,
      nodeValue: text,
      textContent: text,
      parentElement: parent,
    };
    parent.childNodes.push(textNode);
    return textNode;
  }
}

/**
 * Test that simulates the exact MCP server workflow
 */
class MCPIntegrationTest {
  constructor() {
    this.testCount = 0;
    this.passCount = 0;
    this.failCount = 0;
  }

  async runMCPWorkflow() {
    console.log("🚀 MCP Server Integration Test");
    console.log("=".repeat(60));
    console.log("Simulating the exact workflow used by the MCP server...\n");

    // Step 1: Set up DOM environment (simulates browser page)
    console.log("📄 Step 1: Setting up realistic DOM environment...");
    const mockDOM = new RealisticMockDOM();
    console.log("✅ DOM environment created\n");

    // Step 2: Load bridge components (simulates code injection)
    console.log(
      "💉 Step 2: Loading bridge components (simulates injection)..."
    );
    const { BridgeFactory } = loadBridgeComponents();
    console.log("✅ Bridge components loaded\n");

    // Step 3: Create bridge with configuration (simulates MCP server call)
    console.log("🔧 Step 3: Creating bridge with configuration...");
    const config = {
      maxDepth: 10,
      maxElements: 100,
    };
    const bridge = BridgeFactory.create(config);
    console.log("✅ Bridge created with config:", config, "\n");

    // Step 4: Generate snapshot (simulates browser_snapshot MCP tool call)
    console.log("📸 Step 4: Generating accessibility snapshot...");
    const snapshot = bridge.snapshot();
    console.log("✅ Snapshot generated\n");

    // Step 5: Analyze results (simulates MCP server response processing)
    console.log("🔍 Step 5: Analyzing snapshot results...");
    this.analyzeSnapshot(snapshot, bridge);

    // Step 6: Test interactions (simulates browser_click/browser_type calls)
    console.log("🖱️  Step 6: Testing element interactions...");
    this.testInteractions(bridge);

    // Step 7: Test inspection (simulates browser_inspect calls)
    console.log("🔬 Step 7: Testing element inspection...");
    this.testInspection(bridge);

    this.summary();
  }

  analyzeSnapshot(snapshot, bridge) {
    this.test("Snapshot structure is valid", () => {
      if (
        !snapshot ||
        typeof snapshot.text !== "string" ||
        typeof snapshot.elementCount !== "number"
      ) {
        throw new Error("Invalid snapshot structure");
      }

      console.log(
        `  📊 Snapshot contains ${snapshot.elementCount} interactive elements`
      );
      console.log(
        `  📝 Snapshot text length: ${snapshot.text.length} characters`
      );
      return true;
    });

    this.test("Snapshot contains expected page elements", () => {
      const text = snapshot.text;
      const expectedElements = [
        'heading "MyApp Login"',
        "navigation",
        'link "Home"',
        "form",
        'textbox "Enter your username"',
        'textbox "Enter your password"',
        "checkbox",
        'button "Login"',
        'link "Forgot your password?"',
      ];

      const missing = expectedElements.filter(
        (element) => !text.includes(element)
      );
      if (missing.length > 0) {
        throw new Error(`Missing expected elements: ${missing.join(", ")}`);
      }

      console.log("  ✅ All expected page elements found in snapshot");
      return true;
    });

    this.test("Interactive elements are properly tracked", () => {
      if (bridge.elements.size !== snapshot.elementCount) {
        throw new Error(
          `Element count mismatch: bridge=${bridge.elements.size}, snapshot=${snapshot.elementCount}`
        );
      }

      console.log("  📋 Interactive elements stored in bridge:");
      for (const [ref, info] of bridge.elements) {
        console.log(
          `    ${ref}: ${info.role} "${info.name}" (${info.tagName})`
        );
      }

      return true;
    });

    this.test("Snapshot format matches MCP server expectations", () => {
      const lines = snapshot.text.split("\n");
      const hasIndentation = lines.some((line) => line.startsWith("  "));
      const hasReferences = /\[ref=e\d+\]/.test(snapshot.text);
      const hasRoles = lines.some((line) => line.includes("- "));

      if (!hasIndentation || !hasReferences || !hasRoles) {
        throw new Error(
          "Snapshot format does not match expected MCP server format"
        );
      }

      console.log("  ✅ Snapshot format is compatible with MCP server");
      return true;
    });

    // Display the actual snapshot for verification
    console.log("\n📄 Generated Accessibility Tree:");
    console.log("─".repeat(50));
    console.log(snapshot.text);
    console.log("─".repeat(50));
  }

  testInteractions(bridge) {
    this.test("Click interaction works", () => {
      // Find a button to click
      let buttonRef = null;
      for (const [ref, info] of bridge.elements) {
        if (info.role === "button" && info.name === "Login") {
          buttonRef = ref;
          break;
        }
      }

      if (!buttonRef) {
        throw new Error("No login button found to test clicking");
      }

      // Test clicking (this would trigger actual click in real browser)
      bridge.click(buttonRef);
      console.log(`  ✅ Successfully clicked button ${buttonRef}`);
      return true;
    });

    this.test("Type interaction works", () => {
      // Find username textbox
      let usernameRef = null;
      for (const [ref, info] of bridge.elements) {
        if (info.role === "textbox" && info.name.includes("username")) {
          usernameRef = ref;
          break;
        }
      }

      if (!usernameRef) {
        throw new Error("No username textbox found to test typing");
      }

      // Test typing (this would set actual value in real browser)
      bridge.type(usernameRef, "testuser");
      console.log(`  ✅ Successfully typed into textbox ${usernameRef}`);
      return true;
    });
  }

  testInspection(bridge) {
    this.test("Element inspection provides detailed information", () => {
      // Get first element for inspection
      const firstRef = Array.from(bridge.elements.keys())[0];
      if (!firstRef) {
        throw new Error("No elements available for inspection");
      }

      const inspection = bridge.inspect(firstRef);

      const requiredFields = [
        "ref",
        "tagName",
        "role",
        "name",
        "attributes",
        "text",
        "visible",
        "bounds",
      ];
      const missing = requiredFields.filter((field) => !(field in inspection));

      if (missing.length > 0) {
        throw new Error(
          `Inspection missing required fields: ${missing.join(", ")}`
        );
      }

      console.log(`  🔍 Inspected element ${firstRef}:`);
      console.log(`    Role: ${inspection.role}`);
      console.log(`    Name: "${inspection.name}"`);
      console.log(`    Tag: ${inspection.tagName}`);
      console.log(`    Visible: ${inspection.visible}`);
      console.log(`    Bounds: ${JSON.stringify(inspection.bounds)}`);

      return true;
    });
  }

  test(name, testFn) {
    this.testCount++;
    try {
      testFn();
      this.passCount++;
      console.log(`  ✅ ${name}`);
    } catch (error) {
      this.failCount++;
      console.log(`  ❌ ${name}: ${error.message}`);
    }
  }

  summary() {
    console.log("\n" + "=".repeat(60));
    console.log("📊 MCP INTEGRATION TEST SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total tests: ${this.testCount}`);
    console.log(`✅ Passed: ${this.passCount}`);
    console.log(`❌ Failed: ${this.failCount}`);

    if (this.failCount === 0) {
      console.log("\n🎉 All MCP integration tests passed!");
      console.log(
        "✅ SnapshotGenerator is working exactly as expected by the MCP server"
      );
      return true;
    } else {
      console.log(`\n💥 ${this.failCount} test(s) failed`);
      return false;
    }
  }
}

// Run the integration test
const integrationTest = new MCPIntegrationTest();
integrationTest
  .runMCPWorkflow()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("Integration test failed:", error);
    process.exit(1);
  });
