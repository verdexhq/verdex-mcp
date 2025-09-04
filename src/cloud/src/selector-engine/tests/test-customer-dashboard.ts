// Test script for the selector engine using customer-dashboard.page.ts
import { handlePayload } from "./handle-payload";
import * as path from "path";

async function testCustomerDashboard() {
  try {
    console.log(
      "🧪 Testing Selector Engine with Customer Dashboard Page Object"
    );
    console.log("=".repeat(60));

    // File paths
    const currentDir = path.dirname(new URL(import.meta.url).pathname);
    const pageObjectFile = path.resolve(
      currentDir,
      "../../../../customer-dashboard.page.ts"
    );
    const authFile = path.resolve(currentDir, "../../../.auth/customer.json");
    const testUrl = "https://cs-fit.staging01.joinzipper.com";

    console.log(`📄 Page Object: ${path.basename(pageObjectFile)}`);
    console.log(`🔐 Auth File: ${path.basename(authFile)}`);
    console.log(`🌐 Test URL: ${testUrl}`);
    console.log("");

    // Check if files exist
    const fs = await import("fs");
    if (!fs.existsSync(pageObjectFile)) {
      console.error(`❌ Page object file not found: ${pageObjectFile}`);
      return;
    }

    if (!fs.existsSync(authFile)) {
      console.error(`❌ Auth file not found: ${authFile}`);
      console.log("💡 Make sure you have a customer.json auth state file");
      return;
    }

    console.log("🚀 Running selector tests...");
    console.log("");

    const startTime = Date.now();
    const result = await handlePayload(pageObjectFile, authFile, testUrl);
    const duration = Date.now() - startTime;

    // Display results
    console.log("📊 RESULTS");
    console.log("=".repeat(30));
    console.log(`File: ${result.file}`);
    console.log(`URL: ${result.url}`);
    console.log(`Total selectors: ${result.summary.total}`);
    console.log(`✅ Successful: ${result.summary.successful}`);
    console.log(`❌ Failed: ${result.summary.failed}`);
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log("");

    if (result.summary.successful > 0) {
      const successRate = Math.round(
        (result.summary.successful / result.summary.total) * 100
      );
      console.log(`🎯 Success Rate: ${successRate}%`);
      console.log("");
    }

    if (result.errors.length > 0) {
      console.log("🔍 FAILED SELECTORS");
      console.log("=".repeat(30));

      // Group errors by type
      const errorsByType = result.errors.reduce((acc, error) => {
        if (!acc[error.error_type]) acc[error.error_type] = [];
        acc[error.error_type].push(error);
        return acc;
      }, {} as Record<string, typeof result.errors>);

      Object.entries(errorsByType).forEach(([errorType, errors]) => {
        console.log(`\n📋 ${errorType.toUpperCase()} (${errors.length})`);
        console.log("-".repeat(20));

        errors.forEach((error, index) => {
          console.log(`${index + 1}. ${error.name} (line ${error.line})`);
          console.log(`   Selector: ${error.selector}`);
          console.log(`   Message: ${error.error_message}`);
          if (error.element_count) {
            console.log(`   Elements found: ${error.element_count}`);
          }
          console.log("");
        });
      });

      // Provide LLM-style debugging suggestions
      console.log("💡 DEBUGGING SUGGESTIONS");
      console.log("=".repeat(30));

      const timeoutErrors = result.errors.filter(
        (e) => e.error_type === "timeout_error"
      );
      const ambiguousErrors = result.errors.filter(
        (e) => e.error_type === "ambiguous_selector"
      );
      const invalidErrors = result.errors.filter(
        (e) => e.error_type === "invalid_selector"
      );

      if (timeoutErrors.length > 0) {
        console.log(`🔍 ${timeoutErrors.length} timeout errors detected:`);
        console.log("   → Use browser_snapshot() to see current page state");
        console.log(
          "   → Use get_ancestors() on working elements to find correct containers"
        );
        console.log("");
      }

      if (ambiguousErrors.length > 0) {
        console.log(
          `⚠️  ${ambiguousErrors.length} ambiguous selectors detected:`
        );
        console.log("   → Use get_siblings() to understand element patterns");
        console.log(
          "   → Add .first() or .filter() to make selectors more specific"
        );
        console.log("");
      }

      if (invalidErrors.length > 0) {
        console.log(`❌ ${invalidErrors.length} invalid selectors detected:`);
        console.log("   → Use get_descendants() to explore element structure");
        console.log(
          "   → Check Playwright documentation for valid roles/methods"
        );
        console.log("");
      }
    } else {
      console.log("🎉 All selectors passed! Page object is working correctly.");
    }
  } catch (error) {
    console.error("💥 Test failed with error:");
    console.error(error);

    if (error instanceof Error) {
      if (error.message.includes("ENOENT")) {
        console.log("\n💡 File not found. Check your file paths.");
      } else if (error.message.includes("net::")) {
        console.log(
          "\n💡 Network error. Check your internet connection and URL."
        );
      } else if (error.message.includes("auth")) {
        console.log("\n💡 Authentication error. Check your auth state file.");
      }
    }
  }
}

// Run the test if this file is executed directly
// ES module check for direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  testCustomerDashboard()
    .then(() => {
      console.log("\n✨ Test completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Test failed:", error);
      process.exit(1);
    });
}

export { testCustomerDashboard };
