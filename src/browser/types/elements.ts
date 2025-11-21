/**
 * Element-related types for the injected bridge.
 *
 * Most types are re-exported from the shared types module to ensure
 * consistency across the browser-Node.js boundary.
 */

// Re-export all shared types used by the bridge
export type {
  Attributes,
  ContainerInfo,
  ContainerResult,
  OutlineItem,
  PatternInfo,
  PatternResult,
  AnchorInfo,
  AnchorsResult,
  SnapshotResult,
} from "../../shared-types.js";

// Re-export error classes (not 'type' because they're runtime classes)
export { StaleRefError, UnknownRefError } from "../../shared-types.js";

/**
 * Browser-specific: Information about an interactive element in the browser context.
 * This version uses the actual DOM Element type rather than 'any'.
 */
export type ElementInfo = {
  element: Element; // Browser DOM Element (not 'any' like Node runtime version)
  tagName: string;
  role: string;
  name: string;
  attributes: Record<string, string>;
};
