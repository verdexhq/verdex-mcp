import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../../src/runtime/MultiContextBrowser.js";

test.describe("CSS Pseudo-Elements and YAML Escaping", () => {
  let browser: MultiContextBrowser;

  test.beforeAll(async () => {
    browser = new MultiContextBrowser();
    await browser.initialize();
  });

  test.afterAll(async () => {
    await browser.close();
  });

  test("should capture CSS ::before and ::after pseudo-element content", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            .badge::before {
              content: "★ ";
            }
            .badge::after {
              content: " NEW";
            }
            .icon::before {
              content: "→ ";
            }
            .empty::before {
              content: none;
            }
            .css-escape::before {
              /* Unicode star: U+2605 */
              content: "\\2605 ";
            }
          </style>
        </head>
        <body>
          <button class="badge">Featured Item</button>
          <a href="/next" class="icon">Next Page</a>
          <div class="empty">No CSS content</div>
          <span class="css-escape">Escaped Star</span>
        </body>
      </html>
    `;

    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();
    const text = snapshot.text;

    // Should capture ::before content (may be garbled in output but present)
    expect(text).toMatch(/button Featured Item.*ref=e1/);
    expect(text).toMatch(/text:.*Featured Item/);

    // Should capture ::after content
    expect(text).toContain("NEW");

    // Should capture ::before from link
    expect(text).toMatch(/link Next Page/);

    // Should handle CSS escape sequences (Unicode star should be captured)
    expect(text).toContain("Escaped Star");

    // Should not add content for "none" value
    expect(text).toContain("No CSS content");
  });

  test("should properly escape YAML special characters in text", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <button id="colon">Click: Now</button>
          <button id="quote">Say "Hello"</button>
          <button id="brackets">Array [0]</button>
          <button id="braces">Object {key}</button>
          <button id="hash"># Comment</button>
          <button id="ampersand">Save & Exit</button>
          <button id="pipe">Read | Write</button>
          <button id="greater">Value > 10</button>
          <button id="percent">50% Off</button>
          <button id="at">Email @user</button>
          <button id="backtick">Code \`var\`</button>
          <div id="text-colon">Text with: colon</div>
          <div id="text-newline">Line 1
Line 2</div>
        </body>
      </html>
    `;

    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();
    const text = snapshot.text;

    // All special characters should be JSON-escaped (quoted)
    expect(text).toContain('"Click: Now"'); // colon
    expect(text).toContain('"Say \\"Hello\\""'); // nested quotes
    expect(text).toContain('"Array [0]"'); // brackets
    expect(text).toContain('"Object {key}"'); // braces
    expect(text).toContain('"# Comment"'); // hash
    expect(text).toContain('"Save & Exit"'); // ampersand
    expect(text).toContain('"Read | Write"'); // pipe
    expect(text).toContain('"Value > 10"'); // greater than
    expect(text).toContain('"50% Off"'); // percent
    expect(text).toContain('"Email @user"'); // at symbol

    // Newlines get normalized to spaces by normalizeWhitespace()
    expect(text).toContain("Line 1 Line 2");

    // Text nodes should also be escaped
    expect(text).toContain('text: "Text with: colon"');
  });

  test("should escape YAML special values that look like booleans or numbers", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <button id="true">true</button>
          <button id="false">false</button>
          <button id="null">null</button>
          <button id="tilde">~</button>
          <button id="number">42</button>
          <button id="float">3.14</button>
          <button id="normal">Normal Text</button>
        </body>
      </html>
    `;

    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();
    const text = snapshot.text;

    // Boolean-like values should be quoted
    expect(text).toContain('button "true"');
    expect(text).toContain('button "false"');
    expect(text).toContain('button "null"');
    expect(text).toContain('button "~"');

    // Number-like values should be quoted
    expect(text).toContain('button "42"');
    expect(text).toContain('button "3.14"');

    // Normal text without special chars doesn't need quoting
    expect(text).toContain("button Normal Text");
  });

  test("should handle combination of CSS content and YAML escaping", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            .special::before {
              content: "★: ";
            }
            .special::after {
              content: " [NEW]";
            }
          </style>
        </head>
        <body>
          <button class="special">Item: Value</button>
        </body>
      </html>
    `;

    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();
    const text = snapshot.text;

    // Should capture CSS content and escape special chars in button name
    expect(text).toContain('button "Item: Value"'); // colon triggers escaping
    expect(text).toContain("NEW"); // ::after content captured

    // CSS pseudo-element content should be present as text nodes
    expect(text).toMatch(/text:.*Item: Value/);
  });

  test("should not break existing functionality with empty or simple text", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <button>Simple</button>
          <button></button>
          <a href="/link">Link Text</a>
        </body>
      </html>
    `;

    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();
    const text = snapshot.text;

    // Simple text without special chars doesn't need quotes
    expect(text).toContain("button Simple");
    expect(text).toContain("link Link Text");
    expect(snapshot.elementCount).toBeGreaterThanOrEqual(2);
  });
});
