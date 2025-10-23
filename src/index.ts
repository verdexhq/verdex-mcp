#!/usr/bin/env node

import { realpathSync } from "fs";
import { fileURLToPath } from "url";
import { VerdexMCPServer } from "./server/VerdexMCPServer.js";

// Start the server if this module is executed as the entrypoint (npx/cli)
const isDirectExecution = (() => {
  if (typeof process === "undefined" || !Array.isArray(process.argv))
    return false;
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    const resolvedArgv1 = realpathSync(argv1);
    return fileURLToPath(import.meta.url) === resolvedArgv1;
  } catch {
    return fileURLToPath(import.meta.url) === argv1;
  }
})();

if (isDirectExecution) {
  const server = new VerdexMCPServer();
  server.run().catch(console.error);
}

// Export main server class
export { VerdexMCPServer } from "./server/VerdexMCPServer.js";

// Export global type - this automatically loads the global augmentation
// Consumers get globalThis.__VerdexBridgeFactory__ types when they import from this package
export type { VerdexBridgeFactory } from "./browser/types/global.js";
