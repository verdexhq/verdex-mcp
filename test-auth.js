#!/usr/bin/env node

import { MultiContextBrowser } from "./dist/multi-context-browser.js";

async function testAuth() {
  console.log("🧪 Testing authentication after parameter cleanup...\n");

  const browser = new MultiContextBrowser();

  try {
    // Set up roles configuration
    const rolesConfig = {
      roles: {
        customer: {
          authPath:
            "/Users/johnchildseddy/Desktop/testnexus-codebase/TESTING/browser-bridge/.auth/customer.json",
          defaultUrl: "https://cs-fit.staging01.joinzipper.com",
        },
      },
    };
    browser.setRolesConfiguration(rolesConfig);

    // Initialize and select customer role
    await browser.initialize();
    await browser.selectRole("customer");

    // Check if we're authenticated
    const snapshot = await browser.snapshot();

    if (snapshot.text.includes("Dashboard") && snapshot.text.includes("Shop")) {
      console.log("✅ Authentication working - found Dashboard and Shop links");
      console.log("✅ Test PASSED - parameter cleanup successful!");
    } else {
      console.log("❌ Authentication failed - still on login page");
      console.log("❌ Test FAILED");
      console.log("Page content:", snapshot.text.substring(0, 200));
    }
  } catch (error) {
    console.error("❌ Test error:", error.message);
  } finally {
    await browser.close();
  }
}

testAuth().catch(console.error);
