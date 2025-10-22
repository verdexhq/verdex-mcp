/**
 * Entry point for bundled bridge injection
 * Bundled and injected into a named isolated world.
 */

import { BridgeFactory } from "./bridge/BridgeFactory.js";
import type { BridgeConfig, IBridge } from "./types/index.js";

// Replaced at build time by esbuild `define`
declare const __VERSION__: string;
export const __VERDEX_BRIDGE_VERSION__ = __VERSION__;

export function createBridge(config?: BridgeConfig): IBridge {
  return BridgeFactory.create(config);
}

// Expose factory to the *named isolated world* only
(function expose() {
  const g = globalThis as any;
  g.__VerdexBridgeFactory__ = {
    create: createBridge,
    version: __VERDEX_BRIDGE_VERSION__,
  };
})();
