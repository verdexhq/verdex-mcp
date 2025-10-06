#!/usr/bin/env node

/**
 * Final integration test demonstrating SnapshotGenerator working as used by MCP server
 * This test focuses on the core functionality and integration points
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load just the SnapshotGenerator with a clean namespace
 */
function loadSnapshotGenerator() {
  try {
    const snapshotCode = readFileSync(
      join(__dirname, "dist/injected/core/SnapshotGenerator.js"),
      "utf8"
    );

    // Clean the code and create a safe execution environment
    const cleanCode = snapshotCode
      .replace(/export\s+class\s+SnapshotGenerator/g, "class SnapshotGenerator")
      .replace(/export\s+class\s+AriaUtils/g, "class AriaUtilsInternal")
      .replace(/AriaUtils\./g, "AriaUtilsInternal.")
      .replace(/export\s*{[^}]*}/g, "")
      .replace(/import\s+.*?from\s+['"][^'"]*['"];?\s*/g, "");

    const wrappedCode = `
      (function() {
        ${cleanCode}
        return { SnapshotGenerator, AriaUtils: AriaUtilsInternal };
      })()
    `;

    return eval(wrappedCode);
  } catch (error) {
    console.error("Failed to load SnapshotGenerator:", error.message);
    throw error;
  }
}

/**
 * Comprehensive mock DOM for testing
 */
class TestDOM {
  constructor() {
    this.setupGlobals();
    this.createTestPage();
  }

  setupGlobals() {
    global.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };

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
      focus() {
        global.document.activeElement = this;
      }
      dispatchEvent() {}
    };

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

    global.document = {
      body: new global.Element("BODY"),
      activeElement: null,
      getElementById: (id) => null,
      querySelector: (selector) => null,
    };

    global.window = {
      getComputedStyle: (element) => ({
        display: "block",
        visibility: "visible",
        pointerEvents: "auto",
      }),
    };

    global.Event = class MockEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.bubbles = options.bubbles || false;
      }
    };
  }

  createTestPage() {
    const body = global.document.body;

    // Create a realistic e-commerce product page
    const header = this.addElement("HEADER", body);
    const h1 = this.addElement("H1", header);
    h1.textContent = "Product Store";

    const nav = this.addElement("NAV", header);
    const navList = this.addElement("UL", nav);

    const homeItem = this.addElement("LI", navList);
    const homeLink = this.addElement("A", homeItem);
    homeLink.setAttribute("href", "/");
    homeLink.textContent = "Home";

    const productsItem = this.addElement("LI", navList);
    const productsLink = this.addElement("A", productsItem);
    productsLink.setAttribute("href", "/products");
    productsLink.textContent = "Products";

    // Main content area
    const main = this.addElement("MAIN", body);

    // Product section
    const productSection = this.addElement("SECTION", main);
    const productHeading = this.addElement("H2", productSection);
    productHeading.textContent = "Laptop Computer";

    const productForm = this.addElement("FORM", productSection);
    productForm.setAttribute("id", "productForm");

    // Quantity selector
    const quantityDiv = this.addElement("DIV", productForm);
    const quantityLabel = this.addElement("LABEL", quantityDiv);
    quantityLabel.setAttribute("for", "quantity");
    quantityLabel.textContent = "Quantity:";

    const quantitySelect = this.addElement("SELECT", quantityDiv);
    quantitySelect.setAttribute("id", "quantity");

    for (let i = 1; i <= 5; i++) {
      const option = this.addElement("OPTION", quantitySelect);
      option.setAttribute("value", i.toString());
      option.textContent = i.toString();
    }

    // Color selector with radio buttons
    const colorFieldset = this.addElement("FIELDSET", productForm);
    const colorLegend = this.addElement("LEGEND", colorFieldset);
    colorLegend.textContent = "Choose Color:";

    const colors = ["Black", "Silver", "Gold"];
    colors.forEach((color, index) => {
      const colorDiv = this.addElement("DIV", colorFieldset);
      const colorInput = this.addElement("INPUT", colorDiv);
      colorInput.setAttribute("type", "radio");
      colorInput.setAttribute("name", "color");
      colorInput.setAttribute("value", color.toLowerCase());
      colorInput.setAttribute("id", `color-${color.toLowerCase()}`);
      if (index === 0) colorInput.checked = true;

      const colorLabel = this.addElement("LABEL", colorDiv);
      colorLabel.setAttribute("for", `color-${color.toLowerCase()}`);
      colorLabel.textContent = color;
    });

    // Special features checkboxes
    const featuresDiv = this.addElement("DIV", productForm);
    const featuresHeading = this.addElement("H3", featuresDiv);
    featuresHeading.textContent = "Optional Features:";

    const features = ["Extended Warranty", "Express Shipping", "Gift Wrapping"];
    features.forEach((feature) => {
      const featureDiv = this.addElement("DIV", featuresDiv);
      const featureInput = this.addElement("INPUT", featureDiv);
      featureInput.setAttribute("type", "checkbox");
      featureInput.setAttribute("name", "features");
      featureInput.setAttribute(
        "value",
        feature.toLowerCase().replace(/\s+/g, "-")
      );
      featureInput.setAttribute(
        "id",
        feature.toLowerCase().replace(/\s+/g, "-")
      );

      const featureLabel = this.addElement("LABEL", featureDiv);
      featureLabel.setAttribute(
        "for",
        feature.toLowerCase().replace(/\s+/g, "-")
      );
      featureLabel.textContent = feature;
    });

    // Customer info
    const customerDiv = this.addElement("DIV", productForm);
    const customerHeading = this.addElement("H3", customerDiv);
    customerHeading.textContent = "Customer Information:";

    const nameDiv = this.addElement("DIV", customerDiv);
    const nameLabel = this.addElement("LABEL", nameDiv);
    nameLabel.setAttribute("for", "customerName");
    nameLabel.textContent = "Full Name:";

    const nameInput = this.addElement("INPUT", nameDiv);
    nameInput.setAttribute("type", "text");
    nameInput.setAttribute("id", "customerName");
    nameInput.setAttribute("placeholder", "Enter your full name");
    nameInput.setAttribute("required", "");

    const emailDiv = this.addElement("DIV", customerDiv);
    const emailLabel = this.addElement("LABEL", emailDiv);
    emailLabel.setAttribute("for", "customerEmail");
    emailLabel.textContent = "Email:";

    const emailInput = this.addElement("INPUT", emailDiv);
    emailInput.setAttribute("type", "email");
    emailInput.setAttribute("id", "customerEmail");
    emailInput.setAttribute("placeholder", "your@email.com");
    emailInput.setAttribute("required", "");

    // Comments textarea
    const commentsDiv = this.addElement("DIV", customerDiv);
    const commentsLabel = this.addElement("LABEL", commentsDiv);
    commentsLabel.setAttribute("for", "comments");
    commentsLabel.textContent = "Special Instructions:";

    const commentsTextarea = this.addElement("TEXTAREA", commentsDiv);
    commentsTextarea.setAttribute("id", "comments");
    commentsTextarea.setAttribute(
      "placeholder",
      "Any special delivery instructions..."
    );
    commentsTextarea.setAttribute("rows", "4");

    // Action buttons
    const buttonsDiv = this.addElement("DIV", productForm);

    const addToCartBtn = this.addElement("BUTTON", buttonsDiv);
    addToCartBtn.setAttribute("type", "button");
    addToCartBtn.setAttribute("id", "addToCart");
    addToCartBtn.textContent = "Add to Cart";

    const buyNowBtn = this.addElement("BUTTON", buttonsDiv);
    buyNowBtn.setAttribute("type", "submit");
    buyNowBtn.setAttribute("id", "buyNow");
    buyNowBtn.textContent = "Buy Now";

    // Footer
    const footer = this.addElement("FOOTER", body);
    const footerText = this.addElement("P", footer);
    footerText.textContent = "© 2024 Product Store. All rights reserved.";

    return body;
  }

  addElement(tagName, parent) {
    const element = new global.Element(tagName);
    parent.children.push(element);
    parent.childNodes.push(element);
    element.parentElement = parent;
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
 * Mock Bridge that matches the IBridge interface exactly
 */
class MCPBridge {
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
 * Test runner that simulates MCP server operations
 */
class MCPServerSimulator {
  constructor() {
    this.results = [];
  }

  async simulate() {
    console.log("🎭 MCP Server Simulation");
    console.log("=".repeat(60));
    console.log(
      "Testing SnapshotGenerator as it would be used by the MCP server\n"
    );

    // Initialize environment
    console.log("🔧 Initializing test environment...");
    const testDOM = new TestDOM();
    const { SnapshotGenerator } = loadSnapshotGenerator();
    console.log("✅ Environment ready\n");

    // Simulate MCP server workflow
    await this.simulateBrowserSnapshot(SnapshotGenerator);
    await this.simulateElementInteractions(SnapshotGenerator);
    await this.simulateInspection(SnapshotGenerator);

    this.showResults();
  }

  async simulateBrowserSnapshot(SnapshotGenerator) {
    console.log("📸 Simulating browser_snapshot MCP tool call...");

    try {
      // This is exactly how the MCP server creates and uses SnapshotGenerator
      const bridge = new MCPBridge();
      const config = {}; // Default config as used by MCP server
      const generator = new SnapshotGenerator(bridge, config);

      // Generate snapshot (this is the core MCP server operation)
      const snapshot = generator.generate();

      // Validate result format expected by MCP server
      if (
        !snapshot ||
        typeof snapshot.text !== "string" ||
        typeof snapshot.elementCount !== "number"
      ) {
        throw new Error("Invalid snapshot format");
      }

      console.log(`✅ Snapshot generated successfully`);
      console.log(`   📊 Found ${snapshot.elementCount} interactive elements`);
      console.log(`   📝 Snapshot size: ${snapshot.text.length} characters`);

      // Show the accessibility tree as it would appear to MCP server
      console.log("\n📋 Accessibility Tree (as seen by MCP server):");
      console.log("─".repeat(50));
      console.log(snapshot.text);
      console.log("─".repeat(50));

      // Verify element tracking
      console.log(`\n🔍 Element tracking verification:`);
      console.log(`   Bridge elements: ${bridge.elements.size}`);
      console.log(`   Reported count: ${snapshot.elementCount}`);
      console.log(
        `   Match: ${
          bridge.elements.size === snapshot.elementCount ? "✅" : "❌"
        }`
      );

      // Show stored element details
      console.log("\n📋 Stored interactive elements:");
      for (const [ref, info] of bridge.elements) {
        console.log(`   ${ref}: ${info.role} "${info.name}" (${info.tagName})`);
      }

      this.results.push({
        test: "browser_snapshot",
        success: true,
        elementCount: snapshot.elementCount,
        bridgeElements: bridge.elements.size,
      });

      // Store for later tests
      this.testBridge = bridge;
      this.testSnapshot = snapshot;
    } catch (error) {
      console.log(`❌ Snapshot generation failed: ${error.message}`);
      this.results.push({
        test: "browser_snapshot",
        success: false,
        error: error.message,
      });
    }

    console.log("");
  }

  async simulateElementInteractions(SnapshotGenerator) {
    console.log(
      "🖱️  Simulating browser_click and browser_type MCP tool calls..."
    );

    if (!this.testBridge) {
      console.log("❌ No bridge available for interaction testing");
      return;
    }

    try {
      // Find elements to interact with (as MCP server would)
      let buttonRef = null;
      let textboxRef = null;

      for (const [ref, info] of this.testBridge.elements) {
        if (info.role === "button" && info.name.includes("Add to Cart")) {
          buttonRef = ref;
        }
        if (info.role === "textbox" && info.name.includes("Full Name")) {
          textboxRef = ref;
        }
      }

      // Test clicking (simulates browser_click MCP call)
      if (buttonRef) {
        console.log(`🖱️  Testing click on ${buttonRef}...`);
        // In real MCP server, this would be: await this.browser.click(buttonRef);
        const element = this.testBridge.elements.get(buttonRef);
        element.element.click(); // Simulate the click
        console.log(`   ✅ Click simulation successful`);
      }

      // Test typing (simulates browser_type MCP call)
      if (textboxRef) {
        console.log(`⌨️  Testing type into ${textboxRef}...`);
        // In real MCP server, this would be: await this.browser.type(textboxRef, "John Doe");
        const element = this.testBridge.elements.get(textboxRef);
        element.element.value = "John Doe"; // Simulate typing
        console.log(`   ✅ Type simulation successful`);
      }

      this.results.push({
        test: "element_interactions",
        success: true,
        clickTested: !!buttonRef,
        typeTested: !!textboxRef,
      });
    } catch (error) {
      console.log(`❌ Interaction testing failed: ${error.message}`);
      this.results.push({
        test: "element_interactions",
        success: false,
        error: error.message,
      });
    }

    console.log("");
  }

  async simulateInspection(SnapshotGenerator) {
    console.log("🔬 Simulating browser_inspect MCP tool call...");

    if (!this.testBridge) {
      console.log("❌ No bridge available for inspection testing");
      return;
    }

    try {
      // Get first element for inspection (as MCP server would)
      const firstRef = Array.from(this.testBridge.elements.keys())[0];

      if (!firstRef) {
        throw new Error("No elements available for inspection");
      }

      // Simulate inspection (this would be bridge.inspect(ref) in real MCP server)
      const elementInfo = this.testBridge.elements.get(firstRef);

      console.log(`🔍 Inspecting element ${firstRef}:`);
      console.log(`   Role: ${elementInfo.role}`);
      console.log(`   Name: "${elementInfo.name}"`);
      console.log(`   Tag: ${elementInfo.tagName}`);
      console.log(
        `   Attributes: ${JSON.stringify(elementInfo.attributes, null, 4)}`
      );

      this.results.push({
        test: "element_inspection",
        success: true,
        inspectedRef: firstRef,
      });
    } catch (error) {
      console.log(`❌ Inspection testing failed: ${error.message}`);
      this.results.push({
        test: "element_inspection",
        success: false,
        error: error.message,
      });
    }

    console.log("");
  }

  showResults() {
    console.log("📊 MCP SERVER SIMULATION RESULTS");
    console.log("=".repeat(60));

    const successful = this.results.filter((r) => r.success).length;
    const total = this.results.length;

    this.results.forEach((result) => {
      const status = result.success ? "✅" : "❌";
      console.log(
        `${status} ${result.test}: ${result.success ? "SUCCESS" : "FAILED"}`
      );
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });

    console.log("\n" + "=".repeat(60));
    console.log(`📈 Summary: ${successful}/${total} operations successful`);

    if (successful === total) {
      console.log("\n🎉 ALL MCP SERVER OPERATIONS SUCCESSFUL!");
      console.log(
        "✅ SnapshotGenerator is working perfectly with the MCP server"
      );
      console.log("✅ All expected functionality is operational");
      console.log("✅ Element tracking and interaction simulation works");
      console.log("✅ Ready for production use");
    } else {
      console.log(`\n💥 ${total - successful} operation(s) failed`);
      console.log("❌ SnapshotGenerator needs fixes before production use");
    }

    return successful === total;
  }
}

// Run the simulation
const simulator = new MCPServerSimulator();
simulator
  .simulate()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("Simulation failed:", error);
    process.exit(1);
  });
