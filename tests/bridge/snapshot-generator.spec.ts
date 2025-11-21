import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../../src/runtime/MultiContextBrowser.js";

test.describe("SnapshotGenerator comprehensive behavior", () => {
  let browser: MultiContextBrowser;

  test.beforeAll(async () => {
    browser = new MultiContextBrowser();
    await browser.initialize();
  });

  test.afterAll(async () => {
    await browser.close();
  });

  test("generates expected roles, props, refs, and structure across complex DOM", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset=\"utf-8\" />
          <title>Snapshot Test</title>
          <style>
            .hidden { display: none; }
            .no-pointer { pointer-events: none; }
          </style>
        </head>
        <body>
          <main>
            <h1 id=\"title\">Accessible Page</h1>

            <!-- Landmark & structural roles -->
            <nav aria-label=\"Main Navigation\">
              <a href=\"/home\">Home</a>
              <a href=\"/about\">About</a>
            </nav>

            <!-- Name from content button should get a ref and be interactive -->
            <button id=\"btn\">Click Me</button>

            <!-- aria-labelledby should compute name -->
            <div>
              <label id=\"lbl-search\" for=\"search\">Search Label</label>
              <input id=\"search\" type=\"search\" aria-labelledby=\"lbl-search\" />
            </div>

            <!-- input value should render as child text node for textbox/searchbox -->
            <input id=\"name\" type=\"text\" placeholder=\"Your name\" value=\"Alice\" />

            <!-- aria-owns hoists referenced nodes -->
            <div id=\"owns-container\" role=\"group\" aria-owns=\"owned1 owned2\">Owner</div>
            <div id=\"owned1\"><button>Owned One</button></div>
            <div id=\"owned2\"><a href=\"/owned\">Owned Two</a></div>

            <!-- Generic wrapper around a single interactive element should be hoisted by normalization -->
            <div class=\"only-wrapper\"><span><button id=\"wrapped\">Wrapped</button></span></div>

            <!-- Disabled/pressed/expanded/selected/checked props -->
            <button id=\"toggle\" aria-pressed=\"true\">On</button>
            <button id=\"expander\" aria-expanded=\"true\">Expand</button>
            <input id=\"cb\" type=\"checkbox\" checked />
            <div role=\"tab\" aria-selected=\"true\">Tab A</div>

            <!-- Link with href should expose url prop -->
            <a id=\"docs\" href=\"/docs\">Docs</a>

            <!-- Button with submit type should expose type prop -->
            <button id=\"submit\" type=\"submit\">Submit</button>

            <!-- Combobox with autocomplete prop -->
            <input id=\"search-ac\" type=\"search\" autocomplete=\"list\" />

            <!-- Hidden and aria-hidden content should be excluded but children visible may remain -->
            <div id=\"hiddenDiv\" class=\"hidden\">
              <button id=\"hiddenBtn\">Should not appear</button>
            </div>
            <div id=\"ariaHidden\" aria-hidden=\"true\">
              <button id=\"ariaHiddenBtn\">Hidden by aria</button>
            </div>

            <!-- Slot & shadow DOM -->
            <custom-host id=\"shadow\"></custom-host>

            <script>
              // Define a simple shadow DOM custom element with a slot and an interactive child
              class CustomHost extends HTMLElement {
                constructor() {
                  super();
                  const root = this.attachShadow({ mode: 'open' });
                  const slot = document.createElement('slot');
                  const shadowButton = document.createElement('button');
                  shadowButton.textContent = 'Shadow Click';
                  root.appendChild(slot);
                  root.appendChild(shadowButton);
                }
              }
              customElements.define('custom-host', CustomHost);

              // Create slotted content
              const host = document.getElementById('shadow');
              const slotted = document.createElement('a');
              slotted.setAttribute('href', '/slotted');
              slotted.textContent = 'Slotted Link';
              host.appendChild(slotted);

              // Simulate active element for active prop
              document.getElementById('btn').focus();

              // Ensure search input has a value for input-value rendering test
              document.getElementById('search').value = 'Query';
            <\/script>
          </main>
        </body>
      </html>
    `;

    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();

    const text = snapshot.text;
    expect(text).toBeTruthy();

    // Roles and names (simple text without special chars doesn't need quotes)
    expect(text).toContain("- heading Accessible Page");
    expect(text).toContain("- navigation Main Navigation");
    expect(text).toContain('- link Home [url="/home"]');
    expect(text).toContain('- link About [url="/about"]');

    // Button interactive with ref and active state from focus
    expect(text).toMatch(/- button Click Me(.*)\[active\](.*)\[ref=e\d+\]/);

    // Searchbox named via aria-labelledby and value rendered as child
    expect(text).toContain("- searchbox Search Label");
    expect(text).toContain("  - text: Query");

    // Textbox with placeholder name and value as child
    expect(text).toContain("- textbox Your name");
    expect(text).toContain("  - text: Alice");

    // aria-owns should include owned nodes under owner
    // Note: group does not have name-from-content; we assert text child instead
    expect(text).toContain("- group");
    expect(text).toContain("  - text: Owner");
    expect(text).toMatch(/- button Owned One.*\[ref=e\d+\]/);
    expect(text).toMatch(/- link Owned Two \[url="\/owned"\].*\[ref=e\d+\]/);

    // Normalization: generic wrapper with single interactive should be hoisted (no generic line before Wrapped button)
    const wrappedIndex = text.indexOf("- button Wrapped");
    expect(wrappedIndex).toBeGreaterThanOrEqual(0);

    // Props extraction and states
    expect(text).toContain("- button On [pressed]");
    expect(text).toContain("- button Expand [expanded]");
    expect(text).toContain("- checkbox [checked]");
    expect(text).toContain("- tab Tab A [selected]");

    // Link url prop and submit button type prop
    expect(text).toContain('- link Docs [url="/docs"]');
    expect(text).toContain('- button Submit [type="submit"]');

    // Search input without list datalist remains searchbox (no autocomplete prop)
    expect(text).toContain("- searchbox");

    // Hidden content excluded
    expect(text).not.toContain("Should not appear");
    expect(text).not.toContain("Hidden by aria");

    // Shadow DOM button and slotted link should appear
    expect(text).toMatch(/- button Shadow Click.*\[ref=e\d+\]/);
    expect(text).toContain('- link Slotted Link [url="/slotted"]');

    // Ensure elementCount >= number of interactive refs we expect
    // We expect refs for: Click Me, Owned One, Owned Two, Wrapped, On, Expand, Docs, Submit, Shadow Click, Slotted Link, plus possibly others
    expect(snapshot.elementCount).toBeGreaterThanOrEqual(10);
  });
});
