import puppeteer, { Browser, Page } from "puppeteer";
import { Snapshot, ElementInfo } from "./types.js";

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

// =============================================================================
// EXPLORATION HELPER FUNCTIONS
// =============================================================================

/**
 * Helper function to extract only relevant attributes from a DOM element.
 * Returns an Attributes object with only the most useful attributes for identification.
 */
const getRelevantAttributesScript = `
function getRelevantAttributes(element) {
  const relevant = ['class', 'id', 'data-testid', 'role', 'aria-label'];
  const attrs = {};
  
  relevant.forEach(attrName => {
    const value = element.getAttribute(attrName);
    if (value) {
      attrs[attrName] = value;
    }
  });
  
  return attrs;
}
`;

/**
 * Helper function to find all interactive element refs contained within a container element.
 * Uses the bridge's elements map to determine which refs are contained within the given container.
 */
const findContainedRefsScript = `
function findContainedRefs(container) {
  const bridge = window.__bridge;
  const refs = [];
  
  bridge.elements.forEach((info, refId) => {
    if (container.contains(info.element) && info.element !== container) {
      refs.push(refId);
    }
  });
  
  return refs;
}
`;

/**
 * Helper function to extract meaningful text content from an element.
 * Focuses on headings, buttons, links, and other semantically important text.
 * Returns an array of unique text strings found within the element.
 */
const extractMeaningfulTextsScript = `
function extractMeaningfulTexts(element) {
  const texts = [];
  
  // Create a tree walker to find meaningful text content
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent && node.textContent.trim();
          if (text && text.length > 0) {
            return NodeFilter.FILTER_ACCEPT;
          }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node;
          // Include text from semantically meaningful elements
          if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BUTTON', 'A', 'LABEL'].includes(el.tagName)) {
            return NodeFilter.FILTER_ACCEPT;
          }
        }
        return NodeFilter.FILTER_SKIP;
      }
    }
  );
  
  let node;
  while (node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent && node.textContent.trim();
      if (text && text.length > 0) {
        texts.push(text);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const text = node.textContent && node.textContent.trim();
      if (text && text.length > 0) {
        texts.push(text);
      }
    }
  }
  
  // Deduplicate while preserving order and filter out very short/common words
  const uniqueTexts = [...new Set(texts)].filter(text => 
    text.length > 1 && // Longer than 1 character
    !/^\\s*$/.test(text) // Not just whitespace
  );
  
  return uniqueTexts;
}
`;

/**
 * Combined helper scripts that can be injected into page context.
 * This includes all the helper functions needed for exploration methods.
 * Functions are attached to window.__explorationHelpers for easy access.
 */
const explorationHelpersScript = `
  // Initialize helpers namespace
  if (!window.__explorationHelpers) {
    window.__explorationHelpers = {};
  }
  
  // getRelevantAttributes function
  window.__explorationHelpers.getRelevantAttributes = function(element) {
    const relevant = ['class', 'id', 'data-testid', 'role', 'aria-label'];
    const attrs = {};
    
    relevant.forEach(attrName => {
      const value = element.getAttribute(attrName);
      if (value) {
        attrs[attrName] = value;
      }
    });
    
    return attrs;
  };
  
  // findContainedRefs function
  window.__explorationHelpers.findContainedRefs = function(container) {
    const bridge = window.__bridge;
    const refs = [];
    
    bridge.elements.forEach((info, refId) => {
      if (container.contains(info.element) && info.element !== container) {
        refs.push(refId);
      }
    });
    
    return refs;
  };
  
  // extractMeaningfulTexts function
  window.__explorationHelpers.extractMeaningfulTexts = function(element) {
    const texts = [];
    
    // Create a tree walker to find meaningful text content
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent && node.textContent.trim();
            if (text && text.length > 0) {
              return NodeFilter.FILTER_ACCEPT;
            }
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node;
            // Include text from semantically meaningful elements
            if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BUTTON', 'A', 'LABEL'].includes(el.tagName)) {
              return NodeFilter.FILTER_ACCEPT;
            }
          }
          return NodeFilter.FILTER_SKIP;
        }
      }
    );
    
    let node;
    while (node = walker.nextNode()) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent && node.textContent.trim();
        if (text && text.length > 0) {
          texts.push(text);
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const text = node.textContent && node.textContent.trim();
        if (text && text.length > 0) {
          texts.push(text);
        }
      }
    }
    
    // Deduplicate while preserving order and filter out very short/common words
    const uniqueTexts = [...new Set(texts)].filter(text => 
      text.length > 1 && // Longer than 1 character
      text.trim().length > 0 // Not just whitespace
    );
    
    return uniqueTexts;
  };
`;

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

    // Execute the snapshot script as a string
    return (await this.page.evaluate(createSnapshotScript)) as Snapshot;
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

  /**
   * Get the ancestry chain of an element to understand DOM hierarchy.
   * Walks up the DOM tree from the target element, collecting information about
   * each ancestor level including which interactive refs they contain.
   */
  async get_ancestors(ref: string): Promise<any> {
    if (!this.page) throw new Error("Not initialized");

    return await this.page.evaluate(
      (ref, helpersScript) => {
        // Ensure helpers are available
        if (!window.__explorationHelpers) {
          eval(helpersScript);
        }

        const bridge = window.__bridge;
        const targetInfo = bridge.elements.get(ref);
        if (!targetInfo) return null;

        const helpers = window.__explorationHelpers;
        if (!helpers) {
          throw new Error("Exploration helpers not available");
        }

        // Walk up the ancestor chain
        const ancestors = [];
        let current = targetInfo.element.parentElement;
        let level = 1;

        while (current && current !== document.body) {
          const ancestorInfo = {
            level: level,
            tagName: current.tagName.toLowerCase(),
            attributes: helpers.getRelevantAttributes(current),
            childElements: current.children.length,
            containsRefs: helpers.findContainedRefs(current),
          };

          ancestors.push(ancestorInfo);
          current = current.parentElement;
          level++;
        }

        return {
          target: {
            ref: ref,
            tagName: targetInfo.tagName.toLowerCase(),
            text: targetInfo.element.textContent
              ? targetInfo.element.textContent.trim()
              : "",
          },
          ancestors: ancestors,
        };
      },
      ref,
      explorationHelpersScript
    );
  }

  /**
   * Analyze siblings at a specific ancestor level to understand patterns and repeated elements.
   * Given a ref and an ancestor level, finds all sibling elements at that level.
   */
  async get_siblings(ref: string, ancestorLevel: number): Promise<any> {
    if (!this.page) throw new Error("Not initialized");

    return await this.page.evaluate(
      (ref, ancestorLevel, helpersScript) => {
        // Ensure helpers are available
        if (!window.__explorationHelpers) {
          eval(helpersScript);
        }

        const bridge = window.__bridge;
        const targetInfo = bridge.elements.get(ref);
        if (!targetInfo) return null;

        const helpers = window.__explorationHelpers;
        if (!helpers) {
          throw new Error("Exploration helpers not available");
        }

        // Walk up to find the ancestor at the specified level
        let ancestor = targetInfo.element as Element;
        for (let i = 0; i < ancestorLevel; i++) {
          if (
            !ancestor.parentElement ||
            ancestor.parentElement === document.body
          ) {
            return null; // Ancestor level too high
          }
          ancestor = ancestor.parentElement;
        }

        // Get the parent of our target ancestor to find siblings
        const parent = ancestor.parentElement;
        if (!parent) return null;

        // Find all siblings of the same tag type as our target ancestor
        const siblings = Array.from(parent.children)
          .filter((child) => child.tagName === ancestor.tagName)
          .map((sibling, index) => ({
            index: index,
            tagName: sibling.tagName.toLowerCase(),
            attributes: helpers.getRelevantAttributes(sibling),
            containsRefs: helpers.findContainedRefs(sibling),
            containsText: helpers.extractMeaningfulTexts(sibling),
          }));

        return {
          ancestorLevel: ancestorLevel,
          siblings: siblings,
        };
      },
      ref,
      ancestorLevel,
      explorationHelpersScript
    );
  }

  /**
   * Analyze descendants within a specific ancestor to understand component structure.
   * Given a ref and an ancestor level, analyzes children within that ancestor (max 2 levels deep).
   */
  async get_descendants(ref: string, ancestorLevel: number): Promise<any> {
    if (!this.page) throw new Error("Not initialized");

    return await this.page.evaluate(
      (ref, ancestorLevel, helpersScript) => {
        // Ensure helpers are available
        if (!window.__explorationHelpers) {
          eval(helpersScript);
        }

        const bridge = window.__bridge;
        const targetInfo = bridge.elements.get(ref);
        if (!targetInfo) return null;

        const helpers = window.__explorationHelpers;
        if (!helpers) {
          throw new Error("Exploration helpers not available");
        }

        // Walk up to find the ancestor at the specified level
        let ancestor = targetInfo.element as Element;
        for (let i = 0; i < ancestorLevel; i++) {
          if (
            !ancestor.parentElement ||
            ancestor.parentElement === document.body
          ) {
            return null; // Ancestor level too high
          }
          ancestor = ancestor.parentElement;
        }

        // Analyze descendants within this ancestor (max 2 levels deep)
        const descendants: any[] = [];

        // Process immediate children (level 1)
        Array.from(ancestor.children).forEach((child) => {
          const descendantInfo: any = {
            tagName: child.tagName.toLowerCase(),
            attributes: helpers.getRelevantAttributes(child),
            contains: [],
          };

          // Process grandchildren (level 2) - but limit to avoid overwhelming output
          Array.from(child.children)
            .slice(0, 10)
            .forEach((grandchild) => {
              const content: any = {
                tagName: grandchild.tagName.toLowerCase(),
              };

              // Check if this grandchild has a ref
              const refForGrandchild = Array.from(
                bridge.elements.entries()
              ).find(([_, info]) => info.element === grandchild)?.[0];

              if (refForGrandchild) {
                content.ref = refForGrandchild;
                const refInfo = bridge.elements.get(refForGrandchild);
                if (refInfo) {
                  content.role = refInfo.role;
                  const text = grandchild.textContent?.trim();
                  if (text && text.length > 0) {
                    content.text = text;
                  }
                }
              } else {
                // For non-interactive elements, extract meaningful text
                const text = grandchild.textContent?.trim();
                if (text && text.length > 0 && text.length < 100) {
                  // Only include short, meaningful text
                  if (
                    [
                      "H1",
                      "H2",
                      "H3",
                      "H4",
                      "H5",
                      "H6",
                      "P",
                      "SPAN",
                      "DIV",
                    ].includes(grandchild.tagName)
                  ) {
                    content.text = text;
                  }
                }

                // For containers, include child count
                if (grandchild.children.length > 0) {
                  content.childCount = grandchild.children.length;
                }
              }

              descendantInfo.contains.push(content);
            });

          // If this child itself has meaningful content and no grandchildren were processed
          if (descendantInfo.contains.length === 0) {
            const childText = child.textContent?.trim();
            if (childText && childText.length > 0 && childText.length < 100) {
              descendantInfo.contains.push({
                tagName: "text",
                text: childText,
              });
            }
          }

          descendants.push(descendantInfo);
        });

        return {
          ancestorAt: {
            level: ancestorLevel,
            tagName: ancestor.tagName.toLowerCase(),
            attributes: helpers.getRelevantAttributes(ancestor),
          },
          descendants: descendants,
        };
      },
      ref,
      ancestorLevel,
      explorationHelpersScript
    );
  }

  /**
   * Helper method to find an element ref by attribute value.
   * Useful for testing and automation scenarios.
   */
  async findRefByAttribute(
    attributeName: string,
    attributeValue: string
  ): Promise<string | null> {
    if (!this.page) throw new Error("Not initialized");

    return await this.page.evaluate(
      (attrName, attrValue) => {
        const bridge = window.__bridge;
        for (const [ref, info] of bridge.elements) {
          if (
            info.element.getAttribute &&
            info.element.getAttribute(attrName) === attrValue
          ) {
            return ref;
          }
        }
        return null;
      },
      attributeName,
      attributeValue
    );
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  /**
   * Test method for Phase 1 - validates that our helper functions work correctly.
   * This creates a simple test page and tests each helper function.
   */
  async testHelperFunctions(): Promise<{
    getRelevantAttributes: any;
    findContainedRefs: any;
    extractMeaningfulTexts: any;
  }> {
    if (!this.page) throw new Error("Not initialized");

    // Create a simple test HTML structure
    await this.page.setContent(`
      <!DOCTYPE html>
      <html>
      <head><title>Test Page</title></head>
      <body>
        <div class="container" id="main-container" data-testid="test-container">
          <h1>Test Heading</h1>
          <div class="card" role="article">
            <h2>Card Title</h2>
            <p>Some description text</p>
            <button class="btn primary" data-testid="action-btn">Click Me</button>
            <a href="/test" aria-label="Test Link">Learn More</a>
          </div>
          <div class="card">
            <h3>Another Card</h3>
            <button>Another Button</button>
          </div>
        </div>
      </body>
      </html>
    `);

    // First, run snapshot to populate the bridge with refs
    await this.snapshot();

    // Now test our helper functions
    const result = await this.page.evaluate((helpersScript) => {
      // Inject helper functions
      eval(helpersScript);

      // Test getRelevantAttributes
      const container = document.getElementById("main-container");
      const attributesTest = (
        window as any
      ).__explorationHelpers.getRelevantAttributes(container);

      // Test findContainedRefs
      const refsTest = (window as any).__explorationHelpers.findContainedRefs(
        container
      );

      // Test extractMeaningfulTexts
      const textsTest = (
        window as any
      ).__explorationHelpers.extractMeaningfulTexts(container);

      return {
        getRelevantAttributes: attributesTest,
        findContainedRefs: refsTest,
        extractMeaningfulTexts: textsTest,
      };
    }, explorationHelpersScript);

    return result;
  }
}
