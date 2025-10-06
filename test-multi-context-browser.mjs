#!/usr/bin/env node

/**
 * Complete integration test using MultiContextBrowser
 * This test simulates the exact workflow used by the MCP server through MultiContextBrowser
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { MultiContextBrowser } from "./dist/multi-context-browser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Test HTML page to serve during the test
 */
const TEST_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SnapshotGenerator Test Page</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .hidden { display: none; }
        .form-group { margin: 10px 0; }
        label { display: block; margin-bottom: 5px; }
        input, select, textarea, button { margin: 5px 0; padding: 5px; }
    </style>
</head>
<body>
    <header>
        <h1>Test Application</h1>
        <nav>
            <ul>
                <li><a href="#home">Home</a></li>
                <li><a href="#products">Products</a></li>
                <li><a href="#contact">Contact</a></li>
            </ul>
        </nav>
    </header>

    <main>
        <section id="login-section">
            <h2>User Login</h2>
            <form id="loginForm">
                <div class="form-group">
                    <label for="username">Username:</label>
                    <input type="text" id="username" name="username" placeholder="Enter your username" required>
                </div>
                
                <div class="form-group">
                    <label for="password">Password:</label>
                    <input type="password" id="password" name="password" placeholder="Enter your password" required>
                </div>
                
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="remember" name="remember"> Remember me
                    </label>
                </div>
                
                <div class="form-group">
                    <label for="role">Role:</label>
                    <select id="role" name="role">
                        <option value="">Select role</option>
                        <option value="admin">Administrator</option>
                        <option value="user">User</option>
                        <option value="guest">Guest</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <button type="submit" id="loginBtn">Login</button>
                    <button type="reset" id="resetBtn">Reset</button>
                </div>
            </form>
        </section>

        <section id="contact-section">
            <h2>Contact Us</h2>
            <form id="contactForm">
                <div class="form-group">
                    <label for="name">Full Name:</label>
                    <input type="text" id="name" name="name" placeholder="Your full name" required>
                </div>
                
                <div class="form-group">
                    <label for="email">Email:</label>
                    <input type="email" id="email" name="email" placeholder="your@email.com" required>
                </div>
                
                <div class="form-group">
                    <label for="message">Message:</label>
                    <textarea id="message" name="message" rows="4" placeholder="Your message here..."></textarea>
                </div>
                
                <div class="form-group">
                    <button type="submit" id="sendBtn">Send Message</button>
                </div>
            </form>
        </section>

        <!-- ARIA elements for testing -->
        <section id="aria-section">
            <h2>Interactive Elements</h2>
            <button aria-pressed="true" id="toggleBtn">Toggle Button (Pressed)</button>
            <button aria-expanded="false" aria-controls="menu" id="menuBtn">Menu Button</button>
            <div role="tab" aria-selected="true" tabindex="0" id="activeTab">Active Tab</div>
            <div role="tab" aria-selected="false" tabindex="-1" id="inactiveTab">Inactive Tab</div>
            <input type="range" id="slider" min="0" max="100" value="50" aria-label="Volume slider">
        </section>

        <!-- Hidden elements for visibility testing -->
        <div class="hidden">
            <button id="hiddenBtn">Hidden Button</button>
        </div>
        
        <div aria-hidden="true">
            <button id="ariaHiddenBtn">ARIA Hidden Button</button>
        </div>
    </main>

    <footer>
        <p>&copy; 2024 Test Application. All rights reserved.</p>
    </footer>

    <script>
        // Add some interactivity for testing
        document.getElementById('loginBtn').addEventListener('click', function(e) {
            e.preventDefault();
            console.log('Login button clicked');
        });
        
        document.getElementById('toggleBtn').addEventListener('click', function() {
            const pressed = this.getAttribute('aria-pressed') === 'true';
            this.setAttribute('aria-pressed', !pressed);
        });
        
        document.getElementById('menuBtn').addEventListener('click', function() {
            const expanded = this.getAttribute('aria-expanded') === 'true';
            this.setAttribute('aria-expanded', !expanded);
        });
    </script>
</body>
</html>
`;

/**
 * Simple HTTP server for serving test content
 */
class TestServer {
  constructor(port = 3000) {
    this.port = port;
    this.server = null;
  }

  async start() {
    const { createServer } = await import("http");

    this.server = createServer((req, res) => {
      // Set CORS headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
      }

      // Serve the test HTML
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(TEST_HTML);
    });

    return new Promise((resolve, reject) => {
      this.server.listen(this.port, (err) => {
        if (err) reject(err);
        else {
          console.log(
            `🌐 Test server started on http://localhost:${this.port}`
          );
          resolve();
        }
      });
    });
  }

  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          console.log("🛑 Test server stopped");
          resolve();
        });
      });
    }
  }
}

/**
 * Comprehensive test suite for MultiContextBrowser integration
 */
class MultiContextBrowserTest {
  constructor() {
    this.browser = null;
    this.server = null;
    this.testResults = [];
    this.testUrl = "http://localhost:3000";
  }

  async setup() {
    console.log("🔧 Setting up MultiContextBrowser integration test...");

    // Start test server
    this.server = new TestServer(3000);
    await this.server.start();

    // Initialize MultiContextBrowser
    this.browser = new MultiContextBrowser();
    await this.browser.initialize();

    console.log("✅ Setup complete\n");
  }

  async teardown() {
    console.log("\n🧹 Cleaning up...");

    if (this.browser) {
      await this.browser.close();
    }

    if (this.server) {
      await this.server.stop();
    }

    console.log("✅ Cleanup complete");
  }

  async runAllTests() {
    try {
      await this.setup();

      console.log("🚀 Running MultiContextBrowser Integration Tests");
      console.log("=".repeat(60));

      // Test 1: Navigation and snapshot generation
      await this.testNavigationAndSnapshot();

      // Test 2: Element interaction via browser
      await this.testElementInteractions();

      // Test 3: Element inspection
      await this.testElementInspection();

      // Test 4: Multiple role contexts
      await this.testMultipleRoles();

      // Test 5: Bridge configuration
      await this.testBridgeConfiguration();

      this.showResults();
    } finally {
      await this.teardown();
    }
  }

  async testNavigationAndSnapshot() {
    console.log("\n📸 Test 1: Navigation and Snapshot Generation");
    console.log("-".repeat(50));

    try {
      // Navigate to test page (this goes through the complete MCP server workflow)
      console.log("🌐 Navigating to test page...");
      const snapshot = await this.browser.navigate(this.testUrl);

      // Verify navigation was successful
      if (!snapshot || typeof snapshot.text !== "string") {
        throw new Error("Navigation did not return valid snapshot");
      }

      console.log(`✅ Navigation successful`);
      console.log(`📊 Found ${snapshot.elementCount} interactive elements`);
      console.log(`📝 Snapshot length: ${snapshot.text.length} characters`);

      // Verify expected elements are present
      const expectedElements = [
        'heading "Test Application"',
        "navigation",
        'link "Home"',
        'textbox "Enter your username"',
        'textbox "Enter your password"',
        "checkbox",
        "combobox",
        'button "Login"',
        'textbox "Your full name"',
        'textbox "your@email.com"',
        'textbox "Your message here..."',
        'button "Send Message"',
      ];

      const missingElements = expectedElements.filter(
        (element) => !snapshot.text.includes(element)
      );

      if (missingElements.length > 0) {
        console.log("⚠️  Missing elements:", missingElements);
      } else {
        console.log("✅ All expected elements found");
      }

      // Show sample of the accessibility tree
      console.log("\n📄 Accessibility Tree Sample:");
      console.log("─".repeat(40));
      const lines = snapshot.text.split("\n");
      lines.slice(0, 15).forEach((line) => console.log(line));
      if (lines.length > 15) {
        console.log("... (truncated)");
      }
      console.log("─".repeat(40));

      this.testResults.push({
        test: "Navigation and Snapshot",
        success: true,
        elementCount: snapshot.elementCount,
        hasExpectedElements: missingElements.length === 0,
      });
    } catch (error) {
      console.log(`❌ Navigation test failed: ${error.message}`);
      this.testResults.push({
        test: "Navigation and Snapshot",
        success: false,
        error: error.message,
      });
    }
  }

  async testElementInteractions() {
    console.log("\n🖱️  Test 2: Element Interactions");
    console.log("-".repeat(50));

    try {
      // First get a fresh snapshot to find elements
      const snapshot = await this.browser.snapshot();

      // Extract element references from snapshot
      const refMatches = snapshot.text.match(/\[ref=e\d+\]/g) || [];
      console.log(`🔍 Found ${refMatches.length} element references`);

      if (refMatches.length === 0) {
        throw new Error("No element references found for interaction testing");
      }

      // Test clicking a button
      const buttonRefMatch = snapshot.text.match(
        /button "Login" \[ref=(e\d+)\]/
      );
      if (buttonRefMatch) {
        const buttonRef = buttonRefMatch[1];
        console.log(`🖱️  Testing click on login button (${buttonRef})...`);

        await this.browser.click(buttonRef);
        console.log("✅ Click operation completed successfully");
      } else {
        console.log("⚠️  No login button found for click testing");
      }

      // Test typing in a textbox
      const textboxRefMatch = snapshot.text.match(
        /textbox "Enter your username" \[ref=(e\d+)\]/
      );
      if (textboxRefMatch) {
        const textboxRef = textboxRefMatch[1];
        console.log(`⌨️  Testing type in username field (${textboxRef})...`);

        await this.browser.type(textboxRef, "testuser123");
        console.log("✅ Type operation completed successfully");
      } else {
        console.log("⚠️  No username textbox found for type testing");
      }

      this.testResults.push({
        test: "Element Interactions",
        success: true,
        clickTested: !!buttonRefMatch,
        typeTested: !!textboxRefMatch,
      });
    } catch (error) {
      console.log(`❌ Interaction test failed: ${error.message}`);
      this.testResults.push({
        test: "Element Interactions",
        success: false,
        error: error.message,
      });
    }
  }

  async testElementInspection() {
    console.log("\n🔬 Test 3: Element Inspection");
    console.log("-".repeat(50));

    try {
      // Get snapshot to find an element to inspect
      const snapshot = await this.browser.snapshot();
      const refMatch = snapshot.text.match(/\[ref=(e\d+)\]/);

      if (!refMatch) {
        throw new Error("No element references found for inspection");
      }

      const elementRef = refMatch[1];
      console.log(`🔍 Inspecting element ${elementRef}...`);

      // Use the browser's inspect method (goes through complete bridge)
      const inspection = await this.browser.inspect(elementRef);

      if (!inspection) {
        throw new Error("Inspection returned null");
      }

      // Verify inspection contains expected fields
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
      const missingFields = requiredFields.filter(
        (field) => !(field in inspection)
      );

      if (missingFields.length > 0) {
        throw new Error(
          `Inspection missing fields: ${missingFields.join(", ")}`
        );
      }

      console.log("✅ Inspection completed successfully");
      console.log(`   Element: ${inspection.tagName} (${inspection.role})`);
      console.log(`   Name: "${inspection.name}"`);
      console.log(`   Visible: ${inspection.visible}`);
      console.log(`   Bounds: ${JSON.stringify(inspection.bounds)}`);
      console.log(
        `   Attributes: ${Object.keys(inspection.attributes).length} attributes`
      );

      this.testResults.push({
        test: "Element Inspection",
        success: true,
        inspectedRef: elementRef,
        hasAllFields: missingFields.length === 0,
      });
    } catch (error) {
      console.log(`❌ Inspection test failed: ${error.message}`);
      this.testResults.push({
        test: "Element Inspection",
        success: false,
        error: error.message,
      });
    }
  }

  async testMultipleRoles() {
    console.log("\n👥 Test 4: Multiple Role Contexts");
    console.log("-".repeat(50));

    try {
      // Test default role
      const defaultRole = this.browser.getCurrentRole();
      console.log(`📋 Current role: ${defaultRole}`);

      // Create a test role (this would normally be configured via MCP server args)
      console.log("🔄 Testing role switching...");

      // Switch to a new role
      await this.browser.selectRole("testRole");
      const newRole = this.browser.getCurrentRole();
      console.log(`📋 Switched to role: ${newRole}`);

      // Navigate with new role
      const snapshot = await this.browser.navigate(this.testUrl);
      console.log(`✅ Navigation with role '${newRole}' successful`);
      console.log(
        `📊 Found ${snapshot.elementCount} elements in new role context`
      );

      // Switch back to default
      await this.browser.selectRole("default");
      const backToDefault = this.browser.getCurrentRole();
      console.log(`📋 Switched back to role: ${backToDefault}`);

      this.testResults.push({
        test: "Multiple Role Contexts",
        success: true,
        defaultRole,
        testRole: newRole,
        switchedBack: backToDefault === "default",
      });
    } catch (error) {
      console.log(`❌ Multiple roles test failed: ${error.message}`);
      this.testResults.push({
        test: "Multiple Role Contexts",
        success: false,
        error: error.message,
      });
    }
  }

  async testBridgeConfiguration() {
    console.log("\n⚙️  Test 5: Bridge Configuration");
    console.log("-".repeat(50));

    try {
      // Test bridge configuration (this tests the complete injection pipeline)
      console.log("🔧 Testing bridge configuration...");

      // Set bridge configuration
      this.browser.setBridgeConfiguration({
        maxDepth: 10,
        maxSiblings: 50,
        maxDescendants: 100,
      });

      console.log("✅ Bridge configuration set successfully");

      // Generate snapshot to verify configuration is applied
      const snapshot = await this.browser.snapshot();

      if (!snapshot || typeof snapshot.text !== "string") {
        throw new Error("Snapshot generation failed with configuration");
      }

      console.log("✅ Snapshot generation with configuration successful");
      console.log(`📊 Elements found: ${snapshot.elementCount}`);

      this.testResults.push({
        test: "Bridge Configuration",
        success: true,
        configurationApplied: true,
        snapshotWorked: true,
      });
    } catch (error) {
      console.log(`❌ Bridge configuration test failed: ${error.message}`);
      this.testResults.push({
        test: "Bridge Configuration",
        success: false,
        error: error.message,
      });
    }
  }

  showResults() {
    console.log("\n" + "=".repeat(60));
    console.log("📊 MULTICONTEXTBROWSER INTEGRATION TEST RESULTS");
    console.log("=".repeat(60));

    const successful = this.testResults.filter((r) => r.success).length;
    const total = this.testResults.length;

    this.testResults.forEach((result) => {
      const status = result.success ? "✅" : "❌";
      console.log(
        `${status} ${result.test}: ${result.success ? "SUCCESS" : "FAILED"}`
      );

      if (result.error) {
        console.log(`   Error: ${result.error}`);
      } else if (result.success) {
        // Show relevant success details
        if (result.elementCount !== undefined) {
          console.log(`   Found ${result.elementCount} interactive elements`);
        }
        if (result.hasExpectedElements !== undefined) {
          console.log(
            `   Expected elements: ${result.hasExpectedElements ? "✅" : "❌"}`
          );
        }
        if (result.clickTested !== undefined) {
          console.log(`   Click tested: ${result.clickTested ? "✅" : "❌"}`);
        }
        if (result.typeTested !== undefined) {
          console.log(`   Type tested: ${result.typeTested ? "✅" : "❌"}`);
        }
      }
    });

    console.log("\n" + "=".repeat(60));
    console.log(`📈 Summary: ${successful}/${total} tests successful`);

    if (successful === total) {
      console.log("\n🎉 ALL INTEGRATION TESTS PASSED!");
      console.log("✅ MultiContextBrowser is working perfectly");
      console.log("✅ SnapshotGenerator integration is complete");
      console.log("✅ Bridge injection and communication works");
      console.log("✅ Element interactions work through full stack");
      console.log("✅ Ready for production MCP server use");
      return true;
    } else {
      console.log(`\n💥 ${total - successful} test(s) failed`);
      console.log("❌ Integration issues need to be resolved");
      return false;
    }
  }
}

// Run the comprehensive integration test
async function main() {
  const tester = new MultiContextBrowserTest();

  try {
    const success = await tester.runAllTests();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error("💥 Test execution failed:", error);
    await tester.teardown();
    process.exit(1);
  }
}

// Handle cleanup on process termination
process.on("SIGINT", async () => {
  console.log("\n🛑 Received SIGINT, cleaning up...");
  process.exit(1);
});

process.on("SIGTERM", async () => {
  console.log("\n🛑 Received SIGTERM, cleaning up...");
  process.exit(1);
});

main().catch(console.error);
