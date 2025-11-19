import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../../src/runtime/MultiContextBrowser";

test.describe("Iframe Markers", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.initialize();
  });

  test.afterEach(async () => {
    await browser.close();
  });

  test("iframe appears in snapshot with ref", async () => {
    const html = `
      <button>Main Button</button>
      <iframe id="test" srcdoc="<button>Child</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();

    console.log("Snapshot:", snapshot.text);

    // GATE: Should match "- iframe [ref=e1]" or similar
    expect(snapshot.text).toMatch(/- iframe.*\[ref=e\d+\]/);

    // Extract ref to verify it was assigned
    const iframeRef = snapshot.text.match(/- iframe.*\[ref=(e\d+)\]/)?.[1];
    expect(iframeRef).toBeDefined();
    console.log(`✓ Iframe has ref: ${iframeRef}`);
  });

  test("excludes hidden iframes", async () => {
    const html = `
      <button>Visible Button</button>
      <iframe style="display:none" srcdoc="<button>Hidden</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();

    // Visible content should be present
    expect(snapshot.text).toContain("Visible Button");

    // Hidden iframe should NOT appear
    expect(snapshot.text).not.toMatch(/iframe.*Hidden/);
    console.log("✓ Hidden iframes are filtered");
  });
});
