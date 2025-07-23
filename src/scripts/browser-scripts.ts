/**
 * Browser execution scripts with full TypeScript support
 * These functions will be converted to strings and executed in the browser context
 */

import { BridgeData } from "../types.js";

export function createSnapshot() {
  console.log("Starting snapshot...");
  try {
    // Ensure bridge exists
    if (!(window as any).__bridge) {
      (window as any).__bridge = {
        elements: new Map(),
        counter: 0,
      };
    }
    const bridge = (window as any).__bridge as BridgeData;
    bridge.elements.clear();
    bridge.counter = 0;
    console.log("Bridge initialized");

    const lines: string[] = [];

    // Helper functions
    function getRole(el: Element): string {
      const tagName = el.tagName.toLowerCase();
      const type = el.getAttribute("type");

      if (el.hasAttribute("role")) return el.getAttribute("role")!;

      const roleMap: Record<string, string> = {
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

    function getName(el: Element): string {
      if (el.getAttribute("aria-label")) return el.getAttribute("aria-label")!;
      if (el.getAttribute("alt")) return el.getAttribute("alt")!;
      if (el.getAttribute("title")) return el.getAttribute("title")!;

      if (el.tagName === "INPUT") {
        const placeholder = el.getAttribute("placeholder");
        if (placeholder) return placeholder;

        const id = (el as HTMLElement).id;
        if (id) {
          const label = document.querySelector(`label[for="${id}"]`);
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

    function getBestSelector(el: Element): string {
      const testId = el.getAttribute("data-testid");
      if (testId) return `data-testid='${testId}'`;

      const id = (el as HTMLElement).id;
      if (id && !/^[0-9]/.test(id) && id.length < 50) {
        return `id='${id}'`;
      }

      const ariaLabel = el.getAttribute("aria-label");
      if (ariaLabel) return `aria-label='${ariaLabel}'`;

      if (el.tagName === "A" && el.getAttribute("href")) {
        const href = el.getAttribute("href");
        if (href && !href.startsWith("javascript:")) {
          return `href='${href}'`;
        }
      }

      const role = getRole(el);
      const name = getName(el);
      if (role !== "generic" && name) {
        return `${role} "${name}"`;
      }

      return el.tagName.toLowerCase();
    }

    function shouldInclude(el: Element): boolean {
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

    function getAttributes(el: Element): Record<string, string> {
      const attrs: Record<string, string> = {};
      for (let i = 0; i < el.attributes.length; i++) {
        const attr = el.attributes[i];
        attrs[attr.name] = attr.value;
      }
      return attrs;
    }

    function getSiblingIndex(el: Element): number {
      const siblings = Array.from(el.parentNode?.children || []);
      return siblings.indexOf(el);
    }

    function processElement(
      el: Element,
      indent = "",
      lastInteractiveRef: string | null = null,
      depth = 0
    ): void {
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
      if (name) line += ` "${name}"`;

      const isInteractive =
        ["link", "button", "textbox", "checkbox", "radio", "select"].includes(
          role
        ) ||
        ["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(el.tagName);

      let currentRef = lastInteractiveRef; // Default to parent's ref

      if (isInteractive) {
        const ref = "e" + ++bridge.counter;
        line += ` [ref=${ref}]`;
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
      text: lines.join("\n"),
      elementCount: bridge.elements.size,
    };
  } catch (error) {
    console.error("Snapshot error:", error);
    console.error("Stack trace:", (error as Error).stack);
    return {
      text:
        "Error: " + (error as Error).message + " at " + (error as Error).stack,
      elementCount: 0,
    };
  }
}
