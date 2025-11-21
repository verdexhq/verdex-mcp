/**
 * Manual demonstration of improved error formatting.
 * Run this to see how errors are now formatted for LLMs.
 */
import { test } from "@playwright/test";
import { MultiContextBrowser } from "../../src/runtime/MultiContextBrowser.js";

test("Demo: Error messages are now LLM-friendly", async () => {
  const browser = new MultiContextBrowser();
  await browser.initialize();

  try {
    console.log("\n" + "=".repeat(80));
    console.log("ERROR FORMATTING DEMONSTRATION");
    console.log("=".repeat(80) + "\n");

    // Navigate to a test page
    await browser.navigate(
      "data:text/html,<button id='btn1'>Click me</button>"
    );
    const snapshot1 = await browser.snapshot();
    console.log("✅ Initial snapshot taken\n");

    // Demo 1: Unknown Ref Error
    console.log("📋 Demo 1: Unknown Reference Error");
    console.log("-".repeat(80));
    try {
      await browser.click("e999");
    } catch (error: any) {
      console.log(error.message);
      console.log();
    }

    // Demo 2: Stale Ref Error
    console.log("📋 Demo 2: Stale Reference Error");
    console.log("-".repeat(80));
    // Navigate away to make refs stale
    await browser.navigate("data:text/html,<div>Different page</div>");
    try {
      // Try to use old ref from first page
      await browser.click("e1");
    } catch (error: any) {
      console.log(error.message);
      console.log();
    }

    // Demo 3: Frame Detached Error (simulated via message)
    console.log("📋 Demo 3: Frame Detached Error");
    console.log("-".repeat(80));
    console.log(
      "(This would show when an iframe is removed during operation)\n"
    );
    console.log("❌ Frame Detached\n");
    console.log("Frame ID: frame-abc123\n");
    console.log("An iframe was removed or navigated during the operation.\n");
    console.log("This is often normal during:");
    console.log("• Navigation between pages");
    console.log("• Single-page app (SPA) route changes");
    console.log("• Dynamic iframe removal by JavaScript\n");
    console.log("🔧 Action Required:");
    console.log(
      "Call browser_snapshot() to see the current page structure and available frames.\n"
    );

    console.log("=".repeat(80));
    console.log("✅ All error messages now include:");
    console.log("   • Clear title with emoji");
    console.log("   • Detailed context (ref, frameId, URL, etc.)");
    console.log("   • Explanation of what went wrong");
    console.log("   • Actionable recovery instructions");
    console.log("=".repeat(80) + "\n");
  } finally {
    await browser.close();
  }
});
