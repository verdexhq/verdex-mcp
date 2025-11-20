/**
 * Node.js runtime-specific types.
 * These types are NOT shared with the browser context and may contain
 * Node/Puppeteer-specific types.
 */

import { BrowserContext, CDPSession, Page } from "puppeteer";

/**
 * Represents information about an interactive element stored in the Node.js runtime.
 * This is different from the browser-side ElementInfo which has actual DOM Elements.
 *
 * AUDIT RESULTS (2025-11-20):
 * - selector: NOT USED (removed)
 * - siblingIndex: NOT USED (removed)
 * - parentRef: NOT USED (removed)
 *
 * Note: This type is currently unused in the runtime layer. It may be used in
 * future phases for element tracking or caching. For now, we rely on the bridge's
 * in-browser ElementInfo map.
 */
export type ElementInfo = {
  element: any; // Will be the actual DOM element reference in browser context
  tagName: string; // HTML tag name
  role: string; // ARIA role or semantic role of the element
  name: string; // Accessible name of the element
  attributes: Record<string, string>; // Element attributes
};

/**
 * Entry in the global ref index for multi-frame element tracking.
 */
export type RefIndexEntry = {
  frameId: string;
  localRef: string;
};

/**
 * Global index mapping global refs to their frame-local refs.
 */
export type GlobalRefIndex = Map<string, RefIndexEntry>;

/**
 * Context for a specific role in multi-role browser management.
 * Contains all the Puppeteer resources needed for a role-specific browser session.
 */
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

  // NEW: Multi-frame state
  refIndex?: GlobalRefIndex;
  navigationTimestamp?: number;

  // Error recovery
  lastErrorSnapshot?: any; // Snapshot type (avoid circular import)
};

/**
 * Configuration for a single role.
 */
export type RoleConfig = {
  authPath: string;
  defaultUrl?: string; // Optional - for backward compatibility
};

/**
 * Complete roles configuration structure.
 * Parsed from YAML/JSON configuration files.
 */
export type RolesConfiguration = {
  roles: Record<string, RoleConfig>;
};
