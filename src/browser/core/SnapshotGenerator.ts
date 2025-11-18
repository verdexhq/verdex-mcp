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

export type AriaNode = {
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
};

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
      // Clean up stale refs (elements removed from DOM)
      for (const [ref, info] of this.bridge.elements.entries()) {
        if (!info.element.isConnected) {
          delete (info.element as any)._verdexRef;
          this.bridge.elements.delete(ref);
        }
      }

      // Keep: Clear visited set for this snapshot traversal
      this.visited.clear();

      // Phase 1: Build the tree
      const rootChildren = this.buildAriaTree(document.body, true);

      // Create a virtual root node
      const rootNode: AriaNode = {
        role: "WebArea",
        name: "",
        children: rootChildren,
        element: document.body,
      };

      // Phase 2: Optimize generic roles (Playwright's approach)
      this.normalizeGenericRoles(rootNode);

      // Phase 3: Render to text
      const lines: string[] = [];
      this.renderTree(rootNode, lines, "");

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
   * Build accessibility tree structure from a node
   * Returns an array of AriaNode | string (text nodes)
   */
  private buildAriaTree(
    node: Node,
    parentVisible: boolean
  ): (AriaNode | string)[] {
    if (this.visited.has(node)) return [];
    this.visited.add(node);

    // Handle text nodes
    if (node.nodeType === Node.TEXT_NODE && node.nodeValue) {
      if (!parentVisible) return [];

      const text = this.normalizeWhitespace(node.nodeValue);
      if (text && text.length > 0) {
        // Don't add text if parent is textbox (textarea content is handled separately)
        const parent = node.parentElement;
        if (parent) {
          const parentRole = AriaUtils.getRole(parent);
          if (parentRole !== "textbox") {
            return [text];
          }
        }
      }
      return [];
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return [];

    const element = node as Element;
    const isVisible = AriaUtils.isVisibleForAria(element);

    // Skip if not visible for ARIA, but still process children in case they are visible
    if (!isVisible) {
      return this.buildChildrenTree(element, false);
    }

    const ariaNode = this.createAriaNode(element);
    if (!ariaNode) {
      // Element doesn't contribute to accessibility tree, but process children
      return this.buildChildrenTree(element, isVisible);
    }

    // Build children for this node
    const inputValue = this.getInputValue(element);
    if (inputValue !== null && inputValue.length > 0) {
      // Show the input value as a child text node
      ariaNode.children = [inputValue];
      // Still process aria-owns but skip normal children for inputs
      const ownedChildren = this.buildAriaOwnedTree(element);
      ariaNode.children.push(...ownedChildren);
    } else {
      // Process children normally
      const children = this.buildChildrenTree(element, isVisible);
      const ownedChildren = this.buildAriaOwnedTree(element);
      ariaNode.children = [...children, ...ownedChildren];
    }

    return [ariaNode];
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
      // Check if element already has a ref
      let ref = (element as any)._verdexRef;

      if (ref && this.bridge.elements.has(ref)) {
        // Existing element with valid ref in current bridge - reuse it
        ariaNode.ref = ref;
      } else {
        // New element OR stale ref from previous session - create new ref
        ref = `e${++this.bridge.counter}`;
        (element as any)._verdexRef = ref;
        ariaNode.ref = ref;
      }

      // Always update element info (properties may have changed)
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

    // Add name if present (with YAML escaping)
    if (ariaNode.name) {
      line += ` ${this.yamlEscapeValueIfNeeded(ariaNode.name)}`;
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
   * Build tree from child nodes
   */
  private buildChildrenTree(
    element: Element,
    parentVisible: boolean
  ): (AriaNode | string)[] {
    const result: (AriaNode | string)[] = [];

    // Add ::before pseudo-element content
    if (parentVisible) {
      const beforeContent = this.getCSSContent(element, "::before");
      if (beforeContent) {
        result.push(beforeContent);
      }
    }

    // Handle slot elements
    if (element.nodeName === "SLOT") {
      const slot = element as HTMLSlotElement;
      const assignedNodes = slot.assignedNodes();
      if (assignedNodes.length > 0) {
        assignedNodes.forEach((child) => {
          result.push(...this.buildAriaTree(child, parentVisible));
        });

        // Add ::after content for slots
        if (parentVisible) {
          const afterContent = this.getCSSContent(element, "::after");
          if (afterContent) {
            result.push(afterContent);
          }
        }

        return result;
      }
    }

    // Process regular children
    Array.from(element.childNodes).forEach((child) => {
      if (!(child as Element).assignedSlot) {
        result.push(...this.buildAriaTree(child, parentVisible));
      }
    });

    // Process shadow DOM
    if (element.shadowRoot) {
      Array.from(element.shadowRoot.childNodes).forEach((child) => {
        result.push(...this.buildAriaTree(child, parentVisible));
      });
    }

    // Add ::after pseudo-element content
    if (parentVisible) {
      const afterContent = this.getCSSContent(element, "::after");
      if (afterContent) {
        result.push(afterContent);
      }
    }

    return result;
  }

  /**
   * Build tree from elements referenced by aria-owns
   */
  private buildAriaOwnedTree(element: Element): (AriaNode | string)[] {
    const owns = element.getAttribute("aria-owns");
    if (!owns) return [];

    const ownedElements = owns
      .split(/\s+/)
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    const result: (AriaNode | string)[] = [];
    ownedElements.forEach((owned) => {
      result.push(...this.buildAriaTree(owned, true));
    });

    return result;
  }

  /**
   * Normalize generic roles using Playwright's approach
   * Removes unnecessary generic containers that don't add semantic value
   */
  private normalizeGenericRoles(node: AriaNode): (AriaNode | string)[] {
    const result: (AriaNode | string)[] = [];

    for (const child of node.children || []) {
      if (typeof child === "string") {
        result.push(child);
        continue;
      }

      // Recursively normalize this child
      const normalized = this.normalizeGenericRoles(child);
      // Spread the result (might be [child] or child's children if child was removed)
      result.push(...normalized);
    }

    // Remove generic containers that don't add semantic value:
    // 1. Has no name (no accessible label)
    // 2. Has exactly one child (no grouping happening)
    // 3. Is not interactive (no ref)
    const removeSelf =
      node.role === "generic" && !node.name && !node.ref && result.length === 1;

    if (removeSelf) {
      return result; // Hoist children up
    }

    node.children = result;
    return [node]; // Keep this node
  }

  /**
   * Render the accessibility tree to text lines
   */
  private renderTree(
    node: AriaNode | string,
    lines: string[],
    indent: string
  ): void {
    // Handle text nodes (with YAML escaping)
    if (typeof node === "string") {
      const escapedText = this.yamlEscapeValueIfNeeded(node);
      lines.push(`${indent}- text: ${escapedText}`);
      return;
    }

    // Skip the virtual WebArea root
    if (node.role === "WebArea") {
      for (const child of node.children) {
        this.renderTree(child, lines, indent);
      }
      return;
    }

    // Build the line representation
    const line = this.buildNodeLine(node, indent);
    lines.push(line);

    // Render children with increased indentation
    for (const child of node.children) {
      this.renderTree(child, lines, indent + "  ");
    }
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

  /**
   * Extract CSS pseudo-element content (::before or ::after)
   */
  private getCSSContent(
    element: Element,
    pseudo: "::before" | "::after"
  ): string {
    const style = window.getComputedStyle(element, pseudo);
    const content = style.content;

    if (!content || content === "none" || content === "normal") {
      return "";
    }

    // Remove surrounding quotes
    let text = content.replace(/^["']|["']$/g, "");

    // Handle CSS escape sequences
    text = text.replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );

    return text;
  }

  /**
   * Escape YAML key if it contains special characters
   */
  private yamlEscapeKeyIfNeeded(key: string): string {
    // Keys with special YAML characters need quoting
    if (/[:\[\]{}#&*!|>'"%@`]/.test(key) || key.startsWith("-")) {
      return JSON.stringify(key);
    }
    return key;
  }

  /**
   * Escape YAML value if needed (special chars, numbers, booleans)
   */
  private yamlEscapeValueIfNeeded(value: string): string {
    // Values with special characters or that look like numbers/booleans
    if (!value) return '""';

    if (
      /^(true|false|null|~)$/i.test(value) ||
      /^[0-9]/.test(value) ||
      /[:\[\]{}#&*!|>'"%@`\n\r]/.test(value)
    ) {
      return JSON.stringify(value);
    }

    return value;
  }
}
