/**
 * Generates accessibility tree snapshots from DOM elements
 * Based on Playwright's implementation following W3C ARIA specifications
 */
import { AriaUtils } from "../utils/AriaUtils.js";
import type {
  IBridge,
  SnapshotResult,
  ElementInfo,
  BridgeConfig,
} from "../types/index.js";

export interface AriaNode {
  role: string;
  name: string;
  ref?: string;
  children: (AriaNode | string)[];
  element: Element;
  // ARIA properties
  checked?: boolean | "mixed";
  disabled?: boolean;
  expanded?: boolean;
  level?: number;
  pressed?: boolean | "mixed";
  selected?: boolean;
  active?: boolean;
  props?: Record<string, string>;
}

export class SnapshotGenerator {
  private bridge: IBridge;
  private config: BridgeConfig;
  private visited = new Set<Node>();

  constructor(bridge: IBridge, config: BridgeConfig = {}) {
    this.bridge = bridge;
    this.config = config;
  }

  /**
   * Generate a complete accessibility tree snapshot
   */
  generate(): SnapshotResult {
    console.log("Starting snapshot...");

    try {
      // Clear previous state
      this.bridge.elements.clear();
      this.bridge.counter = 0;
      this.visited.clear();

      const lines: string[] = [];
      this.processNode(document.body, lines, "", true);

      return {
        text: lines.join("\n"),
        elementCount: this.bridge.elements.size,
      };
    } catch (error) {
      console.error("Snapshot error:", error);
      return {
        text: `Error: ${(error as Error).message}`,
        elementCount: 0,
      };
    }
  }

  /**
   * Process a node (element or text) recursively
   */
  private processNode(
    node: Node,
    lines: string[],
    indent: string,
    parentVisible: boolean
  ): void {
    if (this.visited.has(node)) return;
    this.visited.add(node);

    // Handle text nodes
    if (node.nodeType === Node.TEXT_NODE && node.nodeValue) {
      if (!parentVisible) return;

      const text = this.normalizeWhitespace(node.nodeValue);
      if (text && text.length > 0) {
        // Don't add text if parent is textbox (textarea content is handled separately)
        const parent = node.parentElement;
        if (parent) {
          const parentRole = AriaUtils.getRole(parent);
          if (parentRole !== "textbox") {
            lines.push(`${indent}- text: "${text}"`);
          }
        }
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node as Element;
    const isVisible = AriaUtils.isVisibleForAria(element);

    // Skip if not visible for ARIA, but still process children in case they are visible
    if (!isVisible) {
      this.processChildren(element, lines, indent, false);
      return;
    }

    const ariaNode = this.createAriaNode(element);
    if (!ariaNode) {
      // Element doesn't contribute to accessibility tree, but process children
      this.processChildren(element, lines, indent, isVisible);
      return;
    }

    // Build the line representation
    const line = this.buildNodeLine(ariaNode, indent);
    lines.push(line);

    // Check if this is an input with a value
    const inputValue = this.getInputValue(element);
    if (inputValue !== null && inputValue.length > 0) {
      // Show the input value as a child text node (escape quotes!)
      const escapedValue = inputValue.replace(/"/g, '\\"');
      lines.push(`${indent}  - text: "${escapedValue}"`);
      // Still process aria-owns but skip normal children for inputs
      this.processAriaOwnedElements(element, lines, indent + "  ");
    } else {
      // Process children normally
      this.processChildren(element, lines, indent + "  ", isVisible);
      // Process aria-owns elements
      this.processAriaOwnedElements(element, lines, indent + "  ");
    }
  }

  /**
   * Create an AriaNode from an element
   */
  private createAriaNode(element: Element): AriaNode | null {
    const role = AriaUtils.getRole(element);
    if (!role || role === "presentation" || role === "none") {
      return null;
    }

    const name = AriaUtils.getName(element);
    const ariaProperties = AriaUtils.getAriaProperties(element, role);

    // Skip generic inline elements with only text content
    if (role === "generic") {
      const style = window.getComputedStyle(element);
      const isInline =
        style.display === "inline" || style.display === "inline-block";
      if (
        isInline &&
        element.childNodes.length === 1 &&
        element.childNodes[0].nodeType === Node.TEXT_NODE
      ) {
        return null;
      }
    }

    const ariaNode: AriaNode = {
      role,
      name,
      children: [],
      element,
      ...ariaProperties,
    };

    // Extract element properties for disambiguation
    this.extractElementProperties(element, ariaNode);

    // Add reference for interactive elements
    if (AriaUtils.isInteractive(element, role)) {
      const ref = `e${++this.bridge.counter}`;
      ariaNode.ref = ref;

      // Store element information
      const elementInfo: ElementInfo = {
        element: element,
        tagName: element.tagName,
        role: role,
        name: name,
        attributes: this.bridge.getAttributes(element),
      };

      this.bridge.elements.set(ref, elementInfo);
    }

    return ariaNode;
  }

  /**
   * Build the string representation of an aria node
   */
  private buildNodeLine(ariaNode: AriaNode, indent: string): string {
    let line = `${indent}- ${ariaNode.role}`;

    // Add name if present
    if (ariaNode.name) {
      line += ` "${ariaNode.name}"`;
    }

    // Add ARIA properties
    if (ariaNode.checked === "mixed") line += " [checked=mixed]";
    else if (ariaNode.checked === true) line += " [checked]";

    if (ariaNode.disabled) line += " [disabled]";
    if (ariaNode.expanded) line += " [expanded]";
    if (ariaNode.active) line += " [active]";
    if (ariaNode.level) line += ` [level=${ariaNode.level}]`;

    if (ariaNode.pressed === "mixed") line += " [pressed=mixed]";
    else if (ariaNode.pressed === true) line += " [pressed]";

    if (ariaNode.selected) line += " [selected]";

    // Add element properties
    if (ariaNode.props && Object.keys(ariaNode.props).length > 0) {
      const propsStr = Object.entries(ariaNode.props)
        .map(([key, value]) => `${key}="${value.replace(/"/g, '\\"')}"`)
        .join(" ");
      line += ` [${propsStr}]`;
    }

    // Add reference
    if (ariaNode.ref) {
      line += ` [ref=${ariaNode.ref}]`;
    }

    return line;
  }

  /**
   * Extract important element properties for navigation and testing
   */
  private extractElementProperties(element: Element, ariaNode: AriaNode): void {
    const props: Record<string, string> = {};

    // Links: capture URL
    if (ariaNode.role === "link" && element.hasAttribute("href")) {
      props.url = element.getAttribute("href")!;
    }

    // Textboxes and searchboxes: capture placeholder
    if (ariaNode.role === "textbox" || ariaNode.role === "searchbox") {
      const placeholder = element.getAttribute("placeholder");
      if (placeholder) {
        props.placeholder = placeholder;
      }
    }

    // Images: capture src (alt already in name)
    if (element instanceof HTMLImageElement && element.src) {
      props.src = element.src;
    }

    // Buttons: capture type if submit/reset
    if (ariaNode.role === "button") {
      const type = element.getAttribute("type");
      if (type === "submit" || type === "reset") {
        props.type = type;
      }
    }

    // Comboboxes: capture autocomplete
    if (ariaNode.role === "combobox") {
      const autocomplete = element.getAttribute("autocomplete");
      if (autocomplete) {
        props.autocomplete = autocomplete;
      }
    }

    if (Object.keys(props).length > 0) {
      ariaNode.props = props;
    }
  }

  /**
   * Get the current value of an input element
   */
  private getInputValue(element: Element): string | null {
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement
      )
    ) {
      return null;
    }

    if (element instanceof HTMLInputElement) {
      const skipTypes = [
        "checkbox",
        "radio",
        "file",
        "button",
        "submit",
        "reset",
        "image",
        "hidden",
      ];
      if (skipTypes.includes(element.type)) {
        return null;
      }
    }

    return element.value;
  }

  /**
   * Process child nodes
   */
  private processChildren(
    element: Element,
    lines: string[],
    indent: string,
    parentVisible: boolean
  ): void {
    // Handle slot elements
    if (element.nodeName === "SLOT") {
      const slot = element as HTMLSlotElement;
      const assignedNodes = slot.assignedNodes();
      if (assignedNodes.length > 0) {
        assignedNodes.forEach((child) => {
          this.processNode(child, lines, indent, parentVisible);
        });
        return;
      }
    }

    // Process regular children
    Array.from(element.childNodes).forEach((child) => {
      if (!(child as Element).assignedSlot) {
        this.processNode(child, lines, indent, parentVisible);
      }
    });

    // Process shadow DOM
    if (element.shadowRoot) {
      Array.from(element.shadowRoot.childNodes).forEach((child) => {
        this.processNode(child, lines, indent, parentVisible);
      });
    }
  }

  /**
   * Process elements referenced by aria-owns
   */
  private processAriaOwnedElements(
    element: Element,
    lines: string[],
    indent: string
  ): void {
    const owns = element.getAttribute("aria-owns");
    if (!owns) return;

    const ownedElements = owns
      .split(/\s+/)
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    ownedElements.forEach((owned) => {
      this.processNode(owned, lines, indent, true);
    });
  }

  /**
   * Normalize whitespace in text content
   */
  private normalizeWhitespace(text: string): string {
    return text
      .replace(/[\u200b\u00ad]/g, "")
      .replace(/[\r\n\s\t]+/g, " ")
      .trim();
  }
}

// /**
//  * Generates accessibility tree snapshots from DOM elements
//  */

// import { AriaUtils } from "../utils/AriaUtils.js";
// import type {
//   IBridge,
//   SnapshotResult,
//   ElementInfo,
//   BridgeConfig,
// } from "../types/index.js";

// export class SnapshotGenerator {
//   private bridge: IBridge;
//   private config: BridgeConfig;

//   constructor(bridge: IBridge, config: BridgeConfig = {}) {
//     this.bridge = bridge;
//     this.config = config;
//   }

//   /**
//    * Generate a complete accessibility tree snapshot
//    */
//   generate(): SnapshotResult {
//     console.log("Starting snapshot...");

//     try {
//       // Clear previous state
//       this.bridge.elements.clear();
//       this.bridge.counter = 0;

//       const lines: string[] = [];
//       this.processElement(document.body, lines, "");

//       return {
//         text: lines.join("\n"),
//         elementCount: this.bridge.elements.size,
//       };
//     } catch (error) {
//       console.error("Snapshot error:", error);
//       return {
//         text: `Error: ${(error as Error).message}`,
//         elementCount: 0,
//       };
//     }
//   }

//   /**
//    * Process a single element and its children recursively
//    */
//   private processElement(
//     element: Element,
//     lines: string[],
//     indent: string
//   ): void {
//     // Skip elements that shouldn't be included in the accessibility tree
//     if (!AriaUtils.shouldInclude(element)) {
//       // Still process children in case they should be included
//       Array.from(element.children).forEach((child) => {
//         this.processElement(child, lines, indent);
//       });
//       return;
//     }

//     const role = AriaUtils.getRole(element);
//     const name = AriaUtils.getName(element);

//     // Build the line representation
//     let line = `${indent}- ${role}`;
//     if (name) {
//       line += ` "${name}"`;
//     }

//     // Add reference for interactive elements
//     if (AriaUtils.isInteractive(element, role)) {
//       const ref = `e${++this.bridge.counter}`;
//       line += ` [ref=${ref}]`;

//       // Store element information
//       const elementInfo: ElementInfo = {
//         element: element,
//         tagName: element.tagName,
//         role: role,
//         name: name,
//         attributes: this.bridge.getAttributes(element),
//       };

//       this.bridge.elements.set(ref, elementInfo);
//     }

//     lines.push(line);

//     // Process children with increased indentation
//     Array.from(element.children).forEach((child) => {
//       this.processElement(child, lines, indent + "  ");
//     });
//   }
// }
