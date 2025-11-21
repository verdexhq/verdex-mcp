import { test, expect } from "@playwright/test";
import { MultiContextBrowser } from "../../src/runtime/MultiContextBrowser";

test.describe("Interaction Routing", () => {
  let browser: MultiContextBrowser;

  test.beforeEach(async () => {
    browser = new MultiContextBrowser();
    await browser.initialize();
  });

  test.afterEach(async () => {
    await browser.close();
  });

  test("parseRef resolves main frame refs", async () => {
    const html = `<button id="main-btn">Main Button</button>`;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();

    const mainRef = snapshot.text.match(/Main Button.*\[ref=(e\d+)\]/)?.[1];
    expect(mainRef).toBeDefined();

    const context = await (browser as any)._roleContexts.get("default");
    const parsed = (browser as any).parseRef(mainRef!, context);

    expect(parsed).toBeDefined();
    expect(parsed.frameId).toBe(context.mainFrameId);
    expect(parsed.localRef).toBe(mainRef);
    console.log(
      `✓ Parsed main ref: ${mainRef} → frameId=${parsed.frameId.slice(
        0,
        8
      )}..., localRef=${parsed.localRef}`
    );
  });

  test("parseRef resolves child frame refs", async () => {
    const html = `
      <iframe srcdoc="<button id='child-btn'>Child Button</button>"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();

    const childRef = snapshot.text.match(
      /Child Button.*\[ref=(f\d+_e\d+)\]/
    )?.[1];
    expect(childRef).toBeDefined();

    const context = await (browser as any)._roleContexts.get("default");
    const parsed = (browser as any).parseRef(childRef!, context);

    expect(parsed).toBeDefined();
    expect(parsed.frameId).not.toBe(context.mainFrameId);
    expect(parsed.localRef).toMatch(/^e\d+$/);
    console.log(
      `✓ Parsed child ref: ${childRef} → frameId=${parsed.frameId.slice(
        0,
        8
      )}..., localRef=${parsed.localRef}`
    );
  });

  test("parseRef throws clear error for invalid ref", async () => {
    const html = `<button>Test</button>`;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    await browser.snapshot();

    const context = await (browser as any)._roleContexts.get("default");

    expect(() => {
      (browser as any).parseRef("invalid_ref", context);
    }).toThrow(/Unknown element reference.*stale.*snapshot/i);

    console.log("✓ Invalid ref throws clear error");
  });

  test("parseRef works after navigate (which auto-snapshots)", async () => {
    const html = `<button>Test</button>`;
    // navigate() automatically calls snapshot(), so refIndex is populated
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);

    const context = await (browser as any)._roleContexts.get("default");

    // RefIndex should exist because navigate() calls snapshot()
    expect(context.refIndex).toBeDefined();
    expect(context.refIndex.size).toBeGreaterThan(0);

    // parseRef should work with refs from the auto-snapshot
    const parsed = (browser as any).parseRef("e1", context);
    expect(parsed).toBeDefined();
    expect(parsed.frameId).toBe(context.mainFrameId);

    console.log("✓ RefIndex populated by navigate()'s auto-snapshot");
  });

  test("clicks button in main frame", async () => {
    const html = `
      <button id="test-btn" onclick="window.clicked = true">Click Me</button>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();

    const btnRef = snapshot.text.match(/Click Me.*\[ref=(e\d+)\]/)?.[1];
    expect(btnRef).toBeDefined();
    console.log(`Found button ref: ${btnRef}`);

    // Click it
    await browser.click(btnRef!);

    // Verify side effect
    const context = await (browser as any)._roleContexts.get("default");
    const clicked = await context.page.evaluate(() => (window as any).clicked);

    expect(clicked).toBe(true);
    console.log("✓ Clicked button in main frame");
  });

  test("clicks button inside iframe using frame-qualified ref", async () => {
    const html = `
      <button id="main-btn">Main Button</button>
      <iframe srcdoc="
        <button id='iframe-btn' onclick='window.clicked = true'>Iframe Button</button>
      "></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();

    console.log("\n=== SNAPSHOT ===");
    console.log(snapshot.text);
    console.log("================\n");

    // Find iframe button ref (frame-qualified)
    const iframeRef = snapshot.text.match(
      /Iframe Button.*\[ref=(f\d+_e\d+)\]/
    )?.[1];
    expect(iframeRef).toBeDefined();
    console.log(`Found iframe button ref: ${iframeRef}`);

    // Click it (should route to child frame)
    await browser.click(iframeRef!);

    // Verify side effect in iframe
    const context = await (browser as any)._roleContexts.get("default");
    const clicked = await context.page.evaluate(() => {
      const iframe = document.querySelector("iframe") as HTMLIFrameElement;
      return (iframe.contentWindow as any)?.clicked === true;
    });

    expect(clicked).toBe(true);
    console.log("✓ Clicked button in iframe using frame-qualified ref");
  });

  test("types into input in main frame", async () => {
    const html = `<input type="text" id="test-input" />`;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();

    const inputRef = snapshot.text.match(/textbox.*\[ref=(e\d+)\]/)?.[1];
    expect(inputRef).toBeDefined();

    await browser.type(inputRef!, "Hello World");

    // Verify value
    const context = await (browser as any)._roleContexts.get("default");
    const value = await context.page.evaluate(
      () => (document.getElementById("test-input") as HTMLInputElement)?.value
    );

    expect(value).toBe("Hello World");
    console.log("✓ Typed into input in main frame");
  });

  test("types into input inside iframe", async () => {
    const html = `
      <iframe srcdoc="<input type='text' id='iframe-input' />"></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();

    console.log("\n=== SNAPSHOT ===");
    console.log(snapshot.text);
    console.log("================\n");

    // Find iframe input ref (frame-qualified)
    const inputRef = snapshot.text.match(/textbox.*\[ref=(f\d+_e\d+)\]/)?.[1];
    expect(inputRef).toBeDefined();
    console.log(`Found iframe input ref: ${inputRef}`);

    // Type into it (should route to child frame)
    await browser.type(inputRef!, "Hello from iframe");

    // Verify value in iframe
    const context = await (browser as any)._roleContexts.get("default");
    const value = await context.page.evaluate(() => {
      const iframe = document.querySelector("iframe") as HTMLIFrameElement;
      const input = iframe.contentDocument?.getElementById(
        "iframe-input"
      ) as HTMLInputElement;
      return input?.value;
    });

    expect(value).toBe("Hello from iframe");
    console.log("✓ Typed into input in iframe");
  });

  test("resolve_container works in main frame", async () => {
    const html = `
      <div id="container">
        <button id="btn">Test</button>
      </div>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();

    const btnRef = snapshot.text.match(/button Test.*\[ref=(e\d+)\]/)?.[1];
    expect(btnRef).toBeDefined();

    const result = await browser.resolve_container(btnRef!);

    expect(result.target.tagName.toLowerCase()).toBe("button");
    expect(result.ancestors[0].attributes.id).toBe("container");
    console.log("✓ resolve_container works in main frame");
  });

  test("resolve_container works inside iframe", async () => {
    const html = `
      <iframe srcdoc="
        <div id='iframe-container'>
          <button id='iframe-btn'>Iframe Button</button>
        </div>
      "></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();

    const btnRef = snapshot.text.match(
      /Iframe Button.*\[ref=(f\d+_e\d+)\]/
    )?.[1];
    expect(btnRef).toBeDefined();
    console.log(`Found iframe button ref: ${btnRef}`);

    const result = await browser.resolve_container(btnRef!);

    expect(result.target.tagName.toLowerCase()).toBe("button");
    expect(result.ancestors[0].attributes.id).toBe("iframe-container");
    console.log("✓ resolve_container works in iframe");
  });

  test("inspect_pattern works inside iframe", async () => {
    const html = `
      <iframe srcdoc="
        <ul>
          <li><button>Item 1</button></li>
          <li><button>Item 2</button></li>
          <li><button>Item 3</button></li>
        </ul>
      "></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();

    console.log("\n=== SNAPSHOT ===");
    console.log(snapshot.text);
    console.log("================\n");

    const itemRef = snapshot.text.match(/Item 2.*\[ref=(f\d+_e\d+)\]/)?.[1];
    expect(itemRef).toBeDefined();

    const result = await browser.inspect_pattern(itemRef!, 1);

    expect(result).toBeDefined();
    expect(result.siblings).toBeDefined();
    expect(result.siblings.length).toBeGreaterThan(0);
    console.log("✓ inspect_pattern works in iframe");
  });

  test("extract_anchors works inside iframe", async () => {
    const html = `
      <iframe srcdoc="
        <div id='parent'>
          <button id='btn1'>Child Button</button>
          <a href='#' id='link1'>Child Link</a>
        </div>
      "></iframe>
    `;
    await browser.navigate(`data:text/html,${encodeURIComponent(html)}`);
    const snapshot = await browser.snapshot();

    console.log("\n=== SNAPSHOT ===");
    console.log(snapshot.text);
    console.log("================\n");

    // Use button ref as the anchor point instead of div
    const btnRef = snapshot.text.match(
      /Child Button.*\[ref=(f\d+_e\d+)\]/
    )?.[1];
    expect(btnRef).toBeDefined();

    const result = await browser.extract_anchors(btnRef!, 1);

    expect(result).toBeDefined();
    // extract_anchors returns an object/array of anchors
    const anchors = Array.isArray(result) ? result : [result];
    expect(anchors.length).toBeGreaterThan(0);
    console.log(
      `✓ extract_anchors works in iframe (found ${anchors.length} anchors)`
    );
  });

  test("throws clear error for stale refs after navigation", async () => {
    // Page 1 has an iframe with frame-qualified refs
    const html1 = `<iframe srcdoc="<button>Iframe Button</button>"></iframe>`;
    // Page 2 has no iframe, so frame-qualified refs won't exist
    const html2 = `<button>Main Button Only</button>`;

    await browser.navigate(`data:text/html,${encodeURIComponent(html1)}`);
    const snapshot1 = await browser.snapshot();

    // Get a frame-qualified ref from first page (f1_e1)
    const oldRef = snapshot1.text.match(/\[ref=(f1_e\d+)\]/)?.[1];
    expect(oldRef).toBeDefined();
    expect(oldRef).toMatch(/^f1_/);
    console.log(`Got frame-qualified ref from first page: ${oldRef}`);

    // Navigate to page without iframes
    await browser.navigate(`data:text/html,${encodeURIComponent(html2)}`);
    const snapshot2 = await browser.snapshot();

    // Verify no frame-qualified refs in new snapshot
    expect(snapshot2.text).not.toMatch(/\[ref=f\d+_/);
    console.log("New page has no frame-qualified refs");

    // Try to use old frame-qualified ref - should fail
    await expect(browser.click(oldRef!)).rejects.toThrow(
      /Unknown element reference.*stale.*snapshot/i
    );

    console.log("✓ Stale ref throws clear error");
  });
});
