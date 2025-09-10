import { BrowserContext, CDPSession, Page } from "puppeteer";

/**
 * Represents information about an interactive element stored in the browser context.
 * This interface ensures type safety for element data stored in the bridge's element map.
 */
export interface ElementInfo {
  element: any; // Will be the actual DOM element in browser context
  tagName: string; // HTML tag name
  role: string; // ARIA role or semantic role of the element
  name: string; // Accessible name of the element
  selector: string; // Best selector for finding this element
  attributes: Record<string, string>; // Element attributes
  siblingIndex: number; // Index among siblings
  parentRef: string | null; // Reference to parent interactive element
}

/**
 * Structure of the bridge object injected into browser context.
 * Stores element references and maintains counter for unique IDs.
 */
export interface BridgeData {
  elements: Map<string, ElementInfo>; // Map of ref -> element info
  counter: number; // Counter for generating unique element references
}

// Extend Window to include our bridge
declare global {
  interface Window {
    __bridge: BridgeData;
    __explorationHelpers?: {
      getRelevantAttributes: (element: Element) => Attributes;
      findContainedRefs: (container: Element) => string[];
      extractMeaningfulTexts: (element: Element) => string[];
    };
  }
}

export interface NavigationMetadata {
  success: boolean;
  requestedUrl: string;
  finalUrl: string;
  pageTitle: string;
  statusCode?: number;
  loadTime: number; // in milliseconds
  redirectCount?: number;
  contentType?: string;
  timestamp: number; // when navigation completed
}

export interface Snapshot {
  text: string;
  elementCount: number;
  navigation?: NavigationMetadata; // Optional - only present after navigation
  isolatedWorldInfo?: {
    sessionId?: string;
    worldType?: string;
    isolatedWorldId?: number;
  };
}

/**
 * Filtered attributes that are most relevant for element identification and selection.
 * These are the attributes we extract from DOM elements during exploration.
 */
export interface Attributes {
  class?: string;
  id?: string;
  "data-testid"?: string;
  role?: string;
  "aria-label"?: string;
}

/**
 * Information about an ancestor element in the DOM hierarchy.
 * Includes both interactive and non-interactive elements.
 */
export interface AncestorInfo {
  level: number; // How many levels up from target (1 = direct parent)
  tagName: string;
  attributes: Attributes; // Only relevant attributes, not all
  childElements: number; // Total child element count
  containsRefs: string[]; // Interactive element refs (e1, e2, etc.) contained within
}

/**
 * Result of getting an element's ancestry chain.
 */
export interface GetAncestorsResult {
  target: {
    ref: string; // Interactive element ref (e.g., "e1", "e2")
    tagName: string;
    text: string;
  };
  ancestors: AncestorInfo[];
}

/**
 * Information about a sibling element at a specific hierarchy level.
 */
export interface SiblingInfo {
  index: number; // Position among siblings of same type
  tagName: string;
  attributes: Attributes;
  containsRefs: string[]; // Interactive element refs within this sibling
  containsText: string[]; // Meaningful text content (headings, buttons, links)
}

/**
 * Result of analyzing siblings at a specific ancestor level.
 */
export interface GetSiblingsResult {
  ancestorLevel: number; // Which ancestor level was analyzed
  siblings: SiblingInfo[];
}

/**
 * Content found within a descendant element.
 */
export interface DescendantContent {
  ref?: string; // Interactive element ref, if this element has one
  tagName: string;
  text?: string; // For headings, buttons, links
  role?: string; // ARIA role, if element has an interactive ref
  childCount?: number; // For containers, number of child elements
}

/**
 * Information about a child element within an ancestor.
 */
export interface DescendantInfo {
  tagName: string;
  attributes: Attributes;
  contains: DescendantContent[]; // What's inside this descendant (2 levels deep max)
}

/**
 * Result of analyzing descendants within a specific ancestor.
 */
export interface GetDescendantsResult {
  ancestorAt: {
    level: number; // Which ancestor level was analyzed
    tagName: string;
    attributes: Attributes;
  };
  descendants: DescendantInfo[];
}

// Multi-role interfaces
export interface RoleContext {
  role: string;
  browserContext: BrowserContext;
  page: Page;
  cdpSession: CDPSession;
  isolatedWorldId: number | null;
  bridgeObjectId: string | null;
  mainFrameId: string;
  defaultUrl?: string;
  createdAt: number;
  lastUsed: number;
  hasNavigated: boolean; // Track if this context has been navigated
  storageStatePath?: string; // NEW: Path to Playwright storage state file
}

export interface RoleConfig {
  authPath: string;
  defaultUrl?: string; // Optional - for backward compatibility
}

export interface RolesConfiguration {
  roles: Record<string, RoleConfig>;
}
