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
  InspectResult,
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

      inspect(ref: string): InspectResult {
        const info = this.elements.get(ref);
        if (!info) {
          throw new Error(`Element ${ref} not found`);
        }

        const el = info.element as HTMLElement;
        const rect = el.getBoundingClientRect();

        return {
          ref: ref,
          tagName: info.tagName,
          role: info.role,
          name: info.name,
          attributes: info.attributes,
          text: el.textContent?.trim() || "",
          visible: rect.width > 0 && rect.height > 0,
          bounds: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
          siblingIndex: DOMAnalyzer.getSiblingIndex(el),
          parentRef: DOMAnalyzer.findParentRef(el, this.elements),
        };
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
