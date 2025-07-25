import puppeteer, { Browser, Page } from "puppeteer";
import { Snapshot, ElementInfo } from "./types.js";
import {
  createSnapshotScript,
  createExplorationHelpersScript,
} from "./inject.js";

export class BrowserBridge {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async initialize() {
    // Close any existing browser if it exists but might be in invalid state
    if (this.browser) {
      try {
        // Check if browser is still connected
        await this.browser.version();
      } catch (error) {
        // Browser is not valid, clean up references
        this.browser = null;
        this.page = null;
      }
    }

    // Only create browser if it doesn't exist or was cleaned up
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

    // Execute the snapshot script using toString()
    return (await this.page.evaluate(
      `(${createSnapshotScript.toString()})()`
    )) as Snapshot;
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
      `(${createExplorationHelpersScript.toString()})()`
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
      `(${createExplorationHelpersScript.toString()})()`
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
      `(${createExplorationHelpersScript.toString()})()`
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
      this.browser = null;
      this.page = null;
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
    }, `(${createExplorationHelpersScript.toString()})()`);

    return result;
  }
}
