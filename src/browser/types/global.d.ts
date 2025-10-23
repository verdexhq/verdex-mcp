/**
 * Global type augmentation for the bridge factory
 * This provides type safety when accessing globalThis.__VerdexBridgeFactory__
 */

import type { BridgeConfig, IBridge } from "./index.js";

/**
 * The bridge factory that gets injected into the isolated world's globalThis.
 * Readonly to prevent accidental mutation.
 */
export type VerdexBridgeFactory = Readonly<{
  create: (config?: BridgeConfig) => IBridge;
  version: string;
}>;

declare global {
  /**
   * Bridge factory available in isolated world's globalThis.
   * Undefined until bridge is injected.
   */
  var __VerdexBridgeFactory__: VerdexBridgeFactory | undefined;
}
