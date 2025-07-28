// Debug test for element reference isolation
import { BrowserBridge } from "./dist/isolated-bridge-demo.js";

async function debugElementIsolation() {
  console.log("🔍 Debugging element reference isolation...\n");

  const bridge = new BrowserBridge();

  try {
    await bridge.initialize();
    await bridge.enableMultiRoleMode();
    console.log("✅ Setup complete\n");

    // Test 1: Create elements in role A
    console.log("1️⃣ Creating elements in Role A...");
    await bridge.switchRole("roleA");
    await bridge.navigate("https://example.com");
    const roleASnapshot = await bridge.snapshot();
    const roleARef = roleASnapshot.text.match(/\[ref=(e\d+)\]/)?.[1];
    console.log(`   Role A elements: ${roleASnapshot.elementCount}`);
    console.log(`   Role A ref: ${roleARef}`);
    console.log(`   Role A bridge elements count: (checking...)`);

    // Get Role A bridge and check its elements directly
    const roleAContext = await bridge.getOrCreateRole("roleA");
    if (roleAContext.bridgeObjectId) {
      const { result: roleABridgeInfo } = await roleAContext.cdpSession.send(
        "Runtime.callFunctionOn",
        {
          functionDeclaration: `function() { 
          return {
            elementsCount: this.elements.size,
            elementKeys: Array.from(this.elements.keys()),
            bridgeId: Math.random() // Unique identifier for this bridge instance
          };
        }`,
          objectId: roleAContext.bridgeObjectId,
          returnByValue: true,
        }
      );
      console.log(`   Role A bridge info:`, roleABridgeInfo.value);
    }

    // Test 2: Create elements in role B
    console.log("\n2️⃣ Creating elements in Role B...");
    await bridge.switchRole("roleB");
    await bridge.navigate("https://httpbin.org/forms/post");
    const roleBSnapshot = await bridge.snapshot();
    const roleBRef = roleBSnapshot.text.match(/\[ref=(e\d+)\]/)?.[1];
    console.log(`   Role B elements: ${roleBSnapshot.elementCount}`);
    console.log(`   Role B ref: ${roleBRef}`);

    // Get Role B bridge and check its elements directly
    const roleBContext = await bridge.getOrCreateRole("roleB");
    if (roleBContext.bridgeObjectId) {
      const { result: roleBBridgeInfo } = await roleBContext.cdpSession.send(
        "Runtime.callFunctionOn",
        {
          functionDeclaration: `function() { 
          return {
            elementsCount: this.elements.size,
            elementKeys: Array.from(this.elements.keys()),
            bridgeId: Math.random() // Unique identifier for this bridge instance
          };
        }`,
          objectId: roleBContext.bridgeObjectId,
          returnByValue: true,
        }
      );
      console.log(`   Role B bridge info:`, roleBBridgeInfo.value);
    }

    // Test 3: Test cross-role element access
    console.log("\n3️⃣ Testing cross-role element access...");

    console.log("   Testing Role A ref from Role B context:");
    await bridge.switchRole("roleB");
    if (roleARef) {
      try {
        const crossResult = await bridge.inspect(roleARef);
        console.log(
          `   ❌ Role B can access Role A's ${roleARef}: ${crossResult?.role}`
        );

        // Check which bridge actually handled this
        if (roleBContext.bridgeObjectId) {
          const { result: whichBridge } = await roleBContext.cdpSession.send(
            "Runtime.callFunctionOn",
            {
              functionDeclaration: `function(ref) { 
              const hasElement = this.elements.has(ref);
              return {
                hasElement: hasElement,
                totalElements: this.elements.size,
                elementKeys: Array.from(this.elements.keys())
              };
            }`,
              objectId: roleBContext.bridgeObjectId,
              arguments: [{ value: roleARef }],
              returnByValue: true,
            }
          );
          console.log(`   Role B bridge has ${roleARef}:`, whichBridge.value);
        }
      } catch (error) {
        console.log(
          `   ✅ Role B cannot access Role A's ${roleARef}: ${error.message}`
        );
      }
    }

    console.log("\n   Testing Role B ref from Role A context:");
    await bridge.switchRole("roleA");
    if (roleBRef) {
      try {
        const crossResult = await bridge.inspect(roleBRef);
        console.log(
          `   ❌ Role A can access Role B's ${roleBRef}: ${crossResult?.role}`
        );

        // Check which bridge actually handled this
        if (roleAContext.bridgeObjectId) {
          const { result: whichBridge } = await roleAContext.cdpSession.send(
            "Runtime.callFunctionOn",
            {
              functionDeclaration: `function(ref) { 
              const hasElement = this.elements.has(ref);
              return {
                hasElement: hasElement,
                totalElements: this.elements.size,
                elementKeys: Array.from(this.elements.keys())
              };
            }`,
              objectId: roleAContext.bridgeObjectId,
              arguments: [{ value: roleBRef }],
              returnByValue: true,
            }
          );
          console.log(`   Role A bridge has ${roleBRef}:`, whichBridge.value);
        }
      } catch (error) {
        console.log(
          `   ✅ Role A cannot access Role B's ${roleBRef}: ${error.message}`
        );
      }
    }

    // Test 4: Compare bridge object IDs
    console.log("\n4️⃣ Comparing bridge objects...");
    console.log(`   Role A bridge object ID: ${roleAContext.bridgeObjectId}`);
    console.log(`   Role B bridge object ID: ${roleBContext.bridgeObjectId}`);
    console.log(
      `   Bridge objects different: ${
        roleAContext.bridgeObjectId !== roleBContext.bridgeObjectId
          ? "✅"
          : "❌"
      }`
    );
    console.log(
      `   Isolated world IDs different: ${
        roleAContext.isolatedWorldId !== roleBContext.isolatedWorldId
          ? "✅"
          : "❌"
      }`
    );

    console.log("\n🎉 Element isolation debug completed!");
  } catch (error) {
    console.error("\n❌ Debug test failed:", error.message);
    console.error(error.stack);
    throw error;
  } finally {
    console.log("\n🧹 Cleaning up...");
    await bridge.close();
    console.log("✅ Cleanup complete");
  }
}

// Run the test
debugElementIsolation()
  .then(() => {
    console.log("\n✨ Element isolation debug completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Element isolation debug failed:", error);
    process.exit(1);
  });
