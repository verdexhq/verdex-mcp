// Diagnostic test for bridge creation and element detection
import { BrowserBridge } from "./dist/isolated-bridge-demo.js";

async function testBridgeDiagnostic() {
  console.log(
    "🔬 Diagnostic test for bridge creation and element detection...\n"
  );

  const bridge = new BrowserBridge();

  try {
    console.log("1️⃣ Initializing browser...");
    await bridge.initialize();
    await bridge.enableMultiRoleMode();
    console.log("✅ Setup complete\n");

    // Test 1: Navigate to a simple page we know has elements
    console.log("2️⃣ Testing bridge creation with simple page...");
    await bridge.switchRole("test");

    console.log("   🔄 Navigating to example.com...");
    const snapshot1 = await bridge.navigate("https://example.com");
    console.log(`   📸 Snapshot result:`, {
      elementCount: snapshot1.elementCount,
      hasText: snapshot1.text.length > 0,
      textPreview: snapshot1.text.substring(0, 200) + "...",
    });

    // Test 2: Try the page that was failing
    console.log("\n3️⃣ Testing navigation to httpbin.org/html...");
    console.log("   🔄 Navigating to httpbin.org/html...");
    const snapshot2 = await bridge.navigate("https://httpbin.org/html");
    console.log(`   📸 Snapshot result:`, {
      elementCount: snapshot2.elementCount,
      hasText: snapshot2.text.length > 0,
      textPreview: snapshot2.text.substring(0, 200) + "...",
    });

    // Test 3: Direct bridge test
    console.log("\n4️⃣ Testing bridge object directly...");
    const context = await bridge.getOrCreateRole("test");

    console.log("   🔍 Context status:", {
      hasPage: !!context.page,
      hasCDP: !!context.cdpSession,
      hasIsolatedWorld: !!context.isolatedWorldId,
      hasBridgeObject: !!context.bridgeObjectId,
      pageUrl: context.page?.url() || "unknown",
    });

    // Test 4: Manual bridge call
    if (context.bridgeObjectId) {
      console.log("\n5️⃣ Testing manual bridge call...");
      try {
        const { result } = await context.cdpSession.send(
          "Runtime.callFunctionOn",
          {
            functionDeclaration: `function() { 
            console.log("Bridge test - document.body exists:", !!document.body);
            console.log("Bridge test - document.body.children.length:", document.body ? document.body.children.length : 0);
            return {
              bodyExists: !!document.body,
              bodyChildren: document.body ? document.body.children.length : 0,
              location: window.location.href
            };
          }`,
            objectId: context.bridgeObjectId,
            returnByValue: true,
          }
        );

        console.log("   🔧 Manual bridge test result:", result.value);
      } catch (error) {
        console.log("   ❌ Manual bridge test failed:", error.message);
      }
    }

    // Test 5: Check what the bridge's snapshot function actually returns
    if (context.bridgeObjectId) {
      console.log("\n6️⃣ Testing bridge snapshot function directly...");
      try {
        const { result } = await context.cdpSession.send(
          "Runtime.callFunctionOn",
          {
            functionDeclaration: `function() { 
            try {
              const snapshot = this.snapshot();
              console.log("Snapshot result:", snapshot);
              return snapshot;
            } catch (error) {
              console.error("Snapshot error:", error);
              return { error: error.message, text: "", elementCount: 0 };
            }
          }`,
            objectId: context.bridgeObjectId,
            returnByValue: true,
          }
        );

        console.log("   📸 Direct snapshot result:", {
          elementCount: result.value.elementCount,
          hasError: !!result.value.error,
          error: result.value.error,
          textLength: result.value.text?.length || 0,
        });
      } catch (error) {
        console.log("   ❌ Direct snapshot test failed:", error.message);
      }
    }

    // Test 6: Compare single vs multi-role mode
    console.log("\n7️⃣ Testing single-role mode comparison...");

    // Create a new bridge in single-role mode
    const singleBridge = new BrowserBridge();
    await singleBridge.initialize();
    const singleSnapshot = await singleBridge.navigate("https://example.com");
    console.log(
      `   📸 Single-role snapshot: ${singleSnapshot.elementCount} elements`
    );
    await singleBridge.close();

    console.log("\n🎉 Diagnostic tests completed!");
  } catch (error) {
    console.error("\n❌ Diagnostic test failed:", error.message);
    console.error(error.stack);
    throw error;
  } finally {
    console.log("\n🧹 Cleaning up...");
    await bridge.close();
    console.log("✅ Cleanup complete");
  }
}

// Run the test
testBridgeDiagnostic()
  .then(() => {
    console.log("\n✨ Diagnostic test completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Diagnostic test failed:", error);
    process.exit(1);
  });
