/**
 * Factory for creating the complete bridge object with all functionality
 */

import { SnapshotGenerator } from "../core/SnapshotGenerator.js";
import { StructuralAnalyzer } from "../core/StructuralAnalyzer.js";
import { DOMAnalyzer } from "../utils/DOMAnalyzer.js";
import type {
  IBridge,
  ElementInfo,
  SnapshotResult,
  AncestorsResult,
  SiblingsResult,
  DescendantsResult,
  BridgeConfig,
} from "../types/index.js";

export class BridgeFactory {
  /**
   * Create a complete bridge object with all functionality
   */
  static create(config: BridgeConfig = {}): IBridge {
    const bridge: IBridge = {
      elements: new Map<string, ElementInfo>(),
      counter: 0,

      // Core functionality
      snapshot(): SnapshotResult {
        const generator = new SnapshotGenerator(this, config);
        return generator.generate();
      },

      click(ref: string): void {
        const info = this.elements.get(ref);
        if (!info) {
          throw new Error(`Element ${ref} not found`);
        }
        (info.element as HTMLElement).click();
      },

      type(ref: string, text: string): void {
        const info = this.elements.get(ref);
        if (!info) {
          throw new Error(`Element ${ref} not found`);
        }

        const el = info.element as HTMLInputElement | HTMLTextAreaElement;
        el.focus();
        el.value = text;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      },

      // Structural analysis
      get_ancestors(ref: string): AncestorsResult | null {
        const analyzer = new StructuralAnalyzer(this, config);
        return analyzer.getAncestors(ref);
      },

      get_siblings(ref: string, ancestorLevel: number): SiblingsResult | null {
        const analyzer = new StructuralAnalyzer(this, config);
        return analyzer.getSiblings(ref, ancestorLevel);
      },

      get_descendants(ref: string, ancestorLevel: number): DescendantsResult {
        const analyzer = new StructuralAnalyzer(this, config);
        return analyzer.getDescendants(ref, ancestorLevel);
      },

      // Utility methods
      getAttributes(element: Element): Record<string, string> {
        return DOMAnalyzer.getAllAttributes(element);
      },
    };

    return bridge;
  }
}
