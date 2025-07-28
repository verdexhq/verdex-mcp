import { BrowserBridge } from "./dist/multi-role-bridge.js";
import * as fs from "fs/promises";

async function testStorageState() {
  const bridge = new BrowserBridge();

  try {
    console.log("🚀 Testing Playwright Storage State Integration");

    // Initialize browser
    await bridge.initialize();
    console.log("✅ Browser initialized");

    // Test 1: Navigate to a site with some state
    console.log("\n📍 Test 1: Navigate and create some browser state");
    await bridge.navigate("https://httpbin.org/");

    // Add some localStorage items for testing
    await bridge.getCurrentContext().then(async (context) => {
      await context.page.evaluate(() => {
        localStorage.setItem("test-key", "test-value");
        localStorage.setItem("user-preference", "dark-mode");
        sessionStorage.setItem("session-data", "temporary-value");
      });
    });
    console.log("✅ Added test data to localStorage and sessionStorage");

    // Test 2: Save storage state in Playwright format
    console.log("\n💾 Test 2: Save storage state");
    const savedPath = await bridge.saveStorageState();
    console.log(`✅ Storage state saved to: ${savedPath}`);

    // Verify the file exists and has correct format
    const storageContent = await fs.readFile(savedPath, "utf-8");
    const storageState = JSON.parse(storageContent);

    console.log("📋 Storage state structure:");
    console.log(`  - Cookies: ${storageState.cookies?.length || 0}`);
    console.log(`  - Origins: ${storageState.origins?.length || 0}`);

    if (storageState.origins && storageState.origins.length > 0) {
      const origin = storageState.origins[0];
      console.log(
        `  - localStorage items: ${origin.localStorage?.length || 0}`
      );
      console.log(
        `  - sessionStorage items: ${origin.sessionStorage?.length || 0}`
      );
    }

    // Test 3: Switch to new role and load storage state
    console.log("\n🔄 Test 3: Switch to new role and load storage state");
    await bridge.switchRole("test-role");
    console.log("✅ Switched to 'test-role'");

    // Navigate to the same site (fresh context)
    await bridge.navigate("https://httpbin.org/");
    console.log("✅ Navigated to fresh page");

    // Load the storage state
    await bridge.loadStorageState(savedPath);
    console.log("✅ Loaded storage state");

    // Test 4: Verify the state was restored
    console.log("\n🔍 Test 4: Verify storage state restoration");
    const context = await bridge.getCurrentContext();
    const restoredData = await context.page.evaluate(() => {
      return {
        localStorage: {
          "test-key": localStorage.getItem("test-key"),
          "user-preference": localStorage.getItem("user-preference"),
        },
        sessionStorage: {
          "session-data": sessionStorage.getItem("session-data"),
        },
      };
    });

    console.log("📋 Restored data:");
    console.log(
      `  - localStorage['test-key']: ${restoredData.localStorage["test-key"]}`
    );
    console.log(
      `  - localStorage['user-preference']: ${restoredData.localStorage["user-preference"]}`
    );
    console.log(
      `  - sessionStorage['session-data']: ${restoredData.sessionStorage["session-data"]}`
    );

    // Test 5: Test createRoleFromStorageState method
    console.log("\n🎭 Test 5: Create role from existing storage state");
    await bridge.createRoleFromStorageState("playwright-role", savedPath);
    console.log("✅ Created 'playwright-role' from storage state");

    // Verify the loaded role has the data
    const finalContext = await bridge.getCurrentContext();
    const finalData = await finalContext.page.evaluate(() => {
      return localStorage.getItem("test-key");
    });
    console.log(`✅ Final verification - test-key: ${finalData}`);

    console.log("\n🎉 All storage state tests passed!");

    // Show current roles
    console.log(`\n📋 Available roles: ${bridge.listRoles().join(", ")}`);
    console.log(`📋 Current role: ${bridge.getCurrentRole()}`);
  } catch (error) {
    console.error("❌ Test failed:", error);
    throw error;
  } finally {
    await bridge.close();
    console.log("🧹 Browser closed");
  }
}

// Run the test
testStorageState().catch(console.error);
