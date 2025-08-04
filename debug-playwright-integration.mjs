#!/usr/bin/env node

/**
 * Debug script to check what's happening with Playwright role classification
 */

import { BrowserBridge } from "./dist/multi-role-bridge.js";

async function debugPlaywrightIntegration() {
  console.log("🔍 Debug: Playwright Integration Status");
  console.log("=====================================");

  const bridge = new BrowserBridge();

  try {
    console.log("1. Initializing browser bridge...");
    await bridge.initialize();

    console.log("\n2. Checking discovered Playwright roles...");
    const playwrightRoles = bridge.getPlaywrightRoles();
    console.log(`   Playwright roles: [${playwrightRoles.join(", ")}]`);

    console.log("\n3. Checking created roles...");
    const createdRoles = bridge.listRoles();
    console.log(`   Created roles: [${createdRoles.join(", ")}]`);

    console.log("\n4. Testing role selection...");
    await bridge.selectRole("customer");

    console.log("\n5. Checking roles after selection...");
    const rolesAfterSelection = bridge.listRoles();
    const playwrightRolesAfter = bridge.getPlaywrightRoles();
    console.log(`   Created roles: [${rolesAfterSelection.join(", ")}]`);
    console.log(`   Playwright roles: [${playwrightRolesAfter.join(", ")}]`);

    console.log("\n6. Role classification check:");
    for (const role of rolesAfterSelection) {
      const isPlaywright = playwrightRolesAfter.includes(role);
      console.log(`   ${role}: ${isPlaywright ? "Playwright" : "Manual"}`);
    }

    await bridge.close();
  } catch (error) {
    console.error("❌ Error:", error.message);
    await bridge.close();
  }
}

// Set environment variable for testing
process.env.PLAYWRIGHT_CONFIG =
  "/Users/johnchildseddy/Desktop/testnexus-codebase/TESTING/browser-bridge/src/test-playwrightconfig.ts";

debugPlaywrightIntegration().catch(console.error);
