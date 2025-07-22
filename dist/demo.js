import { BrowserBridge } from "./browser-bridge";
async function demo() {
    const bridge = new BrowserBridge();
    try {
        console.log("Initializing browser...");
        await bridge.initialize();
        console.log("Navigating to Wikipedia...");
        const snapshot = await bridge.navigate("https://en.wikipedia.org");
        console.log("\n=== ACCESSIBILITY SNAPSHOT ===\n");
        console.log(snapshot.text);
        console.log(`\nTotal interactive elements: ${snapshot.elementCount}`);
        // Example: Search for something
        console.log('\n=== DEMO: Searching for "TypeScript" ===\n');
        // Find search box ref from snapshot
        const searchBoxMatch = snapshot.text.match(/textbox.*\[ref=(e\d+)\]/);
        if (searchBoxMatch) {
            const searchRef = searchBoxMatch[1];
            console.log(`Found search box: ${searchRef}`);
            // Inspect it
            const searchInfo = await bridge.inspect(searchRef);
            console.log("Search box info:", searchInfo);
            // Type in it
            console.log('Typing "TypeScript"...');
            await bridge.type(searchRef, "TypeScript");
            // Find search button
            const buttonMatch = snapshot.text.match(/button.*[Ss]earch.*\[ref=(e\d+)\]/);
            if (buttonMatch) {
                const buttonRef = buttonMatch[1];
                console.log(`Found search button: ${buttonRef}`);
                // Get its selector for test generation
                const buttonSelector = await bridge.getSelector(buttonRef);
                console.log(`Button selector for test: ${buttonSelector}`);
                // Click it
                console.log("Clicking search button...");
                await bridge.click(buttonRef);
                // Wait and get new snapshot
                await new Promise((resolve) => setTimeout(resolve, 2000));
                console.log("\n=== NEW PAGE SNAPSHOT ===\n");
                const newSnapshot = await bridge.snapshot();
                console.log(newSnapshot.text.substring(0, 1000) + "...");
            }
        }
        console.log("\n=== EXAMPLE TEST CODE GENERATION ===\n");
        console.log(`// Generated Playwright test
test('Search Wikipedia for TypeScript', async ({ page }) => {
  await page.goto('https://en.wikipedia.org');
  await page.fill('[id="searchInput"]', 'TypeScript');
  await page.click('button:has-text("Search")');
  await expect(page).toHaveURL(/.*TypeScript.*/);
});`);
    }
    catch (error) {
        console.error("Error:", error);
    }
    finally {
        console.log("\nPress Ctrl+C to close browser...");
        // Keep browser open to see results
        await new Promise(() => { });
    }
}
demo();
