// Core utilities that can be tested and maintained separately
class AriaUtils {
  static getRole(element) {
    const tagName = element.tagName.toLowerCase();
    const type = element.getAttribute("type");

    if (element.hasAttribute("role")) return element.getAttribute("role");

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

  static getName(element) {
    if (element.getAttribute("aria-label"))
      return element.getAttribute("aria-label");
    if (element.getAttribute("alt")) return element.getAttribute("alt");
    if (element.getAttribute("title")) return element.getAttribute("title");

    if (element.tagName === "INPUT") {
      const placeholder = element.getAttribute("placeholder");
      if (placeholder) return placeholder;
      const id = element.id;
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`);
        if (label) return label.textContent ? label.textContent.trim() : "";
      }
    }

    if (["A", "BUTTON"].includes(element.tagName)) {
      return element.textContent ? element.textContent.trim() : "";
    }

    if (/^H[1-6]$/.test(element.tagName)) {
      return element.textContent ? element.textContent.trim() : "";
    }

    return "";
  }

  static shouldInclude(element) {
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(element.tagName)) return false;

    const role = this.getRole(element);
    if (["link", "button", "textbox", "checkbox", "radio"].includes(role))
      return true;
    if (role === "heading") return true;
    if (element.hasAttribute("role")) return true;
    if (["INPUT", "SELECT", "TEXTAREA", "FORM"].includes(element.tagName))
      return true;
    if (
      ["navigation", "main", "banner", "contentinfo", "complementary"].includes(
        role
      )
    )
      return true;

    if (role === "generic" && ["DIV", "SPAN"].includes(element.tagName)) {
      return (
        element.hasAttribute("data-testid") ||
        element.hasAttribute("aria-label")
      );
    }

    return false;
  }

  static isInteractive(element, role) {
    return (
      ["link", "button", "textbox", "checkbox", "radio", "select"].includes(
        role
      ) ||
      ["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(element.tagName)
    );
  }
}

class DOMAnalyzer {
  static getRelevantAttributes(element) {
    const relevant = ["class", "id", "data-testid", "role", "aria-label"];
    const attrs = {};
    relevant.forEach((attrName) => {
      const value = element.getAttribute(attrName);
      if (value) {
        attrs[attrName] = value;
      }
    });
    return attrs;
  }

  static findContainedRefs(container, elementsMap) {
    const refs = [];
    elementsMap.forEach((info, refId) => {
      if (container.contains(info.element) && info.element !== container) {
        refs.push(refId);
      }
    });
    return refs;
  }

  static extractMeaningfulTexts(element) {
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
            if (
              [
                "H1",
                "H2",
                "H3",
                "H4",
                "H5",
                "H6",
                "BUTTON",
                "A",
                "LABEL",
              ].includes(el.tagName)
            ) {
              return NodeFilter.FILTER_ACCEPT;
            }
          }
          return NodeFilter.FILTER_SKIP;
        },
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
  }
}

class SnapshotGenerator {
  constructor(bridge) {
    this.bridge = bridge;
  }

  generate() {
    console.log("Starting snapshot...");
    try {
      this.bridge.elements.clear();
      this.bridge.counter = 0;

      const lines = [];
      this.processElement(document.body, lines, "");

      return {
        text: lines.join("\n"),
        elementCount: this.bridge.elements.size,
      };
    } catch (error) {
      console.error("Snapshot error:", error);
      return {
        text: "Error: " + error.message,
        elementCount: 0,
      };
    }
  }

  processElement(element, lines, indent) {
    if (!AriaUtils.shouldInclude(element)) {
      Array.from(element.children).forEach((child) => {
        this.processElement(child, lines, indent);
      });
      return;
    }

    const role = AriaUtils.getRole(element);
    const name = AriaUtils.getName(element);

    let line = indent + "- " + role;
    if (name) line += ` "${name}"`;

    if (AriaUtils.isInteractive(element, role)) {
      const ref = "e" + ++this.bridge.counter;
      line += ` [ref=${ref}]`;

      this.bridge.elements.set(ref, {
        element: element,
        tagName: element.tagName,
        role: role,
        name: name,
        attributes: this.bridge.getAttributes(element),
      });
    }

    lines.push(line);
    Array.from(element.children).forEach((child) => {
      this.processElement(child, lines, indent + "  ");
    });
  }
}

class StructuralAnalyzer {
  constructor(bridge) {
    this.bridge = bridge;
  }

  getAncestors(ref) {
    const targetInfo = this.bridge.elements.get(ref);
    if (!targetInfo) return null;

    const ancestors = [];
    let current = targetInfo.element.parentElement;
    let level = 1;

    while (current && current !== document.body) {
      const ancestorInfo = {
        level: level,
        tagName: current.tagName.toLowerCase(),
        attributes: DOMAnalyzer.getRelevantAttributes(current),
        childElements: current.children.length,
        containsRefs: DOMAnalyzer.findContainedRefs(
          current,
          this.bridge.elements
        ),
      };

      ancestors.push(ancestorInfo);
      current = current.parentElement;
      level++;
    }

    return {
      target: {
        ref: ref,
        tagName: targetInfo.tagName.toLowerCase(),
        text: targetInfo.element.textContent?.trim() || "",
      },
      ancestors: ancestors,
    };
  }

  getSiblings(ref, ancestorLevel) {
    const targetInfo = this.bridge.elements.get(ref);
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

    const siblings = Array.from(parent.children).map((sibling, index) => ({
      index: index,
      tagName: sibling.tagName.toLowerCase(),
      isTargetType: sibling.tagName === ancestor.tagName,
      attributes: DOMAnalyzer.getRelevantAttributes(sibling),
      containsRefs: DOMAnalyzer.findContainedRefs(
        sibling,
        this.bridge.elements
      ),
      containsText: DOMAnalyzer.extractMeaningfulTexts(sibling),
    }));

    return {
      ancestorLevel: ancestorLevel,
      siblings: siblings,
    };
  }

  getDescendants(ref, ancestorLevel) {
    try {
      const targetInfo = this.bridge.elements.get(ref);
      if (!targetInfo) {
        return {
          error: "Element " + ref + " not found",
          ancestorAt: null,
          descendants: [],
          totalDescendants: 0,
          maxDepthReached: 0,
        };
      }

      const traverseDescendants = (element, maxDepth = 4, currentDepth = 0) => {
        if (currentDepth >= maxDepth || !element || !element.children)
          return [];

        const children = [];
        Array.from(element.children)
          .slice(0, 15)
          .forEach((child, index) => {
            const childInfo = {
              depth: currentDepth + 1,
              index: index,
              tagName: child.tagName.toLowerCase(),
              attributes: DOMAnalyzer.getRelevantAttributes(child),
            };

            const refForChild = Array.from(this.bridge.elements.entries()).find(
              ([_, info]) => info.element === child
            )?.[0];

            if (refForChild) {
              childInfo.ref = refForChild;
              const refInfo = this.bridge.elements.get(refForChild);
              if (refInfo) {
                childInfo.role = refInfo.role;
                childInfo.name = refInfo.name;
              }
            }

            const directText =
              child && child.childNodes
                ? Array.from(child.childNodes)
                    .filter((node) => node.nodeType === Node.TEXT_NODE)
                    .map((node) => node.textContent?.trim())
                    .filter((text) => text && text.length > 0)
                    .join(" ")
                : "";

            if (
              directText &&
              directText.length > 0 &&
              directText.length < 200
            ) {
              childInfo.directText = directText;
            }

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
                "LABEL",
                "BUTTON",
                "A",
              ].includes(child.tagName)
            ) {
              const fullText = child.textContent?.trim();
              if (
                fullText &&
                fullText.length > 0 &&
                fullText.length < 200 &&
                fullText !== directText
              ) {
                childInfo.fullText = fullText;
              }
            }

            if (child && child.children && child.children.length > 0) {
              childInfo.childCount = child.children.length;
              const nestedDescendants = traverseDescendants(
                child,
                maxDepth,
                currentDepth + 1
              );
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
        if (
          !ancestor.parentElement ||
          ancestor.parentElement === document.body
        ) {
          return {
            error:
              "Ancestor level " +
              ancestorLevel +
              " is too high - reached document.body",
            ancestorAt: null,
            descendants: [],
            totalDescendants: 0,
            maxDepthReached: 0,
          };
        }
        ancestor = ancestor.parentElement;
      }

      const descendants = traverseDescendants(ancestor, 4, 0);

      let maxDepth = 0;
      if (descendants && descendants.length > 0) {
        const depths = descendants.map((d) => (d && d.depth ? d.depth : 1));
        maxDepth = Math.max(...depths);
      }

      return {
        ancestorAt: {
          level: ancestorLevel,
          tagName: ancestor.tagName.toLowerCase(),
          attributes: DOMAnalyzer.getRelevantAttributes(ancestor),
        },
        descendants: descendants || [],
        totalDescendants: descendants ? descendants.length : 0,
        maxDepthReached: maxDepth,
      };
    } catch (error) {
      return {
        error:
          "Error in get_descendants: " +
          error.message +
          " (Stack: " +
          error.stack +
          ")",
        ancestorAt: null,
        descendants: [],
        totalDescendants: 0,
        maxDepthReached: 0,
      };
    }
  }
}

// Code generation function that serializes classes
function serializeClass(cls) {
  return cls.toString();
}

export function injectedCode() {
  const utils = [
    serializeClass(AriaUtils),
    serializeClass(DOMAnalyzer),
    serializeClass(SnapshotGenerator),
    serializeClass(StructuralAnalyzer),
  ].join("\n\n");

  return `
    (() => {
      ${utils}
      
      const bridge = {
        elements: new Map(),
        counter: 0,
        
        snapshot() {
          const generator = new SnapshotGenerator(this);
          return generator.generate();
        },
        
        click(ref) {
          const info = this.elements.get(ref);
          if (!info) throw new Error(\`Element \${ref} not found\`);
          info.element.click();
        },
        
        type(ref, text) {
          const info = this.elements.get(ref);
          if (!info) throw new Error(\`Element \${ref} not found\`);
          const el = info.element;
          el.focus();
          el.value = text;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        },
        
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
            attributes: info.attributes,
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
        
        get_ancestors(ref) {
          const analyzer = new StructuralAnalyzer(this);
          return analyzer.getAncestors(ref);
        },
        
        get_siblings(ref, ancestorLevel) {
          const analyzer = new StructuralAnalyzer(this);
          return analyzer.getSiblings(ref, ancestorLevel);
        },
        
        get_descendants(ref, ancestorLevel) {
          const analyzer = new StructuralAnalyzer(this);
          return analyzer.getDescendants(ref, ancestorLevel);
        },
        
        getAttributes(el) {
          const attrs = {};
          for (let i = 0; i < el.attributes.length; i++) {
            const attr = el.attributes[i];
            attrs[attr.name] = attr.value;
          }
          return attrs;
        }
      };
      
      return bridge;
    })()
  `;
}
