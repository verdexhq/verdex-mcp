#!/usr/bin/env node

/**
 * Test runner for Multi-Role Browser MCP Server
 * Run with: node test-mrb-mcp-server.mjs
 */

import { testMultiRoleBrowserBridge } from "./src/test-target/tests/mrb-mcp-server.test.js";

console.log("🚀 Starting Multi-Role Browser MCP Server Test Suite\n");
console.log("=".repeat(60));

try {
  const results = await testMultiRoleBrowserBridge();

  console.log("=".repeat(60));
  console.log("\n🏁 Test Suite Completed!");

  if (results.failed === 0) {
    console.log("🎉 All tests passed!");
    process.exit(0);
  } else {
    console.log(
      `❌ ${results.failed} test(s) failed out of ${
        results.passed + results.failed
      } total`
    );
    process.exit(1);
  }
} catch (error) {
  console.error("💥 Test suite crashed:", error.message);
  console.error(error.stack);
  process.exit(1);
}
