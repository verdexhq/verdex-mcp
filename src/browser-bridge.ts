import puppeteer, { Browser, Page } from "puppeteer";

/**
 * Represents information about an interactive element stored in the browser context.
 * This interface ensures type safety for element data stored in the bridge's element map.
 */
interface ElementInfo {
  element: any; // Will be the actual DOM element in browser context
  selector: string; // Best selector for finding this element
  role: string; // ARIA role or semantic role of the element
  name: string; // Accessible name of the element
  attributes: Record<string, string>; // Key attributes like id, class, href, etc.
}

/**
 * Structure of the bridge object injected into browser context.
 * Stores element references and maintains counter for unique IDs.
 */
interface BridgeData {
  elements: Map<string, ElementInfo>; // Map of ref -> element info
  counter: number; // Counter for generating unique element references
}

// Extend Window to include our bridge
declare global {
  interface Window {
    __bridge: BridgeData;
  }
}

interface Snapshot {
  text: string;
  elementCount: number;
}

export class BrowserBridge {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async initialize() {
    // Only create browser if it doesn't exist
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: false,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--start-maximized"],
        defaultViewport: null, // This makes the page use full window size
      });
    }

    // Ensure we have a page
    if (!this.page) {
      const pages = await this.browser.pages();
      this.page = pages[0] || (await this.browser.newPage());
    }

    // Inject our helper code that runs on every page
    await this.page.evaluateOnNewDocument(() => {
      (window as any).__bridge = {
        elements: new Map(),
        counter: 0,
      };
    });

    // Also inject on the current page immediately
    await this.page.evaluate(() => {
      (window as any).__bridge = {
        elements: new Map(),
        counter: 0,
      };
    });
  }

  async navigate(url: string): Promise<Snapshot> {
    if (!this.page) throw new Error("Not initialized");

    await this.page.goto(url, { waitUntil: "networkidle0" });
    return this.snapshot();
  }

  async snapshot(): Promise<Snapshot> {
    if (!this.page) throw new Error("Not initialized");

    // Use Function constructor to avoid compilation issues
    const snapshotCode = `
      (() => {
        // Ensure bridge exists
        if (!window.__bridge) {
          window.__bridge = {
            elements: new Map(),
            counter: 0,
          };
        }
        const bridge = window.__bridge;
        bridge.elements.clear();
        bridge.counter = 0;

        const lines = [];

        // Helper functions
        function getRole(el) {
          const tagName = el.tagName.toLowerCase();
          const type = el.getAttribute("type");

          if (el.hasAttribute("role")) return el.getAttribute("role");

          const roleMap = {
            a: "link",
            button: "button",
            input: type === "submit" || type === "button" ? "button" : "textbox",
            img: "image",
            nav: "navigation",
            main: "main",
            header: "banner",
            footer: "contentinfo",
            aside: "complementary",
            h1: "heading",
            h2: "heading",
            h3: "heading",
            h4: "heading",
            h5: "heading",
            h6: "heading",
            ul: "list",
            ol: "list",
            li: "listitem",
            table: "table",
            form: "form",
            article: "article",
            section: "section",
          };

          return roleMap[tagName] || "generic";
        }

        function getName(el) {
          if (el.getAttribute("aria-label"))
            return el.getAttribute("aria-label");
          if (el.getAttribute("alt")) return el.getAttribute("alt");
          if (el.getAttribute("title")) return el.getAttribute("title");

          if (el.tagName === "INPUT") {
            const placeholder = el.getAttribute("placeholder");
            if (placeholder) return placeholder;

            const id = el.id;
            if (id) {
              const label = document.querySelector('label[for="' + id + '"]');
              if (label) return label.textContent ? label.textContent.trim() : "";
            }
          }

          if (["A", "BUTTON"].includes(el.tagName)) {
            return el.textContent ? el.textContent.trim() : "";
          }

          if (/^H[1-6]$/.test(el.tagName)) {
            return el.textContent ? el.textContent.trim() : "";
          }

          return "";
        }

        function getBestSelector(el) {
          const testId = el.getAttribute("data-testid");
          if (testId) return "data-testid='" + testId + "'";

          if (el.id && !/^[0-9]/.test(el.id) && el.id.length < 50) {
            return "id='" + el.id + "'";
          }

          const ariaLabel = el.getAttribute("aria-label");
          if (ariaLabel) return "aria-label='" + ariaLabel + "'";

          if (el.tagName === "A" && el.getAttribute("href")) {
            const href = el.getAttribute("href");
            if (href && !href.startsWith("javascript:")) {
              return "href='" + href + "'";
            }
          }

          const role = getRole(el);
          const name = getName(el);
          if (role !== "generic" && name) {
            return role + ' "' + name + '"';
          }

          return el.tagName.toLowerCase();
        }

        function shouldInclude(el) {
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden")
            return false;

          if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName)) return false;

          const role = getRole(el);

          if (["link", "button", "textbox", "checkbox", "radio"].includes(role))
            return true;

          if (role === "heading") return true;

          if (el.hasAttribute("role")) return true;

          if (["INPUT", "SELECT", "TEXTAREA", "FORM"].includes(el.tagName))
            return true;

          if (
            [
              "navigation",
              "main",
              "banner",
              "contentinfo",
              "complementary",
            ].includes(role)
          )
            return true;

          if (role === "generic" && ["DIV", "SPAN"].includes(el.tagName)) {
            return (
              el.hasAttribute("data-testid") || el.hasAttribute("aria-label")
            );
          }

          return false;
        }

        function processElement(el, indent) {
          indent = indent || "";
          if (!shouldInclude(el)) {
            Array.from(el.children).forEach(function(child) {
              processElement(child, indent);
            });
            return;
          }

          const role = getRole(el);
          const name = getName(el);
          const selector = getBestSelector(el);

          let line = indent + "- " + role;
          if (name) line += ' "' + name + '"';

          const isInteractive =
            ["link", "button", "textbox", "checkbox", "radio", "select"].includes(
              role
            ) ||
            ["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(el.tagName);

          if (isInteractive) {
            const ref = "e" + (++bridge.counter);
            line += " [ref=" + ref + "]";

            bridge.elements.set(ref, {
              element: el,
              selector: selector,
              role: role,
              name: name,
              attributes: {
                id: el.id,
                class: el.className,
                href: el.getAttribute("href") || "",
                type: el.getAttribute("type") || "",
                "data-testid": el.getAttribute("data-testid") || "",
              },
            });
          }

          lines.push(line);

          Array.from(el.children).forEach(function(child) {
            processElement(child, indent + "  ");
          });
        }

        processElement(document.body);

        return {
          text: lines.join("\\n"),
          elementCount: bridge.elements.size,
        };
      })()
    `;

    return (await this.page.evaluate(snapshotCode)) as Snapshot;
  }

  async click(ref: string): Promise<void> {
    if (!this.page) throw new Error("Not initialized");

    await this.page.evaluate((ref) => {
      const bridge = (window as any).__bridge;
      const info = bridge.elements.get(ref);
      if (!info) throw new Error(`Element ${ref} not found`);

      info.element.click();
    }, ref);

    // Wait a bit for page to update
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  async type(ref: string, text: string): Promise<void> {
    if (!this.page) throw new Error("Not initialized");

    await this.page.evaluate(
      (ref, text) => {
        const bridge = (window as any).__bridge;
        const info = bridge.elements.get(ref);
        if (!info) throw new Error(`Element ${ref} not found`);

        const el = info.element as HTMLInputElement;
        el.focus();
        el.value = text;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      },
      ref,
      text
    );
  }

  async getSelector(ref: string): Promise<string> {
    if (!this.page) throw new Error("Not initialized");

    const result = await this.page.evaluate((ref) => {
      const bridge = (window as any).__bridge;
      const info = bridge.elements.get(ref);
      return info?.selector || "";
    }, ref);

    return result;
  }

  async getElementInfo(ref: string): Promise<ElementInfo | null> {
    if (!this.page) throw new Error("Not initialized");

    return await this.page.evaluate((ref) => {
      const bridge = (window as any).__bridge;
      const info = bridge.elements.get(ref);
      if (!info) return null;

      // Return a copy of the ElementInfo (excluding the actual DOM element for serialization)
      return {
        element: null, // Can't serialize actual DOM elements
        selector: info.selector,
        role: info.role,
        name: info.name,
        attributes: info.attributes,
      };
    }, ref);
  }

  async inspect(ref: string): Promise<
    | (ElementInfo & {
        ref: string;
        tagName: string;
        text: string;
        visible: boolean;
        bounds: { x: number; y: number; width: number; height: number };
      })
    | null
  > {
    if (!this.page) throw new Error("Not initialized");

    return await this.page.evaluate((ref) => {
      const bridge = (window as any).__bridge;
      const info = bridge.elements.get(ref);
      if (!info) return null;

      const el = info.element;
      const rect = el.getBoundingClientRect();

      return {
        ref: ref,
        element: info.element,
        selector: info.selector,
        role: info.role,
        name: info.name,
        attributes: info.attributes,
        tagName: el.tagName,
        text: el.textContent?.trim(),
        visible: rect.width > 0 && rect.height > 0,
        bounds: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
      };
    }, ref);
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}
