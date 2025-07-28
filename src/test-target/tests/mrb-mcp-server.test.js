import { BrowserBridge } from "../../../dist/multi-role-bridge.js";
import { setTimeout } from "timers/promises";

/**
 * Comprehensive test suite for the Multi-Role Browser Bridge
 * Tests the core functionality that powers the MCP server
 */
async function testMultiRoleBrowserBridge() {
  console.log("🚀 Testing Multi-Role Browser Bridge (MCP Server Backend)...\n");

  const bridge = new BrowserBridge();
  let testResults = {
    passed: 0,
    failed: 0,
    errors: [],
  };

  // Helper function to test bridge methods with error handling
  async function testBridgeMethod(methodName, args, testDescription) {
    try {
      console.log(`   Testing ${methodName}...`);
      let result;
      if (args.length === 0) {
        result = await bridge[methodName]();
      } else {
        result = await bridge[methodName](...args);
      }
      console.log(`   ✅ ${testDescription} - Success`);
      testResults.passed++;
      return result;
    } catch (error) {
      console.error(`   ❌ ${testDescription} - Error: ${error.message}`);
      testResults.errors.push(`${testDescription}: ${error.message}`);
      testResults.failed++;
      return null;
    }
  }

  try {
    // Test 1: Bridge Initialization
    console.log("1️⃣ Testing bridge initialization...");
    await testBridgeMethod("initialize", [], "Bridge Initialize");
    console.log("");

    // Test 2: Role Management - Get Current Role
    console.log("2️⃣ Testing get current role...");
    const currentRole = await testBridgeMethod(
      "getCurrentRole",
      [],
      "Get Current Role"
    );
    if (currentRole) {
      console.log(`   Current role: ${currentRole}`);
    }
    console.log("");

    // Test 3: Role Management - List Roles
    console.log("3️⃣ Testing list roles...");
    const roles = await testBridgeMethod("listRoles", [], "List Roles");
    if (roles) {
      console.log(`   Available roles: ${roles.join(", ") || "none"}`);
    }
    console.log("");

    // Test 4: Browser Navigation
    console.log("4️⃣ Testing browser navigation...");
    const snapshot = await testBridgeMethod(
      "navigate",
      ["https://example.com"],
      "Navigate to example.com"
    );
    if (snapshot) {
      console.log(`   Found ${snapshot.elementCount} interactive elements`);
      console.log(`   Snapshot preview: ${snapshot.text.substring(0, 100)}...`);
    }
    console.log("");

    // Test 5: Take Snapshot
    console.log("5️⃣ Testing snapshot functionality...");
    const snapshot2 = await testBridgeMethod("snapshot", [], "Take Snapshot");
    if (snapshot2) {
      const elementRefs = snapshot2.text.match(/\[ref=e\d+\]/g);
      console.log(
        `   Snapshot contains ${elementRefs?.length || 0} interactive elements`
      );
    }
    console.log("");

    // Test 6: Element Analysis (if we have elements)
    const snapshotText = snapshot2?.text || "";
    const elementRefs = snapshotText.match(/\[ref=(e\d+)\]/g);

    if (elementRefs && elementRefs.length > 0) {
      const firstRef = elementRefs[0].match(/e\d+/)[0];

      // Test 6a: Element Inspection
      console.log(`6️⃣ Testing element inspection for ${firstRef}...`);
      const elementInfo = await testBridgeMethod(
        "inspect",
        [firstRef],
        "Element Inspection"
      );
      if (elementInfo) {
        console.log(
          `   Element: ${elementInfo.tagName}, Role: ${elementInfo.role}, Name: ${elementInfo.name}`
        );
      }
      console.log("");

      // Test 7: Ancestor Exploration
      console.log(`7️⃣ Testing ancestor exploration for ${firstRef}...`);
      const ancestors = await testBridgeMethod(
        "get_ancestors",
        [firstRef],
        "Get Ancestors"
      );
      if (ancestors) {
        console.log(
          `   Found ${ancestors.ancestors?.length || 0} ancestor levels`
        );
        if (ancestors.ancestors && ancestors.ancestors.length > 0) {
          console.log(`   Top ancestor: ${ancestors.ancestors[0].tagName}`);

          // Test 8: Sibling Analysis
          console.log(`8️⃣ Testing sibling analysis at level 1...`);
          const siblings = await testBridgeMethod(
            "get_siblings",
            [firstRef, 1],
            "Get Siblings"
          );
          if (siblings) {
            console.log(
              `   Found ${siblings.siblings?.length || 0} siblings at level 1`
            );
          }
          console.log("");

          // Test 9: Descendant Exploration
          console.log(`9️⃣ Testing descendant exploration at level 1...`);
          const descendants = await testBridgeMethod(
            "get_descendants",
            [firstRef, 1],
            "Get Descendants"
          );
          if (descendants) {
            console.log(
              `   Found ${descendants.descendants?.length || 0} direct children`
            );
          }
          console.log("");
        }
      }

      // Test 10: Element Interaction - Click
      console.log(`🔟 Testing click interaction for ${firstRef}...`);
      await testBridgeMethod("click", [firstRef], "Click Interaction");
      console.log("");
    } else {
      console.log(
        "⚠️  No interactive elements found - skipping interaction tests\n"
      );
    }

    // Test 11: Role Creation and Switching
    console.log("1️⃣1️⃣ Testing role creation and switching...");
    await testBridgeMethod("selectRole", ["test-user"], "Select New Role");

    // Verify role switch
    const newRole = await testBridgeMethod(
      "getCurrentRole",
      [],
      "Get Role After Switch"
    );
    if (newRole) {
      console.log(`   Now using role: ${newRole}`);
    }

    // List roles to verify creation
    const updatedRoles = await testBridgeMethod(
      "listRoles",
      [],
      "List Roles After Creation"
    );
    if (updatedRoles) {
      console.log(`   Available roles: ${updatedRoles.join(", ")}`);
    }
    console.log("");

    // Test 12: Role Isolation - Navigate in new role
    console.log("1️⃣2️⃣ Testing role isolation with different navigation...");
    const isolationSnapshot = await testBridgeMethod(
      "navigate",
      ["https://httpbin.org/html"],
      "Role Isolation Navigation"
    );
    if (isolationSnapshot) {
      console.log(
        `   Navigation in test-user role: ${isolationSnapshot.elementCount} elements`
      );
    }
    console.log("");

    // Test 13: Switch back to default role
    console.log("1️⃣3️⃣ Testing switch back to default role...");
    await testBridgeMethod("selectRole", ["default"], "Switch Back to Default");
    const backToDefault = await testBridgeMethod(
      "getCurrentRole",
      [],
      "Verify Default Role"
    );
    if (backToDefault) {
      console.log(`   Back to role: ${backToDefault}`);
    }
    console.log("");

    // Test 14: Type interaction with form page
    console.log("1️⃣4️⃣ Testing type interaction...");
    const formSnapshot = await testBridgeMethod(
      "navigate",
      ["https://httpbin.org/forms/post"],
      "Navigate to Form"
    );

    if (formSnapshot) {
      await setTimeout(1000); // Wait for page load

      const formSnapshot2 = await testBridgeMethod(
        "snapshot",
        [],
        "Form Page Snapshot"
      );
      if (formSnapshot2) {
        const formRefs = formSnapshot2.text.match(/\[ref=(e\d+)\]/g);

        if (formRefs && formRefs.length > 0) {
          const inputRef = formRefs[0].match(/e\d+/)[0];
          console.log(`   Testing type for ${inputRef}...`);
          await testBridgeMethod(
            "type",
            [inputRef, "Test input text"],
            "Type Interaction"
          );
        }
      }
    }
    console.log("");

    // Test 15: Error handling - Invalid element reference
    console.log("1️⃣5️⃣ Testing error handling...");
    try {
      await bridge.click("invalid-ref");
      console.log(`   ❌ Error handling failed - should have thrown error`);
      testResults.failed++;
    } catch (error) {
      console.log(`   ✅ Error handling works correctly: ${error.message}`);
      testResults.passed++;
    }
    console.log("");

    // Test 16: Storage State Functionality
    console.log("1️⃣6️⃣ Testing storage state functionality...");
    try {
      const savedPath = await testBridgeMethod(
        "saveStorageState",
        [],
        "Save Storage State"
      );
      if (savedPath) {
        console.log(`   Saved storage state to: ${savedPath}`);

        // Test loading storage state
        await testBridgeMethod(
          "loadStorageState",
          [savedPath],
          "Load Storage State"
        );
      }
    } catch (error) {
      console.log(`   ⚠️  Storage state test skipped: ${error.message}`);
    }
    console.log("");
  } catch (error) {
    console.error("❌ Fatal test error:", error.message);
    testResults.errors.push(`Fatal: ${error.message}`);
    testResults.failed++;
  }

  // Test 17: Cleanup
  console.log("1️⃣7️⃣ Testing browser cleanup...");
  try {
    await testBridgeMethod("close", [], "Browser Close");
  } catch (error) {
    console.log(`   ⚠️  Cleanup error (non-critical): ${error.message}`);
  }
  console.log("");

  // Test Summary
  console.log("📊 Test Results Summary:");
  console.log(`   ✅ Passed: ${testResults.passed}`);
  console.log(`   ❌ Failed: ${testResults.failed}`);
  console.log(
    `   📈 Success Rate: ${(
      (testResults.passed / (testResults.passed + testResults.failed)) *
      100
    ).toFixed(1)}%`
  );

  if (testResults.errors.length > 0) {
    console.log(`\n❌ Errors encountered:`);
    testResults.errors.forEach((error) => console.log(`   - ${error}`));
  }

  console.log(`\n🎉 Multi-Role Browser Bridge test completed!`);

  return testResults;
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testMultiRoleBrowserBridge()
    .then((results) => {
      process.exit(results.failed > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}

export { testMultiRoleBrowserBridge };
