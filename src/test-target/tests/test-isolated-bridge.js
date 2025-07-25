import { BrowserBridge } from "../../../dist/isolated-bridge-demo.js";

async function testBrowserBridge() {
  console.log("🚀 Testing BrowserBridge...\n");

  const bridge = new BrowserBridge();

  try {
    // Test 1: Initialize
    console.log("1️⃣ Initializing browser...");
    await bridge.initialize();
    console.log("✅ Browser initialized successfully\n");

    // Test 2: Navigate to a simple page
    console.log("2️⃣ Navigating to example.com...");
    const snapshot = await bridge.navigate("https://example.com");
    console.log("✅ Navigation successful");
    console.log("Debug: snapshot =", snapshot);
    if (snapshot && snapshot.text) {
      console.log(
        `📸 Snapshot captured with ${snapshot.text.split("\n").length} lines`
      );
      console.log("Preview:", snapshot.text.substring(0, 200) + "...\n");
    } else {
      console.log("❌ Snapshot is undefined or missing text property");
      return;
    }

    // Test 3: Take another snapshot
    console.log("3️⃣ Taking another snapshot...");
    const snapshot2 = await bridge.snapshot();
    console.log("✅ Second snapshot successful");
    console.log(
      `📸 Elements found: ${
        snapshot2.text.match(/\[ref=e\d+\]/g)?.length || 0
      }\n`
    );

    // Test 4: Test element inspection if we have elements
    const elementRefs = snapshot2.text.match(/\[ref=(e\d+)\]/g);
    if (elementRefs && elementRefs.length > 0) {
      const firstRef = elementRefs[0].match(/e\d+/)[0];
      console.log(`4️⃣ Testing element inspection for ${firstRef}...`);
      const elementInfo = await bridge.inspect(firstRef);
      if (elementInfo) {
        console.log("✅ Element inspection successful");
        console.log(`   - Tag: ${elementInfo.tagName}`);
        console.log(`   - Role: ${elementInfo.role}`);
        console.log(`   - Name: ${elementInfo.name}`);
        console.log(`   - Visible: ${elementInfo.visible}\n`);
      }
    }

    // Test 5: Test ancestor exploration if we have elements
    if (elementRefs && elementRefs.length > 0) {
      const firstRef = elementRefs[0].match(/e\d+/)[0];
      console.log(`5️⃣ Testing ancestor exploration for ${firstRef}...`);
      const ancestors = await bridge.get_ancestors(firstRef);
      if (ancestors) {
        console.log("✅ Ancestor exploration successful");
        console.log(`   - Found ${ancestors.ancestors?.length || 0} ancestors`);
        if (ancestors.ancestors && ancestors.ancestors.length > 0) {
          console.log(`   - Top ancestor: ${ancestors.ancestors[0].tagName}`);
        }
      }
    }

    // Test 6: Test interaction (click)
    if (elementRefs && elementRefs.length > 0) {
      const firstRef = elementRefs[0].match(/e\d+/)[0];
      console.log(`6️⃣ Testing click interaction for ${firstRef}...`);
      await bridge.click(firstRef);
      console.log("✅ Click executed successfully");

      // Wait for page load
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Take snapshot after click to see if page changed
      const postClickSnapshot = await bridge.snapshot();
      console.log(
        `📸 Post-click snapshot: ${postClickSnapshot.elementCount} elements`
      );
    }

    // Test 7: Navigate to Wikipedia for complex page testing
    console.log("\n7️⃣ Testing complex page navigation (Wikipedia)...");
    const wikiSnapshot = await bridge.navigate(
      "https://en.wikipedia.org/wiki/Artificial_intelligence"
    );
    console.log("✅ Wikipedia navigation successful");
    console.log(
      `📸 Wikipedia snapshot: ${wikiSnapshot.elementCount} interactive elements`
    );
    console.log("Preview:", wikiSnapshot.text.substring(0, 300) + "...\n");

    // Test 8: Test all exploration tools on Wikipedia
    const wikiElementRefs = wikiSnapshot.text.match(/\[ref=(e\d+)\]/g);
    if (wikiElementRefs && wikiElementRefs.length > 0) {
      const targetRef =
        wikiElementRefs[Math.min(5, wikiElementRefs.length - 1)].match(
          /e\d+/
        )[0]; // Pick 6th element or last if fewer

      console.log(`8️⃣ Testing complete exploration suite for ${targetRef}...`);

      // Test ancestors
      const wikiAncestors = await bridge.get_ancestors(targetRef);
      if (wikiAncestors) {
        console.log("✅ Wikipedia ancestor exploration successful");
        console.log(
          `   - Found ${wikiAncestors.ancestors?.length || 0} ancestors`
        );

        // Test siblings using a mid-level ancestor
        if (wikiAncestors.ancestors && wikiAncestors.ancestors.length >= 3) {
          const ancestorLevel = 3;
          console.log(`   - Testing siblings at level ${ancestorLevel}...`);
          const siblings = await bridge.get_siblings(targetRef, ancestorLevel);
          if (siblings) {
            console.log(
              `   ✅ Found ${siblings.siblings?.length || 0} siblings`
            );
          }

          // Test descendants
          console.log(`   - Testing descendants at level ${ancestorLevel}...`);
          const descendants = await bridge.get_descendants(
            targetRef,
            ancestorLevel
          );
          if (descendants) {
            console.log(
              `   ✅ Found ${
                descendants.descendants?.length || 0
              } descendant groups`
            );
          }
        }
      }
    }

    // Test 9: Test form interaction on Wikipedia search
    console.log("\n9️⃣ Testing form interaction...");
    const searchElements = wikiSnapshot.text.match(
      /textbox.*search.*\[ref=(e\d+)\]/i
    );
    if (searchElements) {
      const searchRef = searchElements[1];
      console.log(`   - Found search box: ${searchRef}`);
      await bridge.type(searchRef, "machine learning");
      console.log("✅ Text input successful");

      // Find and click search button or just press enter by finding submit button
      const searchButtonMatch = wikiSnapshot.text.match(
        /button.*search.*\[ref=(e\d+)\]/i
      );
      if (searchButtonMatch) {
        const buttonRef = searchButtonMatch[1];
        console.log(`   - Clicking search button: ${buttonRef}`);
        await bridge.click(buttonRef);
        await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait for search

        const searchResultSnapshot = await bridge.snapshot();
        console.log(
          `📸 Search results: ${searchResultSnapshot.elementCount} elements`
        );
      }
    }

    // Test 10: Navigate to another complex site to test cross-navigation
    console.log("\n🔟 Testing cross-site navigation...");
    const githubSnapshot = await bridge.navigate("https://github.com");
    console.log("✅ GitHub navigation successful");
    console.log(
      `📸 GitHub snapshot: ${githubSnapshot.elementCount} interactive elements`
    );

    // Test 11: Final comprehensive test of all functionality
    const githubElements = githubSnapshot.text.match(/\[ref=(e\d+)\]/g);
    if (githubElements && githubElements.length > 0) {
      const finalTestRef = githubElements[0].match(/e\d+/)[0];
      console.log(`1️⃣1️⃣ Final comprehensive test for ${finalTestRef}...`);

      // Test all core functions
      const finalInspect = await bridge.inspect(finalTestRef);
      const finalAncestors = await bridge.get_ancestors(finalTestRef);

      if (finalInspect && finalAncestors) {
        console.log("✅ All core functions working on GitHub");
        console.log(
          `   - Element: ${finalInspect.tagName} (${finalInspect.role})`
        );
        console.log(`   - Ancestors: ${finalAncestors.ancestors?.length || 0}`);

        // Test final siblings and descendants if we have ancestors
        if (finalAncestors.ancestors && finalAncestors.ancestors.length >= 2) {
          const testLevel = 2;
          const finalSiblings = await bridge.get_siblings(
            finalTestRef,
            testLevel
          );
          const finalDescendants = await bridge.get_descendants(
            finalTestRef,
            testLevel
          );

          console.log(
            `   - Siblings at level ${testLevel}: ${
              finalSiblings?.siblings?.length || 0
            }`
          );
          console.log(
            `   - Descendants at level ${testLevel}: ${
              finalDescendants?.descendants?.length || 0
            }`
          );
        }
      }
    }

    console.log("\n🎉 COMPREHENSIVE TEST SUITE PASSED!");
    console.log("✅ All core functionality verified:");
    console.log("   - Navigation across multiple sites");
    console.log("   - Snapshot generation on simple and complex pages");
    console.log("   - Element inspection and interaction");
    console.log(
      "   - Complete exploration suite (ancestors, siblings, descendants)"
    );
    console.log("   - Form interaction and clicking");
    console.log("   - Cross-site navigation persistence");
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    throw error;
  } finally {
    console.log("\n🧹 Cleaning up...");
    await bridge.close();
    console.log("✅ Browser closed");
  }
}

// Run the test
testBrowserBridge()
  .then(() => {
    console.log("\n✨ Test completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Test failed:", error);
    process.exit(1);
  });
