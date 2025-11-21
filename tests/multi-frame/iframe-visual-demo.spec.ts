import { test } from "@playwright/test";
import { MultiContextBrowser } from "../../src/runtime/MultiContextBrowser";

test.describe("Iframe Visual Demo", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.initialize();
  });

  test.afterEach(async () => {
    await browser.close();
  });

  test("visual demo: complex nested iframe structure", async () => {
    const html = `
      <h1>Main Page</h1>
      <button>Main Action</button>
      
      <iframe srcdoc="
        <h2>Sidebar</h2>
        <button>Sidebar Button</button>
        <iframe srcdoc='<button>Nested Nav</button>'></iframe>
      "></iframe>
      
      <iframe srcdoc="
        <h2>Content Area</h2>
        <button>Content Button 1</button>
        <button>Content Button 2</button>
      "></iframe>
      
      <footer>
        <iframe srcdoc='<button>Footer Action</button>'></iframe>
      </footer>
    `;

    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();

    console.log("\n" + "=".repeat(60));
    console.log("COMPLEX NESTED IFRAME SNAPSHOT");
    console.log("=".repeat(60));
    console.log(snapshot.text);
    console.log("=".repeat(60));
    console.log(`Total elements: ${snapshot.elementCount}`);
    console.log("=".repeat(60) + "\n");

    // Manual verification:
    // - All content visible?
    // - Proper indentation?
    // - Frame refs correct (f1, f2, f3, f4)?
    // - Nested iframe (f2) properly nested under f1?
  });
});
