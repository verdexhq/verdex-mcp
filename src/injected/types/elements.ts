/**
 * Element-related types for the injected bridge
 */

export type ElementInfo = {
  element: Element;
  tagName: string;
  role: string;
  name: string;
  attributes: Record<string, string>;
};

export type SnapshotResult = {
  text: string;
  elementCount: number;
};

export type InspectResult = {
  ref: string;
  tagName: string;
  role: string;
  name: string;
  attributes: Record<string, string>;
  text: string;
  visible: boolean;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  siblingIndex: number;
  parentRef: string | null;
};

export type AncestorInfo = {
  level: number;
  tagName: string;
  attributes: Record<string, string>;
  childElements: number;
  containsRefs: string[];
};

export type AncestorsResult = {
  target: {
    ref: string;
    tagName: string;
    text: string;
  };
  ancestors: AncestorInfo[];
};

export type OutlineItem = {
  /** Either ARIA role (preferred) or HTML tag */
  role?: string;
  tag?: string;
  /** Human-visible label/text (trimmed) */
  text?: string;
  /** data-testid if present */
  testid?: string;
};

export type SiblingInfo = {
  index: number;
  tagName: string;
  attributes: Record<string, string>;
  containsText: string[];
  /** Shallow, typed cues for quick uniqueness checks (e.g., headings, buttons, testids) */
  outline?: OutlineItem[];
};

export type SiblingsResult = {
  ancestorLevel: number;
  containerAt: {
    tagName: string;
    attributes: Record<string, string>;
  };
  /**
   * Index of the container's child that lies on the path to `ref`
   * (i.e., the "unit" sibling containing the target at this level).
   * Null if it cannot be determined.
   * Note: Only defined for ancestorLevel >= 1.
   */
  targetSiblingIndex: number | null;
  siblings: SiblingInfo[];
};

export type DescendantInfo = {
  depth: number;
  index: number;
  tagName: string;
  attributes: Record<string, string>;
  ref?: string;
  role?: string;
  name?: string;
  directText?: string;
  fullText?: string;
  childCount?: number;
  descendants?: DescendantInfo[];
};

export type DescendantsResult = {
  error?: string;
  ancestorAt: {
    level: number;
    tagName: string;
    attributes: Record<string, string>;
  } | null;
  descendants: DescendantInfo[];
  totalDescendants: number;
  maxDepthReached: number;
};
