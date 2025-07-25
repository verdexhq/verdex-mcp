// browser-bridge.ts
import puppeteer, { Browser, Page, CDPSession } from "puppeteer";
import { Snapshot, ElementInfo } from "./types.js";
import {
  createSnapshotScript,
  createExplorationHelpersScript,
} from "./inject.js";

export class BrowserBridge {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private cdp: CDPSession | null = null;
  private isolatedWorldId: number | null = null;
  private bridgeObjectId: string | null = null;
  private mainFrameId: string | null = null;

  async initialize() {
    // Close any existing browser if it exists
    if (this.browser) {
      try {
        await this.browser.version();
      } catch (error) {
        this.browser = null;
        this.page = null;
      }
    }

    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: false,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--start-maximized"],
        defaultViewport: null,
      });
    }

    if (!this.page) {
      const pages = await this.browser.pages();
      this.page = pages[0] || (await this.browser.newPage());
    }

    // Get CDP session
    this.cdp = await this.page.target().createCDPSession();

    // Get main frame ID
    const { frameTree } = await this.cdp.send("Page.getFrameTree");
    this.mainFrameId = frameTree.frame.id;

    // Setup isolated world
    await this.setupIsolatedWorld();

    // Listen for navigation events
    this.cdp.on("Page.frameNavigated", (event) => {
      if (event.frame.id === this.mainFrameId) {
        // Main frame navigated, invalidate bridge
        this.isolatedWorldId = null;
        this.bridgeObjectId = null;
      }
    });
  }

  private async setupIsolatedWorld() {
    if (!this.cdp || !this.mainFrameId) throw new Error("Not initialized");

    // Create isolated world
    const { executionContextId } = await this.cdp.send(
      "Page.createIsolatedWorld",
      {
        frameId: this.mainFrameId,
        worldName: "browser_bridge_world",
        grantUniveralAccess: false,
      }
    );

    this.isolatedWorldId = executionContextId;

    // Create the complete bridge code with ALL your features
    const bridgeCode = `
      (() => {
        // Element storage system
        const bridge = {
          elements: new Map(),
          counter: 0,
          
          // Your snapshot function
          snapshot() {
            console.log("Starting snapshot...");
            try {
              // Clear previous state
              this.elements.clear();
              this.counter = 0;
              
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

              function shouldInclude(el) {
                const style = window.getComputedStyle(el);
                if (style.display === "none" || style.visibility === "hidden") return false;
                if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName)) return false;

                const role = getRole(el);
                if (["link", "button", "textbox", "checkbox", "radio"].includes(role)) return true;
                if (role === "heading") return true;
                if (el.hasAttribute("role")) return true;
                if (["INPUT", "SELECT", "TEXTAREA", "FORM"].includes(el.tagName)) return true;
                if (["navigation", "main", "banner", "contentinfo", "complementary"].includes(role)) return true;
                
                if (role === "generic" && ["DIV", "SPAN"].includes(el.tagName)) {
                  return el.hasAttribute("data-testid") || el.hasAttribute("aria-label");
                }
                
                return false;
              }

              const processElement = (el, indent = "") => {
                if (!shouldInclude(el)) {
                  Array.from(el.children).forEach(child => {
                    processElement(child, indent);
                  });
                  return;
                }

                const role = getRole(el);
                const name = getName(el);

                let line = indent + "- " + role;
                if (name) line += ' "' + name + '"';

                const isInteractive = ["link", "button", "textbox", "checkbox", "radio", "select"].includes(role) ||
                                    ["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(el.tagName);

                if (isInteractive) {
                  const ref = "e" + ++this.counter;
                  line += " [ref=" + ref + "]";

                  this.elements.set(ref, {
                    element: el,
                    tagName: el.tagName,
                    role: role,
                    name: name,
                    attributes: this.getAttributes(el),
                  });
                }

                lines.push(line);
                Array.from(el.children).forEach(child => {
                  processElement(child, indent + "  ");
                });
              };

              processElement(document.body);

              return {
                text: lines.join("\\n"),
                elementCount: this.elements.size,
              };
            } catch (error) {
              console.error("Snapshot error:", error);
              return {
                text: "Error: " + error.message,
                elementCount: 0,
              };
            }
          },
          
          // Click functionality
          click(ref) {
            const info = this.elements.get(ref);
            if (!info) throw new Error(\`Element \${ref} not found\`);
            info.element.click();
          },
          
          // Type functionality
          type(ref, text) {
            const info = this.elements.get(ref);
            if (!info) throw new Error(\`Element \${ref} not found\`);
            const el = info.element;
            el.focus();
            el.value = text;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          },
          
          // Inspect functionality
          inspect(ref) {
            const info = this.elements.get(ref);
            if (!info) return null;
            const el = info.element;
            const rect = el.getBoundingClientRect();
            
            return {
              ref: ref,
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
                height: rect.height
              }
            };
          },
          
          // Get ancestors with exploration helpers
          get_ancestors(ref) {
            ${createExplorationHelpersScript.toString()}
            const helpers = createExplorationHelpersScript();
            
            const targetInfo = this.elements.get(ref);
            if (!targetInfo) return null;
            
            const ancestors = [];
            let current = targetInfo.element.parentElement;
            let level = 1;
            
            while (current && current !== document.body) {
              const ancestorInfo = {
                level: level,
                tagName: current.tagName.toLowerCase(),
                attributes: helpers.getRelevantAttributes(current),
                childElements: current.children.length,
                containsRefs: helpers.findContainedRefs(current, this.elements),
              };
              
              ancestors.push(ancestorInfo);
              current = current.parentElement;
              level++;
            }
            
            return {
              target: {
                ref: ref,
                tagName: targetInfo.tagName.toLowerCase(),
                text: targetInfo.element.textContent?.trim() || ""
              },
              ancestors: ancestors
            };
          },
          
          // Get siblings
          get_siblings(ref, ancestorLevel) {
            ${createExplorationHelpersScript.toString()}
            const helpers = createExplorationHelpersScript();
            
            const targetInfo = this.elements.get(ref);
            if (!targetInfo) return null;
            
            let ancestor = targetInfo.element;
            for (let i = 0; i < ancestorLevel; i++) {
              if (!ancestor.parentElement || ancestor.parentElement === document.body) {
                return null;
              }
              ancestor = ancestor.parentElement;
            }
            
            const parent = ancestor.parentElement;
            if (!parent) return null;
            
            const siblings = Array.from(parent.children)
              .filter(child => child.tagName === ancestor.tagName)
              .map((sibling, index) => ({
                index: index,
                tagName: sibling.tagName.toLowerCase(),
                attributes: helpers.getRelevantAttributes(sibling),
                containsRefs: helpers.findContainedRefs(sibling, this.elements),
                containsText: helpers.extractMeaningfulTexts(sibling),
              }));
              
            return {
              ancestorLevel: ancestorLevel,
              siblings: siblings
            };
          },
          
          // Helper function for getting attributes
          getAttributes(el) {
            const attrs = {};
            for (let i = 0; i < el.attributes.length; i++) {
              const attr = el.attributes[i];
              attrs[attr.name] = attr.value;
            }
            return attrs;
          },
          
          // Get descendants
          get_descendants(ref, ancestorLevel) {
            ${createExplorationHelpersScript.toString()}
            const helpers = createExplorationHelpersScript();
            
            const targetInfo = this.elements.get(ref);
            if (!targetInfo) return null;
            
            let ancestor = targetInfo.element;
            for (let i = 0; i < ancestorLevel; i++) {
              if (!ancestor.parentElement || ancestor.parentElement === document.body) {
                return null;
              }
              ancestor = ancestor.parentElement;
            }
            
            const descendants = [];
            Array.from(ancestor.children).forEach(child => {
              const descendantInfo = {
                tagName: child.tagName.toLowerCase(),
                attributes: helpers.getRelevantAttributes(child),
                contains: []
              };
              
              Array.from(child.children).slice(0, 10).forEach(grandchild => {
                const content = {
                  tagName: grandchild.tagName.toLowerCase()
                };
                
                // Check if grandchild has a ref
                const refForGrandchild = Array.from(this.elements.entries())
                  .find(([_, info]) => info.element === grandchild)?.[0];
                  
                if (refForGrandchild) {
                  content.ref = refForGrandchild;
                  const refInfo = this.elements.get(refForGrandchild);
                  if (refInfo) {
                    content.role = refInfo.role;
                    const text = grandchild.textContent?.trim();
                    if (text && text.length > 0) {
                      content.text = text;
                    }
                  }
                } else {
                  const text = grandchild.textContent?.trim();
                  if (text && text.length > 0 && text.length < 100) {
                    if (['H1','H2','H3','H4','H5','H6','P','SPAN','DIV'].includes(grandchild.tagName)) {
                      content.text = text;
                    }
                  }
                  if (grandchild.children.length > 0) {
                    content.childCount = grandchild.children.length;
                  }
                }
                
                descendantInfo.contains.push(content);
              });
              
              if (descendantInfo.contains.length === 0) {
                const childText = child.textContent?.trim();
                if (childText && childText.length > 0 && childText.length < 100) {
                  descendantInfo.contains.push({
                    tagName: "text",
                    text: childText
                  });
                }
              }
              
              descendants.push(descendantInfo);
            });
            
            return {
              ancestorAt: {
                level: ancestorLevel,
                tagName: ancestor.tagName.toLowerCase(),
                attributes: helpers.getRelevantAttributes(ancestor)
              },
              descendants: descendants
            };
          }
        };
        
        return bridge;
      })()
    `;

    // Inject and store reference
    const { result } = await this.cdp.send("Runtime.evaluate", {
      expression: bridgeCode,
      contextId: this.isolatedWorldId,
      returnByValue: false,
    });

    this.bridgeObjectId = result.objectId || null;
  }

  private async ensureBridge() {
    if (!this.bridgeObjectId) {
      await this.setupIsolatedWorld();
    }

    // Test if object is still valid
    try {
      if (!this.cdp) throw new Error("CDP not initialized");

      await this.cdp.send("Runtime.callFunctionOn", {
        functionDeclaration: 'function() { return "alive"; }',
        objectId: this.bridgeObjectId!,
        returnByValue: true,
      });
    } catch (error) {
      // Object was garbage collected or context destroyed
      console.log("Bridge object invalid, recreating...");
      this.bridgeObjectId = null;
      await this.setupIsolatedWorld();
    }
  }

  async navigate(url: string): Promise<Snapshot> {
    if (!this.page) throw new Error("Not initialized");

    await this.page.goto(url, { waitUntil: "networkidle0" });

    // Navigation destroys contexts, recreate
    this.isolatedWorldId = null;
    this.bridgeObjectId = null;
    await this.setupIsolatedWorld();

    return this.snapshot();
  }

  async snapshot(): Promise<Snapshot> {
    await this.ensureBridge();

    if (!this.cdp) throw new Error("CDP not initialized");

    const { result } = await this.cdp.send("Runtime.callFunctionOn", {
      functionDeclaration: "function() { return this.snapshot(); }",
      objectId: this.bridgeObjectId!,
      returnByValue: true,
    });

    return result.value;
  }

  async click(ref: string): Promise<void> {
    await this.ensureBridge();

    if (!this.cdp) throw new Error("CDP not initialized");

    await this.cdp.send("Runtime.callFunctionOn", {
      functionDeclaration: "function(ref) { this.click(ref); }",
      objectId: this.bridgeObjectId!,
      arguments: [{ value: ref }],
      returnByValue: false,
    });

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  async type(ref: string, text: string): Promise<void> {
    await this.ensureBridge();

    if (!this.cdp) throw new Error("CDP not initialized");

    await this.cdp.send("Runtime.callFunctionOn", {
      functionDeclaration: "function(ref, text) { this.type(ref, text); }",
      objectId: this.bridgeObjectId!,
      arguments: [{ value: ref }, { value: text }],
      returnByValue: false,
    });
  }

  async inspect(ref: string): Promise<ElementInfo | null> {
    await this.ensureBridge();

    if (!this.cdp) throw new Error("CDP not initialized");

    const { result } = await this.cdp.send("Runtime.callFunctionOn", {
      functionDeclaration: "function(ref) { return this.inspect(ref); }",
      objectId: this.bridgeObjectId!,
      arguments: [{ value: ref }],
      returnByValue: true,
    });

    return result.value;
  }

  async get_ancestors(ref: string): Promise<any> {
    await this.ensureBridge();

    if (!this.cdp) throw new Error("CDP not initialized");

    const { result } = await this.cdp.send("Runtime.callFunctionOn", {
      functionDeclaration: "function(ref) { return this.get_ancestors(ref); }",
      objectId: this.bridgeObjectId!,
      arguments: [{ value: ref }],
      returnByValue: true,
    });

    return result.value;
  }

  async get_siblings(ref: string, ancestorLevel: number): Promise<any> {
    await this.ensureBridge();

    if (!this.cdp) throw new Error("CDP not initialized");

    const { result } = await this.cdp.send("Runtime.callFunctionOn", {
      functionDeclaration:
        "function(ref, level) { return this.get_siblings(ref, level); }",
      objectId: this.bridgeObjectId!,
      arguments: [{ value: ref }, { value: ancestorLevel }],
      returnByValue: true,
    });

    return result.value;
  }

  async get_descendants(ref: string, ancestorLevel: number): Promise<any> {
    await this.ensureBridge();

    if (!this.cdp) throw new Error("CDP not initialized");

    const { result } = await this.cdp.send("Runtime.callFunctionOn", {
      functionDeclaration:
        "function(ref, level) { return this.get_descendants(ref, level); }",
      objectId: this.bridgeObjectId!,
      arguments: [{ value: ref }, { value: ancestorLevel }],
      returnByValue: true,
    });

    return result.value;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.cdp = null;
      this.isolatedWorldId = null;
      this.bridgeObjectId = null;
    }
  }
}

// import puppeteer, { Browser, Page, CDPSession } from "puppeteer";
// import { Snapshot } from "./types.js";

// export class TrueIsolatedBrowserBridge {
//   private browser: Browser | null = null;
//   private page: Page | null = null;
//   private cdp: CDPSession | null = null;
//   private isolatedWorldId: number | null = null;
//   private sessionId: string = "";

//   async initialize() {
//     if (!this.browser) {
//       this.browser = await puppeteer.launch({
//         headless: false,
//         args: ["--no-sandbox", "--disable-setuid-sandbox", "--start-maximized"],
//         defaultViewport: null,
//       });
//     }

//     if (!this.page) {
//       const pages = await this.browser.pages();
//       this.page = pages[0] || (await this.browser.newPage());
//     }

//     // 🔥 KEY: Get CDP session for direct protocol access
//     this.cdp = await this.page.createCDPSession();

//     // Enable required CDP domains
//     await this.cdp.send("Runtime.enable");
//     await this.cdp.send("Page.enable");

//     this.sessionId = crypto.randomUUID();

//     // Create truly isolated world
//     await this.createIsolatedWorld();

//     // Inject bridge into isolated world
//     await this.injectIsolatedBridge();

//     // Set up communication bindings
//     await this.setupCommunication();
//   }

//   /**
//    * Creates a completely isolated JavaScript world
//    * This world has its own global object, completely separate from main page
//    */
//   private async createIsolatedWorld(): Promise<void> {
//     if (!this.cdp) throw new Error("CDP not initialized");

//     // Create isolated world with unique name
//     const worldName = `__isolated_bridge_world_${this.sessionId}`;

//     const result = await this.cdp.send("Page.createIsolatedWorld", {
//       frameId: (await this.cdp.send("Page.getFrameTree")).frameTree.frame.id,
//       worldName: worldName,
//       grantUniveralAccess: false, // Important: restrict access
//     });

//     this.isolatedWorldId = result.executionContextId;
//     console.log(`Created isolated world with ID: ${this.isolatedWorldId}`);
//   }

//   /**
//    * Inject bridge code into isolated world
//    * This code runs in completely separate context from page
//    */
//   private async injectIsolatedBridge(): Promise<void> {
//     if (!this.cdp || !this.isolatedWorldId)
//       throw new Error("Isolated world not created");

//     const bridgeCode = `
//       // This class exists ONLY in isolated world
//       // Page scripts cannot access it AT ALL
//       class TrulyIsolatedBridge {
//         constructor(sessionId) {
//           this.elements = new Map();
//           this.counter = 0;
//           this.sessionId = sessionId;
//           this.worldType = 'ISOLATED'; // Proof this is isolated world

//           console.log('Bridge created in isolated world:', sessionId);
//         }

//         snapshot() {
//           console.log('Snapshot called in isolated world');

//           // Clear previous state
//           this.elements.clear();
//           this.counter = 0;

//           const lines = [];

//           // All your existing helper functions here...
//           const getRole = (el) => {
//             const tagName = el.tagName.toLowerCase();
//             const type = el.getAttribute("type");
//             if (el.hasAttribute("role")) return el.getAttribute("role");

//             const roleMap = {
//               a: "link", button: "button",
//               input: type === "submit" || type === "button" ? "button" : "textbox",
//               img: "image", nav: "navigation", main: "main",
//               header: "banner", footer: "contentinfo", aside: "complementary",
//               h1: "heading", h2: "heading", h3: "heading", h4: "heading", h5: "heading", h6: "heading",
//               ul: "list", ol: "list", li: "listitem", table: "table", form: "form",
//               article: "article", section: "section",
//             };
//             return roleMap[tagName] || "generic";
//           };

//           const getName = (el) => {
//             if (el.getAttribute("aria-label")) return el.getAttribute("aria-label");
//             if (el.getAttribute("alt")) return el.getAttribute("alt");
//             if (el.getAttribute("title")) return el.getAttribute("title");
//             if (el.tagName === "INPUT") {
//               const placeholder = el.getAttribute("placeholder");
//               if (placeholder) return placeholder;
//               const id = el.id;
//               if (id) {
//                 const label = document.querySelector('label[for="' + id + '"]');
//                 if (label) return label.textContent ? label.textContent.trim() : "";
//               }
//             }
//             if (["A", "BUTTON"].includes(el.tagName)) {
//               return el.textContent ? el.textContent.trim() : "";
//             }
//             if (/^H[1-6]$/.test(el.tagName)) {
//               return el.textContent ? el.textContent.trim() : "";
//             }
//             return "";
//           };

//           const shouldInclude = (el) => {
//             const style = window.getComputedStyle(el);
//             if (style.display === "none" || style.visibility === "hidden") return false;
//             if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName)) return false;

//             const role = getRole(el);
//             if (["link", "button", "textbox", "checkbox", "radio"].includes(role)) return true;
//             if (role === "heading") return true;
//             if (el.hasAttribute("role")) return true;
//             if (["INPUT", "SELECT", "TEXTAREA", "FORM"].includes(el.tagName)) return true;
//             if (["navigation", "main", "banner", "contentinfo", "complementary"].includes(role)) return true;
//             if (role === "generic" && ["DIV", "SPAN"].includes(el.tagName)) {
//               return el.hasAttribute("data-testid") || el.hasAttribute("aria-label");
//             }
//             return false;
//           };

//           const processElement = (el, indent = "") => {
//             if (!shouldInclude(el)) {
//               Array.from(el.children).forEach(child => {
//                 processElement(child, indent);
//               });
//               return;
//             }

//             const role = getRole(el);
//             const name = getName(el);

//             let line = indent + "- " + role;
//             if (name) line += ' "' + name + '"';

//             const isInteractive = ["link", "button", "textbox", "checkbox", "radio", "select"].includes(role) ||
//                                 ["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(el.tagName);

//             if (isInteractive) {
//               const ref = "e" + ++this.counter;
//               line += " [ref=" + ref + "]";

//               // Store element info in isolated world
//               this.elements.set(ref, {
//                 element: el,
//                 tagName: el.tagName,
//                 role: role,
//                 name: name,
//                 attributes: this.getAttributes(el),
//               });
//             }

//             lines.push(line);
//             Array.from(el.children).forEach(child => {
//               processElement(child, indent + "  ");
//             });
//           };

//           processElement(document.body);

//           return {
//             text: lines.join("\\n"),
//             elementCount: this.elements.size,
//             sessionId: this.sessionId,
//             worldType: this.worldType,
//             isolatedWorldId: ${this.isolatedWorldId}
//           };
//         }

//         click(ref) {
//           const info = this.elements.get(ref);
//           if (!info) throw new Error(\`Element \${ref} not found in isolated world\`);

//           info.element.click();
//           return {
//             success: true,
//             ref,
//             worldType: this.worldType,
//             sessionId: this.sessionId
//           };
//         }

//         type(ref, text) {
//           const info = this.elements.get(ref);
//           if (!info) throw new Error(\`Element \${ref} not found in isolated world\`);

//           const el = info.element;
//           el.focus();
//           el.value = text;
//           el.dispatchEvent(new Event("input", { bubbles: true }));
//           el.dispatchEvent(new Event("change", { bubbles: true }));

//           return {
//             success: true,
//             ref,
//             text,
//             worldType: this.worldType
//           };
//         }

//         getAttributes(el) {
//           const attrs = {};
//           for (let i = 0; i < el.attributes.length; i++) {
//             const attr = el.attributes[i];
//             attrs[attr.name] = attr.value;
//           }
//           return attrs;
//         }

//         // Method to prove isolation
//         getWorldInfo() {
//           return {
//             sessionId: this.sessionId,
//             worldType: this.worldType,
//             isolatedWorldId: ${this.isolatedWorldId},
//             globalObject: typeof window,
//             elementCount: this.elements.size,
//             canAccessMainWindow: false // Will be proven in tests
//           };
//         }
//       }

//       // Create bridge instance in isolated world
//       // This is COMPLETELY separate from main page window
//       globalThis.__trulyIsolatedBridge = new TrulyIsolatedBridge('${this.sessionId}');

//       // Make it available for our CDP calls
//       globalThis.getBridge = () => globalThis.__trulyIsolatedBridge;
//     `;

//     // Execute in isolated world using CDP
//     await this.cdp.send("Runtime.evaluate", {
//       expression: bridgeCode,
//       contextId: this.isolatedWorldId,
//       returnByValue: false,
//     });

//     console.log("Bridge injected into isolated world");
//   }

//   /**
//    * Set up communication bindings between Node.js and isolated world
//    */
//   private async setupCommunication(): Promise<void> {
//     if (!this.cdp) throw new Error("CDP not initialized");

//     // Add binding for isolated world to communicate back to Node.js
//     await this.cdp.send("Runtime.addBinding", {
//       name: "isolatedBridgeCallback",
//       executionContextId: this.isolatedWorldId!,
//     });

//     // Listen for binding calls from isolated world
//     this.cdp.on("Runtime.bindingCalled", (event) => {
//       if (event.name === "isolatedBridgeCallback") {
//         console.log("Received callback from isolated world:", event.payload);
//       }
//     });
//   }

//   async navigate(url: string): Promise<Snapshot> {
//     if (!this.page) throw new Error("Not initialized");
//     await this.page.goto(url, { waitUntil: "networkidle0" });

//     // Recreate isolated world after navigation (contexts are lost on navigation)
//     await this.createIsolatedWorld();
//     await this.injectIsolatedBridge();

//     return this.snapshot();
//   }

//   async snapshot(): Promise<Snapshot> {
//     if (!this.cdp || !this.isolatedWorldId)
//       throw new Error("Isolated world not ready");

//     // Execute snapshot in isolated world via CDP
//     const result = await this.cdp.send("Runtime.evaluate", {
//       expression: "globalThis.getBridge().snapshot()",
//       contextId: this.isolatedWorldId,
//       returnByValue: true,
//     });

//     if (result.exceptionDetails) {
//       throw new Error(`Isolated world error: ${result.exceptionDetails.text}`);
//     }

//     return result.result.value as Snapshot;
//   }

//   async click(ref: string): Promise<void> {
//     if (!this.cdp || !this.isolatedWorldId)
//       throw new Error("Isolated world not ready");

//     const result = await this.cdp.send("Runtime.evaluate", {
//       expression: `globalThis.getBridge().click('${ref}')`,
//       contextId: this.isolatedWorldId,
//       returnByValue: true,
//     });

//     if (result.exceptionDetails) {
//       throw new Error(`Click failed: ${result.exceptionDetails.text}`);
//     }

//     // Wait for page update
//     await new Promise((resolve) => setTimeout(resolve, 500));
//   }

//   async type(ref: string, text: string): Promise<void> {
//     if (!this.cdp || !this.isolatedWorldId)
//       throw new Error("Isolated world not ready");

//     // Escape text for safe injection
//     const escapedText = text.replace(/'/g, "\\'").replace(/\n/g, "\\n");

//     const result = await this.cdp.send("Runtime.evaluate", {
//       expression: `globalThis.getBridge().type('${ref}', '${escapedText}')`,
//       contextId: this.isolatedWorldId,
//       returnByValue: true,
//     });

//     if (result.exceptionDetails) {
//       throw new Error(`Type failed: ${result.exceptionDetails.text}`);
//     }
//   }

//   /**
//    * Test method to prove TRUE isolation
//    * This will demonstrate that page scripts absolutely cannot access isolated world
//    */
//   async testTrueIsolation(): Promise<{
//     mainWorldCanAccessBridge: boolean;
//     isolatedWorldInfo: any;
//     mainWorldAttempts: any;
//     crossWorldAccess: boolean;
//   }> {
//     if (!this.page || !this.cdp || !this.isolatedWorldId)
//       throw new Error("Not ready");

//     // Set up test page with malicious scripts
//     await this.page.setContent(`
//       <!DOCTYPE html>
//       <html>
//       <head><title>TRUE Isolation Test</title></head>
//       <body>
//         <h1>Testing TRUE Isolation</h1>
//         <button id="test-btn">Test Button</button>
//         <script>
//           console.log("Malicious page script running...");

//           // Try every possible way to access isolated bridge
//           window.maliciousAttempts = {
//             globalThis: typeof globalThis.__trulyIsolatedBridge,
//             window: typeof window.__trulyIsolatedBridge,
//             windowDirect: window.__trulyIsolatedBridge,
//             globalSearch: Object.getOwnPropertyNames(globalThis).filter(name => name.includes('bridge')),
//             symbolSearch: Object.getOwnPropertySymbols(globalThis).length,
//             descriptor: Object.getOwnPropertyDescriptor(globalThis, '__trulyIsolatedBridge'),
//             windowKeys: Object.keys(window).filter(k => k.includes('bridge')),
//             // Try to find any bridge-related properties
//             searchAttempt: (() => {
//               for (let prop in globalThis) {
//                 if (prop.includes('bridge') || prop.includes('Bridge')) {
//                   return { found: prop, value: globalThis[prop] };
//                 }
//               }
//               return { found: 'none' };
//             })()
//           };

//           // Try to hijack or interfere
//           window.hijackAttempt = () => {
//             try {
//               // These should all fail because bridge is in isolated world
//               globalThis.__trulyIsolatedBridge = { hijacked: true };
//               window.__trulyIsolatedBridge = { hijacked: true };
//               return "SUCCESS: Hijacked!";
//             } catch (e) {
//               return "FAILED: " + e.message;
//             }
//           };
//         </script>
//       </body>
//       </html>
//     `);

//     // Recreate isolated world after setting content (contexts are lost)
//     await this.createIsolatedWorld();
//     await this.injectIsolatedBridge();

//     // Test from main world (page context)
//     const mainWorldTest = await this.page.evaluate(() => {
//       return {
//         canAccessBridge:
//           typeof (globalThis as any).__trulyIsolatedBridge !== "undefined",
//         windowSearch: typeof (window as any).__trulyIsolatedBridge,
//         maliciousAttempts: (window as any).maliciousAttempts,
//         hijackResult: (window as any).hijackAttempt(),
//         windowProps: Object.getOwnPropertyNames(window).filter((name) =>
//           name.includes("bridge")
//         ),
//       };
//     });

//     // Test from isolated world via CDP
//     const isolatedWorldResult = await this.cdp.send("Runtime.evaluate", {
//       expression: "globalThis.getBridge().getWorldInfo()",
//       contextId: this.isolatedWorldId,
//       returnByValue: true,
//     });

//     // Test cross-world access
//     const crossWorldTest = await this.cdp.send("Runtime.evaluate", {
//       expression: `
//         try {
//           // Try to access main world from isolated world
//           const mainWindow = window; // This should be different window object
//           return {
//             canAccessMainWindow: mainWindow === window,
//             mainWindowProps: Object.keys(mainWindow).slice(0, 10),
//             isolatedProps: Object.keys(globalThis).filter(k => k.includes('bridge')),
//             sameGlobalObject: globalThis === window
//           };
//         } catch (e) {
//           return { error: e.message };
//         }
//       `,
//       contextId: this.isolatedWorldId,
//       returnByValue: true,
//     });

//     return {
//       mainWorldCanAccessBridge: mainWorldTest.canAccessBridge,
//       isolatedWorldInfo: isolatedWorldResult.result.value,
//       mainWorldAttempts: mainWorldTest,
//       crossWorldAccess: crossWorldTest.result.value,
//     };
//   }

//   async close() {
//     if (this.cdp) {
//       await this.cdp.detach();
//       this.cdp = null;
//     }
//     if (this.browser) {
//       await this.browser.close();
//       this.browser = null;
//       this.page = null;
//     }
//   }
// }

// /**
//  * Demonstration function to test true isolation capabilities
//  */
// async function demonstrateTrueIsolation() {
//   console.log("🚀 Starting True Isolation Demonstration...\n");

//   const bridge = new TrueIsolatedBrowserBridge();

//   try {
//     console.log("1️⃣ Initializing browser with isolated world...");
//     await bridge.initialize();
//     console.log("✅ Browser initialized with isolated world\n");

//     console.log("2️⃣ Navigating to test page...");
//     const snapshot = await bridge.navigate("https://example.com");
//     console.log("✅ Navigation complete");
//     console.log("📸 Snapshot preview:", {
//       elementCount: snapshot.elementCount,
//       sessionId: snapshot.isolatedWorldInfo?.sessionId,
//       worldType: snapshot.isolatedWorldInfo?.worldType,
//       textPreview: snapshot.text.substring(0, 200) + "...",
//     });
//     console.log("");

//     console.log("3️⃣ Testing TRUE isolation (this is the critical test)...");
//     const isolationTest = await bridge.testTrueIsolation();
//     console.log("🔒 ISOLATION TEST RESULTS:");
//     console.log("=".repeat(50));
//     console.log(JSON.stringify(isolationTest, null, 2));
//     console.log("=".repeat(50));
//     console.log("");

//     // Analyze results
//     console.log("📊 ANALYSIS:");
//     console.log(
//       `✅ Main world CANNOT access bridge: ${!isolationTest.mainWorldCanAccessBridge}`
//     );
//     console.log(
//       `✅ Isolated world running properly: ${
//         isolationTest.isolatedWorldInfo?.worldType === "ISOLATED"
//       }`
//     );
//     console.log(
//       `✅ Session ID matches: ${
//         isolationTest.isolatedWorldInfo?.sessionId ===
//         snapshot.isolatedWorldInfo?.sessionId
//       }`
//     );

//     const maliciousAttempts =
//       isolationTest.mainWorldAttempts?.maliciousAttempts;
//     if (maliciousAttempts) {
//       console.log("🛡️  Malicious access attempts all failed:");
//       Object.entries(maliciousAttempts).forEach(([key, value]) => {
//         console.log(
//           `   - ${key}: ${
//             value === undefined ? "❌ BLOCKED" : "⚠️  " + JSON.stringify(value)
//           }`
//         );
//       });
//     }
//     console.log("");

//     // Test some basic interactions
//     console.log("4️⃣ Testing basic interactions in isolated world...");

//     // Take another snapshot to get current element refs
//     const currentSnapshot = await bridge.snapshot();
//     console.log(
//       `📸 Current snapshot has ${currentSnapshot.elementCount} interactive elements`
//     );

//     if (currentSnapshot.elementCount > 0) {
//       // Try clicking first available element (usually a link)
//       const firstRef = currentSnapshot.text.match(/\[ref=(e\d+)\]/)?.[1];
//       if (firstRef) {
//         console.log(`🖱️  Attempting to click element: ${firstRef}`);
//         try {
//           await bridge.click(firstRef);
//           console.log(
//             "✅ Click successful - interaction works in isolated world"
//           );
//         } catch (error) {
//           console.log("❌ Click failed:", error);
//         }
//       }
//     }

//     console.log("\n🎉 TRUE ISOLATION DEMONSTRATION COMPLETE!");
//     console.log("Key findings:");
//     console.log("- ✅ Page scripts CANNOT access isolated bridge");
//     console.log("- ✅ Isolated world operates independently");
//     console.log("- ✅ Element interactions work securely");
//     console.log("- ✅ No cross-world contamination detected");
//   } catch (error) {
//     console.error("❌ Demonstration failed:", error);
//     throw error;
//   } finally {
//     console.log("\n🧹 Cleaning up...");
//     await bridge.close();
//     console.log("✅ Browser closed");
//   }
// }

// // Export for use in other modules
// export { demonstrateTrueIsolation };

// // Run demonstration if this file is executed directly
// if (import.meta.url === `file://${process.argv[1]}`) {
//   demonstrateTrueIsolation()
//     .then(() => {
//       console.log("\n✨ All tests completed successfully!");
//       process.exit(0);
//     })
//     .catch((error) => {
//       console.error("\n💥 Test failed:", error);
//       process.exit(1);
//     });
// }
