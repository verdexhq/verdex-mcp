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
  ContainerResult,
  PatternResult,
  AnchorsResult,
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
      resolve_container(ref: string): ContainerResult | null {
        const analyzer = new StructuralAnalyzer(this, config);
        return analyzer.resolveContainer(ref);
      },

      inspect_pattern(
        ref: string,
        ancestorLevel: number
      ): PatternResult | null {
        const analyzer = new StructuralAnalyzer(this, config);
        return analyzer.inspectPattern(ref, ancestorLevel);
      },

      extract_anchors(ref: string, ancestorLevel: number): AnchorsResult {
        const analyzer = new StructuralAnalyzer(this, config);
        return analyzer.extractAnchors(ref, ancestorLevel);
      },

      // Utility methods
      getAttributes(element: Element): Record<string, string> {
        return DOMAnalyzer.getAllAttributes(element);
      },
    };

    return bridge;
  }
}
