/**
 * Bridge interface and related types
 */

import type {
  ElementInfo,
  SnapshotResult,
  InspectResult,
  AncestorsResult,
  SiblingsResult,
  DescendantsResult,
} from "./elements.js";

export interface IBridge {
  elements: Map<string, ElementInfo>;
  counter: number;

  // Core functionality
  snapshot(): SnapshotResult;
  click(ref: string): void;
  type(ref: string, text: string): void;
  inspect(ref: string): InspectResult;

  // Structural analysis
  get_ancestors(ref: string): AncestorsResult | null;
  get_siblings(ref: string, ancestorLevel: number): SiblingsResult | null;
  get_descendants(ref: string, ancestorLevel: number): DescendantsResult;

  // Utility methods
  getAttributes(element: Element): Record<string, string>;
}

export interface BridgeConfig {
  maxDepth?: number;
  maxSiblings?: number;
  maxDescendants?: number;
}
