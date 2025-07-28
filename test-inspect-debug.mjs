// Debug the inspect function behavior
import { BrowserBridge } from "./dist/isolated-bridge-demo.js";

async function debugInspectFunction() {
  console.log("🔍 Debugging inspect function behavior...\n");

  const bridge = new BrowserBridge();

  try {
    await bridge.initialize();
    await bridge.enableMultiRoleMode();
    console.log("✅ Setup complete\n");

    // Create a role with elements
    console.log("1️⃣ Creating role with elements...");
    await bridge.switchRole("test");
    await bridge.navigate("https://example.com");
    const snapshot = await bridge.snapshot();
    console.log(`   Elements found: ${snapshot.elementCount}`);
    console.log(`   Snapshot text: ${snapshot.text}`);

    const validRef = snapshot.text.match(/\[ref=(e\d+)\]/)?.[1];
    console.log(`   Valid ref: ${validRef}`);

    // Test 1: Valid element access
    console.log("\n2️⃣ Testing valid element access...");
    if (validRef) {
      try {
        const result = await bridge.inspect(validRef);
        console.log(`   Valid element result:`, {
          role: result?.role,
          name: result?.name,
          isNull: result === null,
          isUndefined: result === undefined,
          type: typeof result,
        });
      } catch (error) {
        console.log(`   Valid element error: ${error.message}`);
      }
    }

    // Test 2: Invalid element access
    console.log("\n3️⃣ Testing invalid element access...");
    try {
      const result = await bridge.inspect("e99");
      console.log(`   Invalid element result:`, {
        value: result,
        isNull: result === null,
        isUndefined: result === undefined,
        type: typeof result,
      });
    } catch (error) {
      console.log(
        `   ✅ Invalid element properly threw error: ${error.message}`
      );
    }

    // Test 3: Direct bridge call to check what the bridge actually does
    console.log("\n4️⃣ Testing direct bridge call...");
    const context = await bridge.getOrCreateRole("test");
    if (context.bridgeObjectId) {
      try {
        const { result } = await context.cdpSession.send(
          "Runtime.callFunctionOn",
          {
            functionDeclaration: `function() { 
            try {
              // Test with valid element
              const validResult = this.inspect('${validRef}');
              
              // Test with invalid element
              let invalidResult;
              let errorThrown = false;
              try {
                invalidResult = this.inspect('e99');
              } catch (err) {
                invalidResult = 'ERROR: ' + err.message;
                errorThrown = true;
              }
              
              return {
                validResult: validResult ? 'found' : 'null',
                invalidResult: invalidResult,
                errorThrown: errorThrown,
                elementsMapSize: this.elements.size
              };
            } catch (err) {
              return { error: err.message };
            }
          }`,
            objectId: context.bridgeObjectId,
            returnByValue: true,
          }
        );

        console.log(`   Direct bridge test result:`, result.value);
      } catch (error) {
        console.log(`   Direct bridge test failed: ${error.message}`);
      }
    }

    console.log("\n🎉 Inspect debug completed!");
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
debugInspectFunction()
  .then(() => {
    console.log("\n✨ Inspect debug completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Inspect debug failed:", error);
    process.exit(1);
  });
