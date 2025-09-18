/**
 * Generates the complete code for injection into isolated worlds
 */

import { AriaUtils } from "./utils/AriaUtils.js";
import { DOMAnalyzer } from "./utils/DOMAnalyzer.js";
import { SnapshotGenerator } from "./core/SnapshotGenerator.js";
import { StructuralAnalyzer } from "./core/StructuralAnalyzer.js";
import { BridgeFactory } from "./bridge/BridgeFactory.js";

/**
 * Serialize a class to string for injection
 */
function serializeClass(cls: any): string {
  return cls.toString();
}

export function injectedCode(): string {
  // Serialize all utility classes
  const utils = [
    serializeClass(AriaUtils),
    serializeClass(DOMAnalyzer),
    serializeClass(SnapshotGenerator),
    serializeClass(StructuralAnalyzer),
    serializeClass(BridgeFactory),
  ].join("\n\n");

  return `
    (() => {
      ${utils}
      
      // Create and return the bridge using the factory
      return BridgeFactory.create();
    })()
  `;
}
