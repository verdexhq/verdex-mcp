export const createSnapshotScript = function createSnapshot() {
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
};

/**
 * Combined helper scripts that can be injected into page context.
 * This includes all the helper functions needed for exploration methods.
 * Functions are attached to window.__explorationHelpers for easy access.
 */

export const createExplorationHelpersScript =
  function createExplorationHelpers() {
    // Initialize helpers namespace
    if (!window.__explorationHelpers) {
      window.__explorationHelpers = {};
    }

    // getRelevantAttributes function
    window.__explorationHelpers.getRelevantAttributes = function (element) {
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

    // findContainedRefs function
    window.__explorationHelpers.findContainedRefs = function (container) {
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
    window.__explorationHelpers.extractMeaningfulTexts = function (element) {
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

      // Deduplicate while preserving order and filter out very short/common words
      const uniqueTexts = [...new Set(texts)].filter(
        (text) =>
          text.length > 1 && // Longer than 1 character
          text.trim().length > 0 // Not just whitespace
      );

      return uniqueTexts;
    };
  };
