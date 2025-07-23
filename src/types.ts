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
  }
}

export interface Snapshot {
  text: string;
  elementCount: number;
}
