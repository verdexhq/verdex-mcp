/**
 * Element-related types for the injected bridge
 */

export interface ElementInfo {
  element: Element;
  tagName: string;
  role: string;
  name: string;
  attributes: Record<string, string>;
}

export interface SnapshotResult {
  text: string;
  elementCount: number;
}

export interface InspectResult {
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
}

export interface AncestorInfo {
  level: number;
  tagName: string;
  attributes: Record<string, string>;
  childElements: number;
  containsRefs: string[];
}

export interface AncestorsResult {
  target: {
    ref: string;
    tagName: string;
    text: string;
  };
  ancestors: AncestorInfo[];
}

export interface SiblingInfo {
  index: number;
  tagName: string;
  isTargetType: boolean;
  attributes: Record<string, string>;
  containsRefs: string[];
  containsText: string[];
}

export interface SiblingsResult {
  ancestorLevel: number;
  siblings: SiblingInfo[];
}

export interface DescendantInfo {
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
}

export interface DescendantsResult {
  error?: string;
  ancestorAt: {
    level: number;
    tagName: string;
    attributes: Record<string, string>;
  } | null;
  descendants: DescendantInfo[];
  totalDescendants: number;
  maxDepthReached: number;
}
