#!/usr/bin/env node

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test script to verify the hybrid Playwright config discovery functionality
 */
class HybridPlaywrightDiscoveryTest {
  constructor() {
    this.playwrightRoles = new Map();
  }

  async testConfigParsing() {
    console.log("🧪 Testing Hybrid Playwright Config Discovery");
    console.log("==============================================");

    const configPath = path.join(__dirname, "src", "test-playwrightconfig.ts");
    console.log(`📁 Config path: ${configPath}`);

    // Check if file exists
    try {
      await fs.access(configPath);
      console.log("✅ Config file exists");
    } catch (error) {
      console.log("❌ Config file not found:", error.message);
      return;
    }

    // Test our hybrid parsing method
    await this.parseConfigFile(configPath);

    // Show results
    console.log("\n📊 Discovery Results:");
    console.log("====================");
    console.log(`Found ${this.playwrightRoles.size} roles:`);

    for (const [roleName, authPath] of this.playwrightRoles.entries()) {
      console.log(`  • ${roleName} → ${authPath}`);

      // Check if auth file exists
      try {
        await fs.access(authPath);
        console.log(`    ✅ Auth file exists`);
      } catch (error) {
        console.log(`    ⚠️  Auth file missing: ${error.message}`);
      }
    }

    if (this.playwrightRoles.size === 0) {
      console.log("❌ No roles discovered - need to debug parsing logic");
    } else {
      console.log("✅ Hybrid role discovery successful!");
    }
  }

  /**
   * Hybrid approach: try dynamic import first, fallback to text parsing
   */
  async parseConfigFile(configPath) {
    console.log(
      `🔧 Loading Playwright config from: ${path.basename(configPath)}`
    );

    // Try dynamic import first (works for .js files)
    const config = await this._tryDynamicImport(configPath);
    if (config) {
      await this._parseConfigObject(config, configPath);
      return;
    }

    // Fallback: Simple text parsing for .ts files
    console.log(`⚠️  Dynamic import failed, trying text parsing...`);
    await this._parseConfigText(configPath);
  }

  async _tryDynamicImport(configPath) {
    try {
      const absoluteConfigPath = path.resolve(configPath);
      const configUrl = `file://${absoluteConfigPath}`;
      const configModule = await import(configUrl);
      console.log(`✅ Successfully imported: ${path.basename(configPath)}`);
      return configModule.default;
    } catch (error) {
      console.log(`⚠️  Dynamic import failed: ${error.message}`);

      // If .ts file, try to find compiled .js version
      if (configPath.endsWith(".ts")) {
        try {
          const jsPath = configPath.replace(".ts", ".js");
          const jsUrl = `file://${path.resolve(jsPath)}`;
          const configModule = await import(jsUrl);
          console.log(
            `✅ Successfully imported compiled version: ${path.basename(
              jsPath
            )}`
          );
          return configModule.default;
        } catch (jsError) {
          console.log(`⚠️  No compiled .js version found`);
        }
      }
      return null;
    }
  }

  async _parseConfigObject(config, configPath) {
    if (!config || !config.projects) {
      console.log(`⚠️  No projects found in ${path.basename(configPath)}`);
      return;
    }

    console.log(`📋 Found ${config.projects.length} projects total`);
    const configDir = path.dirname(path.resolve(configPath));
    let rolesFound = 0;

    for (let i = 0; i < config.projects.length; i++) {
      const project = config.projects[i];
      console.log(`\n📦 Project ${i + 1}: ${project.name || "unnamed"}`);

      if (!project.name || !project.use?.storageState) {
        console.log(`   ⏭️  Skipping - missing name or storageState`);
        continue;
      }

      // Skip setup projects
      if (project.name.toLowerCase().includes("setup")) {
        console.log(`   ⏭️  Skipping setup project`);
        continue;
      }

      console.log(`   📄 StorageState: ${project.use.storageState}`);

      // Resolve relative paths to absolute paths
      const absoluteAuthPath = path.isAbsolute(project.use.storageState)
        ? project.use.storageState
        : path.resolve(configDir, project.use.storageState);

      this.playwrightRoles.set(project.name, absoluteAuthPath);
      rolesFound++;
      console.log(`   ✅ Added role: ${project.name}`);
    }

    console.log(`\n✅ Loaded ${rolesFound} roles via dynamic import`);
  }

  async _parseConfigText(configPath) {
    try {
      const configContent = await fs.readFile(configPath, "utf-8");
      const configDir = path.dirname(path.resolve(configPath));

      console.log(`📝 Parsing config file as text...`);

      // Simple pattern matching for project objects
      const lines = configContent.split("\n");
      let currentProject = null;
      let currentStorageState = null;
      let rolesFound = 0;
      let inProjectObject = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Look for project start
        if (
          line.includes("name:") &&
          (line.includes('"') || line.includes("'"))
        ) {
          const nameMatch = line.match(/name:\s*["']([^"']+)["']/);
          if (nameMatch) {
            currentProject = nameMatch[1];
            inProjectObject = true;
            currentStorageState = null;
            console.log(`\n📦 Found project: ${currentProject}`);
          }
        }

        // Look for storageState in same project
        if (
          inProjectObject &&
          line.includes("storageState:") &&
          (line.includes('"') || line.includes("'"))
        ) {
          const storageMatch = line.match(/storageState:\s*["']([^"']+)["']/);
          if (storageMatch) {
            currentStorageState = storageMatch[1];
            console.log(`   📄 Found storageState: ${currentStorageState}`);
          }
        }

        // End of project object (look for closing brace)
        if (line.includes("},") || line === "}," || line === "}") {
          if (currentProject && currentStorageState) {
            // Skip setup projects
            if (!currentProject.toLowerCase().includes("setup")) {
              const absoluteAuthPath = path.isAbsolute(currentStorageState)
                ? currentStorageState
                : path.resolve(configDir, currentStorageState);

              this.playwrightRoles.set(currentProject, absoluteAuthPath);
              rolesFound++;
              console.log(`   ✅ Added role: ${currentProject}`);
            } else {
              console.log(`   ⏭️  Skipping setup project`);
            }
          }
          inProjectObject = false;
          currentProject = null;
          currentStorageState = null;
        }
      }

      console.log(`\n✅ Parsed ${rolesFound} roles via text parsing`);
    } catch (error) {
      console.log(`\n❌ Could not parse config file: ${error.message}`);
    }
  }
}

// Run the test
const test = new HybridPlaywrightDiscoveryTest();
test.testConfigParsing().catch(console.error);
