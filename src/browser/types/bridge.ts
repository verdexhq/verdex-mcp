/**
 * Bridge interface and related types
 */

import type {
  ElementInfo,
  SnapshotResult,
  ContainerResult,
  PatternResult,
  AnchorsResult,
} from "./elements.js";

export type IBridge = {
  elements: Map<string, ElementInfo>;
  counter: number;

  // Core functionality
  snapshot(): SnapshotResult;
  click(ref: string): void;
  type(ref: string, text: string): void;

  // Structural analysis (all throw on error, never return null)
  resolve_container(ref: string): ContainerResult;
  inspect_pattern(ref: string, ancestorLevel: number): PatternResult;
  extract_anchors(ref: string, ancestorLevel: number): AnchorsResult;

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
