#!/usr/bin/env node

/**
 * Debug script to test the EXACT same flow as the MCP server
 */

import { BrowserBridge } from "./dist/multi-role-bridge.js";

class DebugMCPServer {
  constructor() {
    console.log("🔧 Creating BrowserBridge (like MCP server constructor)...");
    this.bridge = new BrowserBridge();
    console.log("✅ BrowserBridge created");
  }

  async testBrowserInitialize() {
    console.log("\n📞 Simulating browser_initialize tool call...");

    console.log("📋 Environment check:");
    console.log(
      `   PLAYWRIGHT_CONFIG: ${process.env.PLAYWRIGHT_CONFIG || "NOT SET"}`
    );

    console.log("\n🔧 Before initialize():");
    console.log(
      `   Playwright roles: [${this.bridge.getPlaywrightRoles().join(", ")}]`
    );

    console.log("\n📞 Calling this.bridge.initialize()...");
    await this.bridge.initialize();
    console.log("✅ initialize() completed");

    console.log("\n🔧 After initialize():");
    console.log(
      `   Playwright roles: [${this.bridge.getPlaywrightRoles().join(", ")}]`
    );

    return "Multi-role browser initialized successfully";
  }

  async testListCurrentRoles() {
    console.log("\n📞 Simulating list_current_roles tool call...");

    const createdRoles = this.bridge.listRoles();
    const playwrightRoles = this.bridge.getPlaywrightRoles();
    const currentRole = this.bridge.getCurrentRole();

    console.log(`   Created roles: [${createdRoles.join(", ")}]`);
    console.log(`   Playwright roles: [${playwrightRoles.join(", ")}]`);
    console.log(`   Current role: ${currentRole}`);

    // Combine all available roles (Playwright + manual)
    const allRoles = new Set([...playwrightRoles, ...createdRoles]);

    if (allRoles.size === 0) {
      return "Available roles: none";
    }

    let output = "Available roles:\n";

    // Show Playwright roles first (always show them, even if not created yet)
    const sortedPlaywrightRoles = [...playwrightRoles].sort();
    if (sortedPlaywrightRoles.length > 0) {
      for (const role of sortedPlaywrightRoles) {
        const isCurrent = role === currentRole;
        output += `• ${role}${isCurrent ? " (current)" : ""} - Playwright\n`;
      }
    }

    // Show manual roles (created roles that aren't from Playwright)
    const manualOnlyRoles = createdRoles
      .filter((role) => !playwrightRoles.includes(role))
      .sort();
    if (manualOnlyRoles.length > 0) {
      for (const role of manualOnlyRoles) {
        const isCurrent = role === currentRole;
        output += `• ${role}${isCurrent ? " (current)" : ""} - Manual\n`;
      }
    }

    return output.trim();
  }

  async close() {
    await this.bridge.close();
  }
}

async function debugExactMCPFlow() {
  console.log("🔍 Debug: Exact MCP Server Flow");
  console.log("===============================");

  console.log("📋 Environment variables at startup:");
  console.log(
    `   PLAYWRIGHT_CONFIG: ${process.env.PLAYWRIGHT_CONFIG || "NOT SET"}`
  );
  console.log(`   NODE_ENV: ${process.env.NODE_ENV || "NOT SET"}`);
  console.log(`   CWD: ${process.cwd()}`);

  const server = new DebugMCPServer();

  try {
    // Step 1: Simulate browser_initialize
    const initResult = await server.testBrowserInitialize();
    console.log(`\n📤 browser_initialize result: ${initResult}`);

    // Step 2: Simulate list_current_roles
    const rolesResult = await server.testListCurrentRoles();
    console.log(`\n📤 list_current_roles result:`);
    console.log(
      rolesResult
        .split("\n")
        .map((line) => `   ${line}`)
        .join("\n")
    );

    await server.close();
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error("Stack:", error.stack);
    await server.close();
  }
}

debugExactMCPFlow().catch(console.error);
