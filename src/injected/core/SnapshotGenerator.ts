/**
 * Generates accessibility tree snapshots from DOM elements
 */

import { AriaUtils } from "../utils/AriaUtils.js";
import { DOMAnalyzer } from "../utils/DOMAnalyzer.js";
import type {
  IBridge,
  SnapshotResult,
  ElementInfo,
  BridgeConfig,
} from "../types/index.js";

export class SnapshotGenerator {
  private bridge: IBridge;
  private config: BridgeConfig;

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

      const lines: string[] = [];
      this.processElement(document.body, lines, "");

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
   * Process a single element and its children recursively
   */
  private processElement(
    element: Element,
    lines: string[],
    indent: string
  ): void {
    // Skip elements that shouldn't be included in the accessibility tree
    if (!AriaUtils.shouldInclude(element)) {
      // Still process children in case they should be included
      Array.from(element.children).forEach((child) => {
        this.processElement(child, lines, indent);
      });
      return;
    }

    const role = AriaUtils.getRole(element);
    const name = AriaUtils.getName(element);

    // Build the line representation
    let line = `${indent}- ${role}`;
    if (name) {
      line += ` "${name}"`;
    }

    // Add reference for interactive elements
    if (AriaUtils.isInteractive(element, role)) {
      const ref = `e${++this.bridge.counter}`;
      line += ` [ref=${ref}]`;

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

    lines.push(line);

    // Process children with increased indentation
    Array.from(element.children).forEach((child) => {
      this.processElement(child, lines, indent + "  ");
    });
  }
}
