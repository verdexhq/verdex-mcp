/**
 * Export all types for the injected bridge
 */

export type {
  Attributes,
  ElementInfo,
  SnapshotResult,
  ContainerInfo,
  ContainerResult,
  OutlineItem,
  PatternInfo,
  PatternResult,
  AnchorInfo,
  AnchorsResult,
} from "./elements.js";

// Re-export error classes as values (not types)
export { StaleRefError, UnknownRefError } from "./elements.js";

export type { IBridge, BridgeConfig } from "./bridge.js";
export type { VerdexBridgeFactory } from "./global.js";
