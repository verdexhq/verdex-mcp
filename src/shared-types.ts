/**
 * Shared types used across the browser-Node.js boundary.
 * These types are JSON-serializable and used by both the injected bridge
 * and the Node.js runtime.
 */

/**
 * Filtered attributes that are most relevant for element identification and selection.
 * These are the attributes we extract from DOM elements during exploration.
 */
export type Attributes = {
  class?: string;
  id?: string;
  "data-testid"?: string;
  role?: string;
  "aria-label"?: string;
};

// ============================================================================
// resolve_container types
// ============================================================================

/**
 * Information about an ancestor container element in the DOM hierarchy.
 * Used by the resolve_container tool to describe the containment chain.
 */
export type ContainerInfo = {
  level: number; // How many levels up from target (1 = direct parent)
  tagName: string;
  attributes: Attributes; // Only relevant attributes, not all
  childElements: number; // Total child element count
  containsRefs: string[]; // Interactive element refs (e1, e2, etc.) contained within
};

/**
 * Result of resolving an element's container hierarchy.
 * Returned by the resolve_container tool/method.
 */
export type ContainerResult = {
  target: {
    ref: string; // Interactive element ref (e.g., "e1", "e2")
    tagName: string;
    text: string;
  };
  ancestors: ContainerInfo[]; // Container chain from direct parent to document root
};

// ============================================================================
// inspect_pattern types
// ============================================================================

/**
 * Outline item providing quick visual cues about element content.
 * Used within PatternInfo to help identify unique elements.
 */
export type OutlineItem = {
  /** Either ARIA role (preferred) or HTML tag */
  role?: string;
  tag?: string;
  /** Human-visible label/text (trimmed) */
  text?: string;
  /** data-testid if present */
  testid?: string;
};

/**
 * Information about a sibling element at a specific hierarchy level.
 * Used by the inspect_pattern tool to describe repeating patterns.
 */
export type PatternInfo = {
  index: number; // Position among siblings
  tagName: string;
  attributes: Attributes;
  containsRefs: string[]; // Interactive element refs within this sibling
  containsText: string[]; // Meaningful text content (headings, buttons, links)
  outline?: OutlineItem[]; // Shallow, typed cues for quick uniqueness checks
};

/**
 * Result of analyzing sibling patterns at a specific container level.
 * Returned by the inspect_pattern tool/method.
 */
export type PatternResult = {
  ancestorLevel: number; // Which ancestor level was analyzed
  containerAt: {
    tagName: string;
    attributes: Attributes;
  };
  /**
   * Index of the container's child that lies on the path to `ref`
   * (i.e., the "unit" sibling containing the target at this level).
   * Null if it cannot be determined.
   * Note: Only defined for ancestorLevel >= 1.
   */
  targetSiblingIndex: number | null;
  siblings: PatternInfo[]; // All sibling patterns at this level
};

// ============================================================================
// extract_anchors types
// ============================================================================

/**
 * Information about a descendant element (recursive tree structure).
 * Used by the extract_anchors tool to describe element hierarchy within a container.
 */
export type AnchorInfo = {
  depth: number;
  index: number;
  tagName: string;
  attributes: Attributes;
  ref?: string;
  role?: string;
  name?: string;
  directText?: string;
  fullText?: string;
  childCount?: number;
  descendants?: AnchorInfo[]; // Recursive: nested descendants
};

/**
 * Result of extracting descendant anchors within a specific container.
 * Returned by the extract_anchors tool/method.
 */
export type AnchorsResult = {
  error?: string;
  ancestorAt: {
    level: number; // Which ancestor level was analyzed
    tagName: string;
    attributes: Attributes;
  } | null;
  descendants: AnchorInfo[]; // Tree of descendant elements
  totalDescendants: number;
  maxDepthReached: number;
};

// ============================================================================
// Snapshot types
// ============================================================================

/**
 * Basic snapshot result containing page text and element count.
 * Used by the snapshot operation.
 */
export type SnapshotResult = {
  text: string;
  elementCount: number;
};

/**
 * Metadata about a navigation operation.
 * Included in Snapshot when navigation occurs.
 */
export type NavigationMetadata = {
  success: boolean;
  requestedUrl: string;
  finalUrl: string;
  pageTitle: string;
  statusCode?: number;
  loadTime: number; // in milliseconds
  redirectCount?: number;
  contentType?: string;
  timestamp: number; // when navigation completed
};

/**
 * Enhanced snapshot with optional navigation metadata.
 * Used by the Node.js runtime to track page state and navigation.
 */
export type Snapshot = {
  text: string;
  elementCount: number;
  navigation?: NavigationMetadata; // Optional - only present after navigation
  isolatedWorldInfo?: {
    sessionId?: string;
    worldType?: string;
    isolatedWorldId?: number;
  };
};
