/**
 * Generates the complete code for injection into isolated worlds
 */
export function injectedCode(): string {
  return `
    (() => {
      // Element storage system
      const bridge = {
        elements: new Map(),
        counter: 0,
        
        // Snapshot function
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
          if (!info) throw new Error(\`Element \${ref} not found\`);
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
        
        // Get ancestors with inlined helpers (v0 fix)
        get_ancestors(ref) {
          const targetInfo = this.elements.get(ref);
          if (!targetInfo) return null;
          
          // Inline helper functions directly (no external injection)
          const getRelevantAttributes = (element) => {
            const relevant = ["class", "id", "data-testid", "role", "aria-label"];
            const attrs = {};
            relevant.forEach((attrName) => {
              const value = element.getAttribute(attrName);
              if (value) {
                attrs[attrName] = value;
              }
            });
            return attrs;
          };
          
          const findContainedRefs = (container) => {
            const refs = [];
            this.elements.forEach((info, refId) => {
              if (container.contains(info.element) && info.element !== container) {
                refs.push(refId);
              }
            });
            return refs;
          };
          
          const ancestors = [];
          let current = targetInfo.element.parentElement;
          let level = 1;
          
          while (current && current !== document.body) {
            const ancestorInfo = {
              level: level,
              tagName: current.tagName.toLowerCase(),
              attributes: getRelevantAttributes(current),
              childElements: current.children.length,
              containsRefs: findContainedRefs(current),
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
        
        // Get siblings with inlined helpers (v0 fix)
        get_siblings(ref, ancestorLevel) {
          const targetInfo = this.elements.get(ref);
          if (!targetInfo) return null;
          
          // Inline helper functions directly (no external injection)
          const getRelevantAttributes = (element) => {
            const relevant = ["class", "id", "data-testid", "role", "aria-label"];
            const attrs = {};
            relevant.forEach((attrName) => {
              const value = element.getAttribute(attrName);
              if (value) {
                attrs[attrName] = value;
              }
            });
            return attrs;
          };
          
          const findContainedRefs = (container) => {
            const refs = [];
            this.elements.forEach((info, refId) => {
              if (container.contains(info.element) && info.element !== container) {
                refs.push(refId);
              }
            });
            return refs;
          };
          
          const extractMeaningfulTexts = (element) => {
            const texts = [];
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
                    if (["H1", "H2", "H3", "H4", "H5", "H6", "BUTTON", "A", "LABEL"].includes(el.tagName)) {
                      return NodeFilter.FILTER_ACCEPT;
                    }
                  }
                  return NodeFilter.FILTER_SKIP;
                }
              }
            );
            
            let node;
            while ((node = walker.nextNode())) {
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
            
            const uniqueTexts = [...new Set(texts)].filter(
              (text) => text.length > 1 && text.trim().length > 0
            );
            return uniqueTexts;
          };
          
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
            .map((sibling, index) => ({
              index: index,
              tagName: sibling.tagName.toLowerCase(),
              isTargetType: sibling.tagName === ancestor.tagName,
              attributes: getRelevantAttributes(sibling),
              containsRefs: findContainedRefs(sibling),
              containsText: extractMeaningfulTexts(sibling),
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
        
        // Get descendants with inlined helpers (improved depth and semantic extraction)
        get_descendants(ref, ancestorLevel) {
          try {
            const targetInfo = this.elements.get(ref);
            if (!targetInfo) {
              return {
                error: "Element " + ref + " not found",
                ancestorAt: null,
                descendants: [],
                totalDescendants: 0,
                maxDepthReached: 0
              };
            }
          
          // Inline helper function directly (no external injection)
          const getRelevantAttributes = (element) => {
            const relevant = ["class", "id", "data-testid", "role", "aria-label"];
            const attrs = {};
            relevant.forEach((attrName) => {
              const value = element.getAttribute(attrName);
              if (value) {
                attrs[attrName] = value;
              }
            });
            return attrs;
          };
          
          // Recursive function to traverse descendants with configurable depth
          const traverseDescendants = (element, maxDepth = 4, currentDepth = 0) => {
            if (currentDepth >= maxDepth || !element || !element.children) return [];
            
            const children = [];
            Array.from(element.children).slice(0, 15).forEach((child, index) => {
              const childInfo = {
                depth: currentDepth + 1,
                index: index,
                tagName: child.tagName.toLowerCase(),
                attributes: getRelevantAttributes(child)
              };
              
              // Check if child has a ref
              const refForChild = Array.from(this.elements.entries())
                .find(([_, info]) => info.element === child)?.[0];
                
              if (refForChild) {
                childInfo.ref = refForChild;
                const refInfo = this.elements.get(refForChild);
                if (refInfo) {
                  childInfo.role = refInfo.role;
                  childInfo.name = refInfo.name;
                }
              }
              
              // Get meaningful text content
              const directText = child && child.childNodes ? 
                Array.from(child.childNodes)
                  .filter(node => node.nodeType === Node.TEXT_NODE)
                  .map(node => node.textContent?.trim())
                  .filter(text => text && text.length > 0)
                  .join(' ') : '';
                
              if (directText && directText.length > 0 && directText.length < 200) {
                childInfo.directText = directText;
              }
              
              // For semantic elements, capture full text content
              if (['H1','H2','H3','H4','H5','H6','P','SPAN','LABEL','BUTTON','A'].includes(child.tagName)) {
                const fullText = child.textContent?.trim();
                if (fullText && fullText.length > 0 && fullText.length < 200 && fullText !== directText) {
                  childInfo.fullText = fullText;
                }
              }
              
              // Add child count for containers
              if (child && child.children && child.children.length > 0) {
                childInfo.childCount = child.children.length;
                
                // Recursively get nested descendants
                const nestedDescendants = traverseDescendants(child, maxDepth, currentDepth + 1);
                if (nestedDescendants && nestedDescendants.length > 0) {
                  childInfo.descendants = nestedDescendants;
                }
              }
              
              children.push(childInfo);
            });
            
            return children;
          };
          
          let ancestor = targetInfo.element;
          for (let i = 0; i < ancestorLevel; i++) {
            if (!ancestor.parentElement || ancestor.parentElement === document.body) {
              return {
                error: "Ancestor level " + ancestorLevel + " is too high - reached document.body",
                ancestorAt: null,
                descendants: [],
                totalDescendants: 0,
                maxDepthReached: 0
              };
            }
            ancestor = ancestor.parentElement;
          }
          
          const descendants = traverseDescendants(ancestor, 4, 0);
          
          // Calculate max depth safely
          let maxDepth = 0;
          if (descendants && descendants.length > 0) {
            const depths = descendants.map(d => d && d.depth ? d.depth : 1);
            maxDepth = Math.max(...depths);
          }
          
          return {
            ancestorAt: {
              level: ancestorLevel,
              tagName: ancestor.tagName.toLowerCase(),
              attributes: getRelevantAttributes(ancestor)
            },
            descendants: descendants || [],
            totalDescendants: descendants ? descendants.length : 0,
            maxDepthReached: maxDepth
          };
          } catch (error) {
            return {
              error: "Error in get_descendants: " + error.message + " (Stack: " + error.stack + ")",
              ancestorAt: null,
              descendants: [],
              totalDescendants: 0,
              maxDepthReached: 0
            };
          }
        }
      };
      
      return bridge;
    })()
  `;
}
