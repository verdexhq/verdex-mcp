/**
 * Entry point for bundled bridge injection
 * Bundled and injected into a named isolated world.
 */

import { BridgeFactory } from "./bridge/BridgeFactory.js";
import type {
  BridgeConfig,
  IBridge,
  VerdexBridgeFactory,
} from "./types/index.js";

// Replaced at build time by esbuild `define`
declare const __VERSION__: string;
export const __VERDEX_BRIDGE_VERSION__ = __VERSION__;

export function createBridge(config?: BridgeConfig): IBridge {
  return BridgeFactory.create(config);
}

/**
 * Get the bridge factory from globalThis.
 * Throws if bridge is not initialized.
 */
export function getBridgeFactory(): VerdexBridgeFactory {
  const factory = globalThis.__VerdexBridgeFactory__;
  if (!factory) {
    throw new Error("Verdex bridge factory not initialized");
  }
  return factory;
}

// Expose factory to the *named isolated world* only
(function expose() {
  // Type-check the factory shape without widening, then freeze for runtime immutability
  const factory = Object.freeze({
    create: createBridge,
    version: __VERDEX_BRIDGE_VERSION__,
  } satisfies VerdexBridgeFactory);

  // Check for existing factory and handle version drift
  const existing = globalThis.__VerdexBridgeFactory__;

  // Only update if:
  // 1. No factory exists yet, OR
  // 2. Version has changed (allows HMR/upgrades while maintaining stability)
  if (!existing || existing.version !== __VERDEX_BRIDGE_VERSION__) {
    // Delete old property if it exists (required because configurable: true)
    if (existing) {
      delete (globalThis as any).__VerdexBridgeFactory__;
    }

    // Define the property: non-enumerable, non-writable, but configurable for future updates
    Object.defineProperty(globalThis, "__VerdexBridgeFactory__", {
      value: factory,
      writable: false, // Prevent accidental reassignment
      enumerable: false, // Don't leak in for...in or Object.keys()
      configurable: true, // Allow redefinition for version upgrades/testing
    });
  }
})();
