#!/usr/bin/env node
import { BrowserBridge } from "./src/browser-bridge.js";
async function testBrowserIssues() {
    console.log("=== Browser Bridge Issue Diagnosis ===\n");
    const bridge = new BrowserBridge();
    try {
        // Test 1: Basic initialization
        console.log("1. Testing browser initialization...");
        await bridge.initialize();
        console.log("✓ Browser initialized successfully\n");
        // Test 2: Navigate to a simple page
        console.log("2. Testing navigation to data URL...");
        const testHTML = `
      <!DOCTYPE html>
      <html>
        <head><title>Test Page</title></head>
        <body>
          <h1>Test Page</h1>
          <button id="test-btn">Click Me</button>
          <input id="test-input" placeholder="Type here" />
        </body>
      </html>
    `;
        const dataUrl = `data:text/html,${encodeURIComponent(testHTML)}`;
        try {
            const snapshot1 = await bridge.navigate(dataUrl);
            console.log("✓ Navigation successful");
            console.log("Elements found:", snapshot1.elementCount);
            console.log("Snapshot preview:", snapshot1.text.substring(0, 200) + "...\n");
        }
        catch (error) {
            console.error("✗ Navigation failed:", error.message);
            console.error("This suggests script injection or serialization issue\n");
        }
        // Test 3: Test snapshot without navigation
        console.log("3. Testing direct snapshot call...");
        try {
            const snapshot2 = await bridge.snapshot();
            console.log("✓ Direct snapshot successful");
            console.log("Elements found:", snapshot2.elementCount, "\n");
        }
        catch (error) {
            console.error("✗ Direct snapshot failed:", error.message);
            console.error("This confirms script injection/serialization issue\n");
        }
        // Test 4: Test bridge object existence in browser
        console.log("4. Testing bridge object in browser context...");
        try {
            const bridgeExists = await bridge.page?.evaluate(() => {
                return typeof window.__bridge !== "undefined";
            });
            console.log("Bridge exists in browser:", bridgeExists);
            if (bridgeExists) {
                const bridgeData = await bridge.page?.evaluate(() => {
                    const bridge = window.__bridge;
                    return {
                        hasElements: bridge.elements instanceof Map,
                        counter: bridge.counter,
                        elementsSize: bridge.elements.size,
                    };
                });
                console.log("Bridge data:", bridgeData, "\n");
            }
        }
        catch (error) {
            console.error("✗ Bridge test failed:", error.message, "\n");
        }
        // Test 5: Test script re-injection after navigation
        console.log("5. Testing script persistence after navigation...");
        try {
            await bridge.navigate("data:text/html,<html><body><h1>Page 2</h1></body></html>");
            const bridgeAfterNav = await bridge.page?.evaluate(() => {
                return typeof window.__bridge !== "undefined";
            });
            console.log("Bridge exists after navigation:", bridgeAfterNav, "\n");
        }
        catch (error) {
            console.error("✗ Navigation persistence test failed:", error.message, "\n");
        }
        // Test 6: Test manual script injection
        console.log("6. Testing manual script injection...");
        try {
            await bridge.page?.evaluate(() => {
                window.__bridge = {
                    elements: new Map(),
                    counter: 0,
                };
                console.log("Manual bridge injection successful");
            });
            // Try a simplified snapshot function
            const manualSnapshot = await bridge.page?.evaluate(() => {
                try {
                    const bridge = window.__bridge;
                    bridge.elements.clear();
                    bridge.counter = 0;
                    const elements = document.querySelectorAll("button, input, a, h1, h2, h3");
                    elements.forEach((el, index) => {
                        const ref = "e" + (index + 1);
                        bridge.elements.set(ref, {
                            element: el,
                            tagName: el.tagName,
                            text: el.textContent || el.getAttribute("placeholder") || "",
                            ref: ref,
                        });
                    });
                    return {
                        text: `Found ${elements.length} elements`,
                        elementCount: bridge.elements.size,
                    };
                }
                catch (error) {
                    return {
                        text: "Error: " + error.message,
                        elementCount: 0,
                    };
                }
            });
            console.log("✓ Manual snapshot result:", manualSnapshot, "\n");
        }
        catch (error) {
            console.error("✗ Manual injection failed:", error.message, "\n");
        }
    }
    catch (error) {
        console.error("Fatal error:", error);
    }
    finally {
        console.log("7. Cleaning up...");
        await bridge.close();
        console.log("✓ Browser closed");
    }
}
testBrowserIssues().catch(console.error);
