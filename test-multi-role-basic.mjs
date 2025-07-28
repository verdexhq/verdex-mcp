// Test basic multi-role functionality
import { BrowserBridge } from "./dist/isolated-bridge-demo.js";

async function testBasicMultiRole() {
  console.log("🧪 Testing basic multi-role functionality...\n");

  const bridge = new BrowserBridge();

  try {
    // Test 1: Initialize browser
    console.log("1️⃣ Initializing browser...");
    await bridge.initialize();
    console.log("✅ Browser initialized");

    // Test 2: Enable multi-role mode
    console.log("\n2️⃣ Enabling multi-role mode...");
    await bridge.enableMultiRoleMode();
    console.log("✅ Multi-role mode enabled");

    // Test 3: Check initial state
    console.log("\n3️⃣ Checking initial state...");
    console.log(`Current role: ${bridge.getCurrentRole()}`);
    console.log(
      `Available roles: ${bridge.listRoles().join(", ") || "(none)"}`
    );

    // Test 4: Switch to a role (triggers context creation)
    console.log("\n4️⃣ Switching to 'customer' role...");
    await bridge.switchRole("customer");
    console.log("✅ Switched to customer role");
    console.log(`Current role: ${bridge.getCurrentRole()}`);
    console.log(`Available roles: ${bridge.listRoles().join(", ")}`);

    // Test 5: Switch to another role
    console.log("\n5️⃣ Switching to 'admin' role...");
    await bridge.switchRole("admin");
    console.log("✅ Switched to admin role");
    console.log(`Current role: ${bridge.getCurrentRole()}`);
    console.log(`Available roles: ${bridge.listRoles().join(", ")}`);

    // Test 6: Switch back to first role
    console.log("\n6️⃣ Switching back to 'customer' role...");
    await bridge.switchRole("customer");
    console.log("✅ Switched back to customer role");
    console.log(`Current role: ${bridge.getCurrentRole()}`);

    // Test 7: Test error handling - switch to same role
    console.log("\n7️⃣ Testing switch to same role (should be no-op)...");
    await bridge.switchRole("customer");
    console.log("✅ Same role switch handled correctly");

    console.log("\n🎉 All basic multi-role tests passed!");
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    console.error(error.stack);
    throw error;
  } finally {
    console.log("\n🧹 Cleaning up...");
    await bridge.close();
    console.log("✅ Cleanup complete");
  }
}

// Run the test
testBasicMultiRole()
  .then(() => {
    console.log("\n✨ Test completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Test failed:", error);
    process.exit(1);
  });
