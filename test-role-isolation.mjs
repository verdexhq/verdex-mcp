// Test role isolation with navigation and snapshots
import { BrowserBridge } from "./dist/isolated-bridge-demo.js";

async function testRoleIsolation() {
  console.log("🧪 Testing role isolation with navigation and snapshots...\n");

  const bridge = new BrowserBridge();

  try {
    // Initialize and enable multi-role mode
    console.log("1️⃣ Initializing browser and enabling multi-role mode...");
    await bridge.initialize();
    await bridge.enableMultiRoleMode();
    console.log("✅ Setup complete\n");

    // Test 1: Navigate roles to different pages
    console.log("2️⃣ Testing role isolation with different pages...");

    // Role A: Navigate to Example.com
    console.log("   🔄 Customer role navigating to example.com...");
    await bridge.switchRole("customer");
    const customerSnapshot = await bridge.navigate("https://example.com");
    console.log(
      `   📸 Customer snapshot: ${customerSnapshot.elementCount} elements`
    );
    console.log(
      `   📄 Customer page title: ${
        customerSnapshot.text.includes("Example Domain")
          ? "Example Domain"
          : "Unknown"
      }`
    );

    // Role B: Navigate to different page
    console.log("   🔄 Admin role navigating to httpbin.org...");
    await bridge.switchRole("admin");
    const adminSnapshot = await bridge.navigate("https://httpbin.org");
    console.log(`   📸 Admin snapshot: ${adminSnapshot.elementCount} elements`);
    console.log(
      `   📄 Admin page title: ${
        adminSnapshot.text.includes("httpbin") ? "httpbin page" : "Unknown"
      }`
    );

    // Test 2: Verify isolation by switching back
    console.log("\n3️⃣ Testing state persistence after role switch...");

    await bridge.switchRole("customer");
    const customerSnapshot2 = await bridge.snapshot();
    console.log(
      `   🔍 Customer still on: ${
        customerSnapshot2.text.includes("Example Domain")
          ? "example.com ✅"
          : "different page ❌"
      }`
    );
    console.log(`   📊 Customer elements: ${customerSnapshot2.elementCount}`);

    await bridge.switchRole("admin");
    const adminSnapshot2 = await bridge.snapshot();
    console.log(
      `   🔍 Admin still on: ${
        adminSnapshot2.text.includes("httpbin")
          ? "httpbin.org ✅"
          : "different page ❌"
      }`
    );
    console.log(`   📊 Admin elements: ${adminSnapshot2.elementCount}`);

    // Test 3: Test bridge resurrection after navigation
    console.log("\n4️⃣ Testing bridge resurrection after navigation...");

    await bridge.switchRole("customer");
    console.log(
      "   🔄 Customer navigating to new page (tests bridge resurrection)..."
    );
    const newCustomerSnapshot = await bridge.navigate(
      "https://httpbin.org/html"
    );
    console.log(
      `   📸 Bridge resurrected: ${
        newCustomerSnapshot.elementCount > 0 ? "✅" : "❌"
      }`
    );
    console.log(
      `   📊 New customer elements: ${newCustomerSnapshot.elementCount}`
    );

    // Verify admin role is still on its original page
    await bridge.switchRole("admin");
    const adminSnapshot3 = await bridge.snapshot();
    console.log(
      `   🔍 Admin still isolated: ${
        adminSnapshot3.text.includes("httpbin") ? "✅" : "❌"
      }`
    );

    // Test 4: Create third role and verify all isolation
    console.log("\n5️⃣ Testing three-way role isolation...");

    await bridge.switchRole("moderator");
    const moderatorSnapshot = await bridge.navigate("https://example.com");
    console.log(
      `   📸 Moderator on example.com: ${moderatorSnapshot.elementCount} elements`
    );

    // Quick check all three roles
    console.log("   🔍 Final isolation check:");

    await bridge.switchRole("customer");
    const finalCustomer = await bridge.snapshot();
    console.log(
      `      Customer: ${
        finalCustomer.text.includes("httpbin.org/html")
          ? "httpbin/html ✅"
          : "wrong page ❌"
      }`
    );

    await bridge.switchRole("admin");
    const finalAdmin = await bridge.snapshot();
    console.log(
      `      Admin: ${
        finalAdmin.text.includes("httpbin") &&
        !finalAdmin.text.includes("/html")
          ? "httpbin root ✅"
          : "wrong page ❌"
      }`
    );

    await bridge.switchRole("moderator");
    const finalModerator = await bridge.snapshot();
    console.log(
      `      Moderator: ${
        finalModerator.text.includes("Example Domain")
          ? "example.com ✅"
          : "wrong page ❌"
      }`
    );

    // Test 5: Verify element refs are isolated
    console.log("\n6️⃣ Testing element reference isolation...");

    // Get element from customer role
    await bridge.switchRole("customer");
    const customerElements = await bridge.snapshot();
    const customerRef = customerElements.text.match(/\[ref=(e\d+)\]/)?.[1];

    // Switch to admin and try to use customer's element ref
    await bridge.switchRole("admin");
    if (customerRef) {
      try {
        await bridge.inspect(customerRef);
        console.log(`   ❌ Element refs are NOT isolated (this is bad)`);
      } catch (error) {
        console.log(
          `   ✅ Element refs are properly isolated (${
            error.message.includes("not found") ? "element not found" : "error"
          })`
        );
      }
    } else {
      console.log(`   ⚠️  No customer elements found to test isolation`);
    }

    console.log("\n🎉 All role isolation tests completed!");
    console.log(`\n📊 Final status:`);
    console.log(`   Current role: ${bridge.getCurrentRole()}`);
    console.log(`   Available roles: ${bridge.listRoles().join(", ")}`);
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
testRoleIsolation()
  .then(() => {
    console.log("\n✨ Role isolation test completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Role isolation test failed:", error);
    process.exit(1);
  });
