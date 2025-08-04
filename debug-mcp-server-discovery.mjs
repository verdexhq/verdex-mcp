#!/usr/bin/env node

/**
 * Debug script to investigate MCP server's Playwright role discovery
 */

import { BrowserBridge } from "./dist/multi-role-bridge.js";

async function debugMCPServerDiscovery() {
  console.log("🔍 Debug: MCP Server Playwright Discovery");
  console.log("==========================================");

  // Set environment variable (same as MCP server)
  process.env.PLAYWRIGHT_CONFIG =
    "/Users/johnchildseddy/Desktop/testnexus-codebase/TESTING/browser-bridge/src/test-playwrightconfig.ts";

  console.log("📋 Environment setup:");
  console.log(`   PLAYWRIGHT_CONFIG: ${process.env.PLAYWRIGHT_CONFIG}`);

  // Create BrowserBridge instance (same as MCP server does)
  const bridge = new BrowserBridge();

  try {
    console.log("\n1. Before initialization:");
    console.log(
      `   Playwright roles: [${bridge.getPlaywrightRoles().join(", ")}]`
    );
    console.log(`   Created roles: [${bridge.listRoles().join(", ")}]`);
    console.log(`   Current role: ${bridge.getCurrentRole()}`);

    console.log("\n2. Initializing browser bridge (like MCP server does)...");
    await bridge.initialize();

    console.log("\n3. After initialization:");
    console.log(
      `   Playwright roles: [${bridge.getPlaywrightRoles().join(", ")}]`
    );
    console.log(`   Created roles: [${bridge.listRoles().join(", ")}]`);
    console.log(`   Current role: ${bridge.getCurrentRole()}`);

    console.log("\n4. Simulating MCP list_current_roles logic:");
    const createdRoles = bridge.listRoles();
    const playwrightRoles = bridge.getPlaywrightRoles();
    const currentRole = bridge.getCurrentRole();

    console.log(`   Created roles: [${createdRoles.join(", ")}]`);
    console.log(`   Playwright roles: [${playwrightRoles.join(", ")}]`);
    console.log(`   Current role: ${currentRole}`);

    // Combine all available roles (Playwright + manual)
    const allRoles = new Set([...playwrightRoles, ...createdRoles]);
    console.log(`   All roles: [${Array.from(allRoles).join(", ")}]`);

    if (allRoles.size === 0) {
      console.log("   ❌ Result: Available roles: none");
    } else {
      console.log("   ✅ Result: Roles available!");

      let output = "Available roles:\n";

      // Show Playwright roles first
      const sortedPlaywrightRoles = [...playwrightRoles].sort();
      if (sortedPlaywrightRoles.length > 0) {
        for (const role of sortedPlaywrightRoles) {
          const isCurrent = role === currentRole;
          output += `• ${role}${isCurrent ? " (current)" : ""} - Playwright\n`;
        }
      }

      // Show manual roles
      const manualOnlyRoles = createdRoles
        .filter((role) => !playwrightRoles.includes(role))
        .sort();
      if (manualOnlyRoles.length > 0) {
        for (const role of manualOnlyRoles) {
          const isCurrent = role === currentRole;
          output += `• ${role}${isCurrent ? " (current)" : ""} - Manual\n`;
        }
      }

      console.log("   MCP Output would be:");
      console.log(
        output
          .trim()
          .split("\n")
          .map((line) => `     ${line}`)
          .join("\n")
      );
    }

    await bridge.close();
  } catch (error) {
    console.error("❌ Error during investigation:", error.message);
    console.error("Stack:", error.stack);
    await bridge.close();
  }
}

debugMCPServerDiscovery().catch(console.error);
