import { BrowserContext, CDPSession, Page } from "puppeteer";

/**
 * Represents information about an interactive element stored in the browser context.
 * This type ensures type safety for element data stored in the bridge's element map.
 */
export type ElementInfo = {
  element: any; // Will be the actual DOM element in browser context
  tagName: string; // HTML tag name
  role: string; // ARIA role or semantic role of the element
  name: string; // Accessible name of the element
  selector: string; // Best selector for finding this element
  attributes: Record<string, string>; // Element attributes
  siblingIndex: number; // Index among siblings
  parentRef: string | null; // Reference to parent interactive element
};

/**
 * Result of inspecting a specific element.
 * This is returned by the bridge's inspect() method and matches the injected InspectResult type.
 */
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

/**
 * Information about an ancestor element in the DOM hierarchy.
 * Includes both interactive and non-interactive elements.
 */
export type AncestorInfo = {
  level: number; // How many levels up from target (1 = direct parent)
  tagName: string;
  attributes: Attributes; // Only relevant attributes, not all
  childElements: number; // Total child element count
  containsRefs: string[]; // Interactive element refs (e1, e2, etc.) contained within
};

/**
 * Result of getting an element's ancestry chain.
 */
export type GetAncestorsResult = {
  target: {
    ref: string; // Interactive element ref (e.g., "e1", "e2")
    tagName: string;
    text: string;
  };
  ancestors: AncestorInfo[];
};

/**
 * Information about a sibling element at a specific hierarchy level.
 */
export type SiblingInfo = {
  index: number; // Position among siblings of same type
  tagName: string;
  attributes: Attributes;
  containsRefs: string[]; // Interactive element refs within this sibling
  containsText: string[]; // Meaningful text content (headings, buttons, links)
};

/**
 * Result of analyzing siblings at a specific ancestor level.
 */
export type GetSiblingsResult = {
  ancestorLevel: number; // Which ancestor level was analyzed
  siblings: SiblingInfo[];
};

/**
 * Information about a descendant element (recursive tree structure)
 */
export type DescendantInfo = {
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
  descendants?: DescendantInfo[]; // Recursive: nested descendants
};

/**
 * Result of analyzing descendants within a specific ancestor.
 */
export type GetDescendantsResult = {
  error?: string;
  ancestorAt: {
    level: number; // Which ancestor level was analyzed
    tagName: string;
    attributes: Attributes;
  } | null;
  descendants: DescendantInfo[];
  totalDescendants: number;
  maxDepthReached: number;
};

// Multi-role interfaces
export type RoleContext = {
  role: string;
  browserContext: BrowserContext;
  page: Page;
  cdpSession: CDPSession;
  bridgeInjector: any; // BridgeInjector from runtime module (avoid circular import)
  mainFrameId: string;
  defaultUrl?: string;
  createdAt: number;
  lastUsed: number;
  hasNavigated: boolean; // Track if this context has been navigated
  storageStatePath?: string; // Optional: Path to Playwright storage state file
};

export type RoleConfig = {
  authPath: string;
  defaultUrl?: string; // Optional - for backward compatibility
};

export type RolesConfiguration = {
  roles: Record<string, RoleConfig>;
};
