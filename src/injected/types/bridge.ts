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

export type IBridge = {
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
};

export type BridgeConfig = {
  /** Maximum depth to traverse when analyzing descendants (default: 4) */
  maxDepth?: number;
  /** Maximum number of siblings to analyze at each level (default: 15) */
  maxSiblings?: number;
  /** Maximum total number of descendants to process (default: 100) */
  maxDescendants?: number;
  /** Maximum number of outline items per sibling (default: 6) */
  maxOutlineItems?: number;
};

export type InjectorOptions = {
  worldName?: string;
  config?: BridgeConfig;
  mainFrameId?: string;
};
