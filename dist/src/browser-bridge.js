import puppeteer from "puppeteer";
// Snapshot function as string to be executed in browser context
const createSnapshotScript = `
function createSnapshot() {
  console.log("Starting snapshot...");
  try {
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
    console.log("Bridge initialized");

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
      if (el.getAttribute("aria-label")) return el.getAttribute("aria-label");
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

      const id = el.id;
      if (id && !/^[0-9]/.test(id) && id.length < 50) {
        return "id='" + id + "'";
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
        return el.hasAttribute("data-testid") || el.hasAttribute("aria-label");
      }

      return false;
    }

    function getAttributes(el) {
      const attrs = {};
      for (let i = 0; i < el.attributes.length; i++) {
        const attr = el.attributes[i];
        attrs[attr.name] = attr.value;
      }
      return attrs;
    }

    function getSiblingIndex(el) {
      const siblings = Array.from(el.parentNode ? el.parentNode.children : []);
      return siblings.indexOf(el);
    }

    function processElement(el, indent, lastInteractiveRef, depth) {
      if (typeof indent === "undefined") indent = "";
      if (typeof lastInteractiveRef === "undefined") lastInteractiveRef = null;
      if (typeof depth === "undefined") depth = 0;
      
      console.log("Processing element:", el.tagName, "depth:", depth);

      // Prevent infinite recursion
      if (depth > 50) {
        console.warn("Max depth reached for element:", el);
        return;
      }

      if (!shouldInclude(el)) {
        console.log(
          "Element not included, processing children with lastInteractiveRef:",
          lastInteractiveRef
        );
        Array.from(el.children).forEach(function (child) {
          processElement(child, indent, lastInteractiveRef, depth + 1);
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

      let currentRef = lastInteractiveRef; // Default to parent's ref

      if (isInteractive) {
        const ref = "e" + ++bridge.counter;
        line += " [ref=" + ref + "]";
        currentRef = ref; // This element becomes the new reference

        bridge.elements.set(ref, {
          element: el,
          tagName: el.tagName,
          role: role,
          name: name,
          selector: selector,
          attributes: getAttributes(el),
          siblingIndex: getSiblingIndex(el),
          parentRef: lastInteractiveRef, // Use the last interactive parent
        });
      }

      lines.push(line);

      // Defensive check for currentRef
      if (typeof currentRef === "undefined") {
        currentRef = lastInteractiveRef;
      }
      console.log("About to process children, currentRef:", currentRef);

      Array.from(el.children).forEach(function (child) {
        processElement(child, indent + "  ", currentRef, depth + 1);
      });
    }

    processElement(document.body, "", null, 0);

    return {
      text: lines.join("\\n"),
      elementCount: bridge.elements.size,
    };
  } catch (error) {
    console.error("Snapshot error:", error);
    console.error("Stack trace:", error.stack);
    return {
      text: "Error: " + error.message + " at " + error.stack,
      elementCount: 0,
    };
  }
}

// Call and return the result of createSnapshot
createSnapshot();
`;
export class BrowserBridge {
    browser = null;
    page = null;
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
            window.__bridge = {
                elements: new Map(),
                counter: 0,
            };
        });
        // Also inject on the current page immediately
        await this.page.evaluate(() => {
            window.__bridge = {
                elements: new Map(),
                counter: 0,
            };
        });
    }
    async navigate(url) {
        if (!this.page)
            throw new Error("Not initialized");
        await this.page.goto(url, { waitUntil: "networkidle0" });
        return this.snapshot();
    }
    async snapshot() {
        if (!this.page)
            throw new Error("Not initialized");
        // Execute the snapshot script as a string
        return (await this.page.evaluate(createSnapshotScript));
    }
    async click(ref) {
        if (!this.page)
            throw new Error("Not initialized");
        await this.page.evaluate((ref) => {
            const bridge = window.__bridge;
            const info = bridge.elements.get(ref);
            if (!info)
                throw new Error(`Element ${ref} not found`);
            info.element.click();
        }, ref);
        // Wait a bit for page to update
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    async type(ref, text) {
        if (!this.page)
            throw new Error("Not initialized");
        await this.page.evaluate((ref, text) => {
            const bridge = window.__bridge;
            const info = bridge.elements.get(ref);
            if (!info)
                throw new Error(`Element ${ref} not found`);
            const el = info.element;
            el.focus();
            el.value = text;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
        }, ref, text);
    }
    async getSelector(ref) {
        if (!this.page)
            throw new Error("Not initialized");
        const result = await this.page.evaluate((ref) => {
            const bridge = window.__bridge;
            const info = bridge.elements.get(ref);
            return info?.selector || "";
        }, ref);
        return result;
    }
    async getElementInfo(ref) {
        if (!this.page)
            throw new Error("Not initialized");
        return await this.page.evaluate((ref) => {
            const bridge = window.__bridge;
            const info = bridge.elements.get(ref);
            if (!info)
                return null;
            // Return a copy of the ElementInfo (excluding the actual DOM element for serialization)
            return {
                element: null, // Can't serialize actual DOM elements
                tagName: info.tagName,
                role: info.role,
                name: info.name,
                selector: info.selector,
                attributes: info.attributes,
                siblingIndex: info.siblingIndex,
                parentRef: info.parentRef,
            };
        }, ref);
    }
    async inspect(ref) {
        if (!this.page)
            throw new Error("Not initialized");
        return await this.page.evaluate((ref) => {
            const bridge = window.__bridge;
            const info = bridge.elements.get(ref);
            if (!info)
                return null;
            const el = info.element;
            const rect = el.getBoundingClientRect();
            return {
                ref: ref,
                element: info.element,
                tagName: info.tagName,
                role: info.role,
                name: info.name,
                selector: info.selector,
                attributes: info.attributes,
                siblingIndex: info.siblingIndex,
                parentRef: info.parentRef,
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
    async explore(ref) {
        if (!this.page)
            throw new Error("Not initialized");
        return await this.page.evaluate((ref) => {
            const bridge = window.__bridge;
            const info = bridge.elements.get(ref);
            if (!info)
                return null;
            return {
                target: {
                    ref: ref,
                    tagName: info.tagName,
                    role: info.role,
                    name: info.name,
                    selector: info.selector,
                    attributes: info.attributes,
                    siblingIndex: info.siblingIndex,
                    parentRef: info.parentRef,
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
