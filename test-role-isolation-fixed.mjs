// Improved role isolation test with pages that have interactive elements
import { BrowserBridge } from "./dist/isolated-bridge-demo.js";

async function testRoleIsolationFixed() {
  console.log(
    "🧪 Testing role isolation with pages containing interactive elements...\n"
  );

  const bridge = new BrowserBridge();

  try {
    // Initialize and enable multi-role mode
    console.log("1️⃣ Initializing browser and enabling multi-role mode...");
    await bridge.initialize();
    await bridge.enableMultiRoleMode();
    console.log("✅ Setup complete\n");

    // Test 1: Navigate roles to different pages with known interactive elements
    console.log("2️⃣ Testing role isolation with interactive pages...");

    // Role A: Navigate to Example.com (has "More information..." link)
    console.log("   🔄 Customer role navigating to example.com...");
    await bridge.switchRole("customer");
    const customerSnapshot = await bridge.navigate("https://example.com");
    console.log(
      `   📸 Customer snapshot: ${customerSnapshot.elementCount} elements`
    );
    console.log(
      `   📄 Customer content preview: ${customerSnapshot.text.substring(
        0,
        100
      )}...`
    );

    // Role B: Navigate to httpbin forms page (has form elements)
    console.log("   🔄 Admin role navigating to httpbin.org/forms/post...");
    await bridge.switchRole("admin");
    const adminSnapshot = await bridge.navigate(
      "https://httpbin.org/forms/post"
    );
    console.log(`   📸 Admin snapshot: ${adminSnapshot.elementCount} elements`);
    console.log(
      `   📄 Admin content preview: ${adminSnapshot.text.substring(0, 100)}...`
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
        adminSnapshot2.text.includes("form") ||
        adminSnapshot2.text.includes("input")
          ? "forms page ✅"
          : "different page ❌"
      }`
    );
    console.log(`   📊 Admin elements: ${adminSnapshot2.elementCount}`);

    // Test 3: Test interactions within each role
    console.log("\n4️⃣ Testing interactions within isolated roles...");

    // Customer role: Try to click the link
    await bridge.switchRole("customer");
    const customerElements = await bridge.snapshot();
    const customerLink = customerElements.text.match(/\[ref=(e\d+)\]/)?.[1];
    if (customerLink) {
      console.log(`   🖱️  Customer: Found interactive element ${customerLink}`);
      try {
        const elementInfo = await bridge.inspect(customerLink);
        console.log(
          `   🔍 Customer element: ${elementInfo?.role} "${elementInfo?.name}"`
        );
      } catch (error) {
        console.log(`   ❌ Customer inspect failed: ${error.message}`);
      }
    } else {
      console.log(`   ⚠️  Customer: No interactive elements found`);
    }

    // Admin role: Try to interact with form elements
    await bridge.switchRole("admin");
    const adminElements = await bridge.snapshot();
    const adminInput = adminElements.text.match(/\[ref=(e\d+)\]/)?.[1];
    if (adminInput) {
      console.log(`   🖱️  Admin: Found interactive element ${adminInput}`);
      try {
        const elementInfo = await bridge.inspect(adminInput);
        console.log(
          `   🔍 Admin element: ${elementInfo?.role} "${elementInfo?.name}"`
        );

        // Try typing into the form field
        if (elementInfo?.role === "textbox") {
          await bridge.type(adminInput, "test-input-from-admin-role");
          console.log(`   ⌨️  Admin: Typed into ${adminInput}`);
        }
      } catch (error) {
        console.log(`   ❌ Admin interaction failed: ${error.message}`);
      }
    } else {
      console.log(`   ⚠️  Admin: No interactive elements found`);
    }

    // Test 4: Verify element references are isolated between roles
    console.log("\n5️⃣ Testing element reference isolation...");

    // Try to use customer's element ref in admin role
    await bridge.switchRole("admin");
    if (customerLink) {
      try {
        await bridge.inspect(customerLink);
        console.log(`   ❌ Element refs are NOT isolated (this is bad)`);
      } catch (error) {
        console.log(
          `   ✅ Element refs are properly isolated (${
            error.message.includes("not found")
              ? "element not found"
              : "access denied"
          })`
        );
      }
    }

    // Try to use admin's element ref in customer role
    await bridge.switchRole("customer");
    if (adminInput) {
      try {
        await bridge.inspect(adminInput);
        console.log(`   ❌ Element refs are NOT isolated (this is bad)`);
      } catch (error) {
        console.log(
          `   ✅ Element refs are properly isolated (${
            error.message.includes("not found")
              ? "element not found"
              : "access denied"
          })`
        );
      }
    }

    // Test 5: Create third role and verify all isolation still works
    console.log("\n6️⃣ Testing three-way role isolation...");

    await bridge.switchRole("tester");
    const testerSnapshot = await bridge.navigate("https://httpbin.org");
    console.log(
      `   📸 Tester on httpbin root: ${testerSnapshot.elementCount} elements`
    );

    // Final isolation verification
    console.log("   🔍 Final isolation check:");

    await bridge.switchRole("customer");
    const finalCustomer = await bridge.snapshot();
    console.log(
      `      Customer: ${
        finalCustomer.text.includes("Example Domain")
          ? "example.com ✅"
          : "wrong page ❌"
      }`
    );

    await bridge.switchRole("admin");
    const finalAdmin = await bridge.snapshot();
    console.log(
      `      Admin: ${
        finalAdmin.text.includes("form") || finalAdmin.text.includes("input")
          ? "forms page ✅"
          : "wrong page ❌"
      }`
    );

    await bridge.switchRole("tester");
    const finalTester = await bridge.snapshot();
    console.log(
      `      Tester: ${
        finalTester.text.includes("httpbin") &&
        !finalTester.text.includes("form")
          ? "httpbin root ✅"
          : "wrong page ❌"
      }`
    );

    console.log("\n🎉 All role isolation tests completed!");
    console.log(`\n📊 Final status:`);
    console.log(`   Current role: ${bridge.getCurrentRole()}`);
    console.log(`   Available roles: ${bridge.listRoles().join(", ")}`);
    console.log(`   Total contexts: ${bridge.listRoles().length}`);
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
testRoleIsolationFixed()
  .then(() => {
    console.log("\n✨ Improved role isolation test completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Role isolation test failed:", error);
    process.exit(1);
  });
