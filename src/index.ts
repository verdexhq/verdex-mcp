#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { existsSync, realpathSync } from "fs";
import { fileURLToPath } from "url";
import type {
  AncestorInfo,
  SiblingInfo,
  DescendantInfo,
  RolesConfiguration,
  RoleConfig,
  InspectResult,
} from "./types.js";
import { MultiContextBrowser } from "./multi-context-browser.js";

class VerdexMCPServer {
  private server: Server;
  private browser: MultiContextBrowser;
  private rolesConfig: RolesConfiguration | null = null;

  constructor() {
    this.server = new Server(
      {
        name: "verdex-mcp-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.browser = new MultiContextBrowser();
    this.loadRolesConfiguration();

    // Pass roles configuration to bridge if available
    if (this.rolesConfig) {
      this.browser.setRolesConfiguration(this.rolesConfig);
    }

    this.setupHandlers();
  }

  private loadRolesConfiguration(): void {
    try {
      const roles: Record<string, RoleConfig> = {};
      const args = process.argv;

      // Parse --role <name> <auth_path> [default_url] arguments
      for (let i = 0; i < args.length; i++) {
        if (args[i] === "--role" && i + 2 < args.length) {
          const roleName = args[i + 1];
          const authPath = args[i + 2];
          const potentialDefaultUrl = args[i + 3]; // May be undefined

          if (typeof roleName !== "string" || roleName.trim() === "") {
            throw new Error(`Invalid role name: must be a non-empty string`);
          }

          if (typeof authPath !== "string" || authPath.trim() === "") {
            throw new Error(
              `Invalid auth file path for role "${roleName}": must be a non-empty string`
            );
          }

          // Check if the auth file exists (basic validation)
          try {
            if (!existsSync(authPath)) {
              console.warn(
                `⚠️ Warning: Auth file not found for role "${roleName}": ${authPath}`
              );
            }
          } catch (fsError) {
            console.warn(
              `⚠️ Warning: Could not verify auth file for role "${roleName}": ${authPath}`
            );
          }

          // Handle optional default URL
          let defaultUrl: string | undefined = undefined;
          let argsToSkip = 2; // By default, skip role name and auth path

          if (
            potentialDefaultUrl &&
            typeof potentialDefaultUrl === "string" &&
            potentialDefaultUrl.trim() !== ""
          ) {
            // Check if it's a valid URL
            try {
              new URL(potentialDefaultUrl);
              defaultUrl = potentialDefaultUrl;
              argsToSkip = 3; // Skip role name, auth path, and default URL
              console.log(
                `📍 Default URL configured for role "${roleName}": ${defaultUrl}`
              );
            } catch (urlError) {
              // Not a valid URL - might be the next --role flag or other argument
              // Don't treat it as a default URL, just skip 2 arguments
              console.log(
                `ℹ️ No default URL for role "${roleName}" (3rd argument not a valid URL)`
              );
            }
          } else {
            console.log(`ℹ️ No default URL configured for role "${roleName}"`);
          }

          roles[roleName] = {
            authPath: authPath,
            defaultUrl: defaultUrl,
          };
          i += argsToSkip; // Skip the processed arguments
        }
      }

      if (Object.keys(roles).length > 0) {
        this.rolesConfig = { roles };
        console.log(
          `✅ Loaded roles configuration: ${Object.keys(roles).join(", ")}`
        );
      } else {
        console.log(
          "ℹ️ No --role arguments found, using default role management"
        );
      }
    } catch (error) {
      console.error("❌ Failed to parse role arguments:", error);
      this.rolesConfig = null;
    }
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // Core browser functionality
          {
            name: "browser_initialize",
            description: "Initialize the browser instance",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "browser_navigate",
            description: "Navigate to a URL and return page snapshot",
            inputSchema: {
              type: "object",
              properties: {
                url: {
                  type: "string",
                  description: "URL to navigate to",
                },
              },
              required: ["url"],
            },
          },
          {
            name: "browser_snapshot",
            description:
              "Take a snapshot of the current page's accessibility tree",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "browser_click",
            description: "Click an element by its reference ID",
            inputSchema: {
              type: "object",
              properties: {
                ref: {
                  type: "string",
                  description: "Element reference ID (e.g., 'e1', 'e2')",
                },
              },
              required: ["ref"],
            },
          },
          {
            name: "browser_type",
            description: "Type text into an input element",
            inputSchema: {
              type: "object",
              properties: {
                ref: {
                  type: "string",
                  description: "Element reference ID of the input field",
                },
                text: {
                  type: "string",
                  description: "Text to type into the element",
                },
              },
              required: ["ref", "text"],
            },
          },
          {
            name: "browser_inspect",
            description:
              "Get complete element details including exact attributes, text content, and positioning. Use when you need to verify specific attributes for selector construction, confirm element visibility, or understand why elements behave differently. Most effective AFTER structural exploration to validate your selector strategy.",
            inputSchema: {
              type: "object",
              properties: {
                ref: {
                  type: "string",
                  description: "Element reference ID to inspect",
                },
              },
              required: ["ref"],
            },
          },
          {
            name: "wait_for_browser",
            description:
              "Wait for a specified amount of time (useful for page loads)",
            inputSchema: {
              type: "object",
              properties: {
                milliseconds: {
                  type: "number",
                  description: "Number of milliseconds to wait",
                  default: 1000,
                },
              },
            },
          },
          {
            name: "browser_close",
            description: "Close the browser instance",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },

          // Element analysis tools
          {
            name: "get_ancestors",
            description:
              "STEP 1: Find the containment hierarchy for an element to identify stable scoping containers. Returns parent elements up to body, showing which have unique identifiers (data-testid, id) that can be used for scoped selectors. Essential first step for creating non-fragile selectors that don't rely on DOM position.",
            inputSchema: {
              type: "object",
              properties: {
                ref: {
                  type: "string",
                  description: "Element reference ID (e.g., 'e1', 'e2')",
                },
              },
              required: ["ref"],
            },
          },
          {
            name: "get_siblings",
            description:
              "STEP 2: After get_ancestors, analyze sibling elements at a specific ancestor level to understand repeating patterns (like product cards, list items, table rows). Reveals if elements share structure but have distinguishing content. Use the ancestor level from get_ancestors output. Critical for understanding element uniqueness within its container.",
            inputSchema: {
              type: "object",
              properties: {
                ref: {
                  type: "string",
                  description: "Element reference ID (e.g., 'e1', 'e2')",
                },
                ancestorLevel: {
                  type: "number",
                  description:
                    "Use level number from get_ancestors output (e.g., if get_ancestors shows 'Level 3' as your target container, use ancestorLevel: 3)",
                },
              },
              required: ["ref", "ancestorLevel"],
            },
          },
          {
            name: "get_descendants",
            description:
              "STEP 3: After identifying the right ancestor level from get_siblings, explore the internal structure within that container to find unique identifying elements (headings, labels, specific text). This discovers semantic identifiers that make selectors robust and human-readable. Use same ancestorLevel as get_siblings.",
            inputSchema: {
              type: "object",
              properties: {
                ref: {
                  type: "string",
                  description: "Element reference ID (e.g., 'e1', 'e2')",
                },
                ancestorLevel: {
                  type: "number",
                  description:
                    "Use the same level number identified from get_siblings analysis (the ancestor level that contains your target scope)",
                },
              },
              required: ["ref", "ancestorLevel"],
            },
          },
          // Multi-role functionality
          {
            name: "get_current_role",
            description: "Get the currently active role",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "list_current_roles",
            description: "List all available roles",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "select_role",
            description: "Switch to a different role",
            inputSchema: {
              type: "object",
              properties: {
                role: {
                  type: "string",
                  description: "Role name to switch to",
                },
              },
              required: ["role"],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          // Core browser functionality
          case "browser_initialize": {
            await this.browser.initialize();
            return {
              content: [
                {
                  type: "text",
                  text: "Multi-role browser initialized successfully",
                },
              ],
            };
          }

          case "browser_navigate": {
            const { url } = args as { url: string };
            const snapshot = await this.browser.navigate(url);

            let responseText = "";

            if (snapshot.navigation) {
              const nav = snapshot.navigation;
              responseText = `Navigation ${
                nav.success ? "successful" : "failed"
              } (Role: ${this.browser.getCurrentRole()})

📍 Navigation Details:
   Requested URL: ${nav.requestedUrl}
   Final URL: ${nav.finalUrl}
   Page Title: "${nav.pageTitle}"
   Load Time: ${nav.loadTime}ms${
                nav.statusCode
                  ? `
   Status Code: ${nav.statusCode}`
                  : ""
              }${
                nav.redirectCount
                  ? `
   Redirects: ${nav.redirectCount}`
                  : ""
              }${
                nav.contentType
                  ? `
   Content Type: ${nav.contentType}`
                  : ""
              }

📄 Page Snapshot:
${snapshot.text}

Found ${snapshot.elementCount} interactive elements`;
            } else {
              // Fallback for snapshots without navigation metadata
              responseText = `Navigated to ${url} (Role: ${this.browser.getCurrentRole()})

Page Snapshot:
${snapshot.text}

Found ${snapshot.elementCount} interactive elements`;
            }

            return {
              content: [
                {
                  type: "text",
                  text: responseText,
                },
              ],
            };
          }

          case "browser_snapshot": {
            const snapshot = await this.browser.snapshot();
            return {
              content: [
                {
                  type: "text",
                  text: `Current Page Snapshot (Role: ${this.browser.getCurrentRole()}):\n${
                    snapshot.text
                  }\n\nFound ${snapshot.elementCount} interactive elements`,
                },
              ],
            };
          }

          case "browser_click": {
            const { ref } = args as { ref: string };
            await this.browser.click(ref);
            return {
              content: [
                {
                  type: "text",
                  text: `Clicked element ${ref} (Role: ${this.browser.getCurrentRole()})`,
                },
              ],
            };
          }

          case "browser_type": {
            const { ref, text } = args as { ref: string; text: string };
            await this.browser.type(ref, text);
            return {
              content: [
                {
                  type: "text",
                  text: `Typed "${text}" into element ${ref} (Role: ${this.browser.getCurrentRole()})`,
                },
              ],
            };
          }

          case "browser_inspect": {
            const { ref } = args as { ref: string };
            const info: InspectResult | null = await this.browser.inspect(ref);
            if (!info) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Element ${ref} not found (Role: ${this.browser.getCurrentRole()})`,
                  },
                ],
              };
            }
            return {
              content: [
                {
                  type: "text",
                  text: `Element ${ref} details (Role: ${this.browser.getCurrentRole()}):
                  Role: ${info.role}
                  Name: ${info.name}
                  Tag: ${info.tagName}
                  Text: ${info.text}
                  Visible: ${info.visible}
                  Sibling Index: ${info.siblingIndex}
                  Parent Ref: ${info.parentRef || "(none)"}
                  Bounds: x=${info.bounds.x}, y=${info.bounds.y}, width=${
                    info.bounds.width
                  }, height=${info.bounds.height}
                  Attributes: ${JSON.stringify(info.attributes, null, 2)}`,
                },
              ],
            };
          }

          case "wait_for_browser": {
            const { milliseconds = 1000 } = args as { milliseconds?: number };
            await new Promise((resolve) => setTimeout(resolve, milliseconds));
            return {
              content: [
                {
                  type: "text",
                  text: `Waited ${milliseconds}ms`,
                },
              ],
            };
          }

          case "browser_close": {
            await this.browser.close();
            return {
              content: [
                {
                  type: "text",
                  text: "Multi-role browser closed successfully",
                },
              ],
            };
          }

          // Element analysis tools
          case "get_ancestors": {
            const { ref } = args as { ref: string };
            const result = await this.browser.get_ancestors(ref);
            if (!result) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Element ${ref} not found (Role: ${this.browser.getCurrentRole()})`,
                  },
                ],
              };
            }

            // Format the result for better readability
            let output = `Ancestry analysis for element ${ref} (Role: ${this.browser.getCurrentRole()}):\n\n`;

            // Target element info
            output += `🎯 Target Element:\n`;
            output += `   Tag: ${result.target.tagName}\n`;
            output += `   Text: "${result.target.text}"\n\n`;

            // Ancestors info
            if (result.ancestors.length === 0) {
              output += `📍 No ancestors found (element is direct child of body)\n`;
            } else {
              output += `📋 Ancestors (${result.ancestors.length} levels up):\n\n`;

              result.ancestors.forEach(
                (ancestor: AncestorInfo, index: number) => {
                  output += `Level ${ancestor.level} (${ancestor.tagName}):\n`;
                  output += `   Children: ${ancestor.childElements}\n`;

                  if (Object.keys(ancestor.attributes).length > 0) {
                    output += `   Attributes: ${JSON.stringify(
                      ancestor.attributes
                    )}\n`;
                  }

                  if (ancestor.containsRefs.length > 0) {
                    output += `   Contains refs: ${ancestor.containsRefs.join(
                      ", "
                    )}\n`;
                  } else {
                    output += `   Contains refs: none\n`;
                  }

                  if (index < result.ancestors.length - 1) {
                    output += `\n`;
                  }
                }
              );
            }

            return {
              content: [
                {
                  type: "text",
                  text: output,
                },
              ],
            };
          }

          case "get_siblings": {
            const { ref, ancestorLevel } = args as {
              ref: string;
              ancestorLevel: number;
            };
            const result = await this.browser.get_siblings(ref, ancestorLevel);
            if (!result) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Element ${ref} not found or ancestor level ${ancestorLevel} is too high (Role: ${this.browser.getCurrentRole()})`,
                  },
                ],
              };
            }

            // Format the result for better readability
            let output = `Sibling analysis for element ${ref} at ancestor level ${ancestorLevel} (Role: ${this.browser.getCurrentRole()}):\n\n`;

            if (result.siblings.length === 0) {
              output += `📍 No siblings found at level ${ancestorLevel}\n`;
            } else {
              output += `👥 Found ${result.siblings.length} siblings at ancestor level ${ancestorLevel}:\n\n`;

              result.siblings.forEach((sibling: SiblingInfo, index: number) => {
                output += `Sibling ${sibling.index + 1} (${
                  sibling.tagName
                }):\n`;

                if (Object.keys(sibling.attributes).length > 0) {
                  output += `   Attributes: ${JSON.stringify(
                    sibling.attributes
                  )}\n`;
                }

                if (sibling.containsRefs.length > 0) {
                  output += `   Contains refs: ${sibling.containsRefs.join(
                    ", "
                  )}\n`;
                } else {
                  output += `   Contains refs: none\n`;
                }

                if (sibling.containsText.length > 0) {
                  output += `   Contains text: ${sibling.containsText
                    .slice(0, 3)
                    .join(", ")}${
                    sibling.containsText.length > 3 ? "..." : ""
                  }\n`;
                }

                if (index < result.siblings.length - 1) {
                  output += `\n`;
                }
              });
            }

            return {
              content: [
                {
                  type: "text",
                  text: output,
                },
              ],
            };
          }

          case "get_descendants": {
            const { ref, ancestorLevel } = args as {
              ref: string;
              ancestorLevel: number;
            };
            const result = await this.browser.get_descendants(
              ref,
              ancestorLevel
            );
            if (!result) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Element ${ref} not found or ancestor level ${ancestorLevel} is too high (Role: ${this.browser.getCurrentRole()})`,
                  },
                ],
              };
            }

            // Format the result for better readability
            let output = `Descendant analysis for element ${ref} within ancestor level ${ancestorLevel} (Role: ${this.browser.getCurrentRole()}):\n\n`;

            // Handle error cases
            if (result.error) {
              output += `❌ Error: ${result.error}\n`;
              return {
                content: [
                  {
                    type: "text",
                    text: output,
                  },
                ],
              };
            }

            output += `🏗️ Analyzing within ancestor: ${result.ancestorAt.tagName}`;
            if (
              result.ancestorAt.attributes &&
              Object.keys(result.ancestorAt.attributes).length > 0
            ) {
              output += ` ${JSON.stringify(result.ancestorAt.attributes)}`;
            }
            output += `\n\n`;

            if (!result.descendants || result.descendants.length === 0) {
              output += `📍 No descendants found within ancestor at level ${ancestorLevel}\n`;
            } else {
              output += `🔍 Found ${result.descendants.length} direct children within ancestor:\n\n`;

              // Helper function to format a descendant recursively
              const formatDescendant = (
                descendant: DescendantInfo,
                indent: string = "   "
              ): string => {
                let desc = "";
                desc += `${indent}${descendant.tagName}`;

                // Add ref if present
                if (descendant.ref) {
                  desc += ` [ref=${descendant.ref}]`;
                  if (descendant.role) desc += ` (${descendant.role})`;
                }

                // Add text content
                if (descendant.directText) {
                  desc += ` "${descendant.directText.substring(0, 50)}${
                    descendant.directText.length > 50 ? "..." : ""
                  }"`;
                } else if (descendant.fullText) {
                  desc += ` "${descendant.fullText.substring(0, 50)}${
                    descendant.fullText.length > 50 ? "..." : ""
                  }"`;
                }

                // Add child count
                if (descendant.childCount) {
                  desc += ` (${descendant.childCount} children)`;
                }

                // Add attributes if present
                if (Object.keys(descendant.attributes).length > 0) {
                  desc += ` ${JSON.stringify(descendant.attributes)}`;
                }

                desc += `\n`;

                // Recursively format nested descendants
                if (
                  descendant.descendants &&
                  descendant.descendants.length > 0
                ) {
                  descendant.descendants.forEach((nested) => {
                    desc += formatDescendant(nested, indent + "   ");
                  });
                }

                return desc;
              };

              (result.descendants || []).forEach(
                (descendant: DescendantInfo, index: number) => {
                  output += `Child ${index + 1} (depth ${descendant.depth}):\n`;

                  if (Object.keys(descendant.attributes).length > 0) {
                    output += `   Attributes: ${JSON.stringify(
                      descendant.attributes
                    )}\n`;
                  }

                  // Show immediate content
                  if (descendant.ref) {
                    output += `   Ref: ${descendant.ref}`;
                    if (descendant.role) output += ` (${descendant.role})`;
                    if (descendant.name) output += ` "${descendant.name}"`;
                    output += `\n`;
                  }

                  if (descendant.directText) {
                    output += `   Direct Text: "${descendant.directText.substring(
                      0,
                      100
                    )}${descendant.directText.length > 100 ? "..." : ""}"\n`;
                  }

                  if (
                    descendant.fullText &&
                    descendant.fullText !== descendant.directText
                  ) {
                    output += `   Full Text: "${descendant.fullText.substring(
                      0,
                      100
                    )}${descendant.fullText.length > 100 ? "..." : ""}"\n`;
                  }

                  // Show nested descendants
                  if (
                    descendant.descendants &&
                    descendant.descendants.length > 0
                  ) {
                    output += `   Contains ${descendant.descendants.length} nested elements:\n`;
                    descendant.descendants.forEach((nested) => {
                      output += formatDescendant(nested, "      ");
                    });
                  } else if (
                    descendant.childCount &&
                    descendant.childCount > 0
                  ) {
                    output += `   Contains ${descendant.childCount} children (not shown - depth limit reached)\n`;
                  }

                  if (
                    result.descendants &&
                    index < result.descendants.length - 1
                  ) {
                    output += `\n`;
                  }
                }
              );
            }

            return {
              content: [
                {
                  type: "text",
                  text: output,
                },
              ],
            };
          }
          // Multi-role functionality
          case "get_current_role": {
            const currentRole = this.browser.getCurrentRole();
            return {
              content: [
                {
                  type: "text",
                  text: `Current role: ${currentRole}`,
                },
              ],
            };
          }

          case "list_current_roles": {
            const currentRole = this.browser.getCurrentRole();
            let output = "Available roles:\n";

            // If we have roles configuration from MCP, use that
            if (this.rolesConfig && this.rolesConfig.roles) {
              const configuredRoles = Object.keys(this.rolesConfig.roles);

              if (configuredRoles.length === 0) {
                return {
                  content: [
                    {
                      type: "text",
                      text: "Available roles: none (configured in MCP)",
                    },
                  ],
                };
              }

              output += "\n🔧 Configured roles (from MCP):\n";
              const sortedConfigRoles = [...configuredRoles].sort();

              for (const role of sortedConfigRoles) {
                const isCurrent = role === currentRole;
                const roleConfig = this.rolesConfig.roles[role];
                output += `• ${role}${isCurrent ? " (current)" : ""}\n`;
                output += `  📁 Auth file: ${roleConfig.authPath}\n`;
                if (roleConfig.defaultUrl) {
                  output += `  🌐 Default URL: ${roleConfig.defaultUrl}\n`;
                } else {
                  output += `  🌐 Default URL: (none)\n`;
                }
              }
            }

            // Also show any manually added roles (from bridge usage)
            const manualRoles = this.browser.listRoles();
            const configuredRoleNames = this.rolesConfig
              ? Object.keys(this.rolesConfig.roles)
              : [];
            const manualOnlyRoles = manualRoles.filter(
              (role) => !configuredRoleNames.includes(role)
            );

            if (manualOnlyRoles.length > 0) {
              output += "\n🖥️ Active roles (from bridge usage):\n";
              const sortedManualRoles = [...manualOnlyRoles].sort();

              for (const role of sortedManualRoles) {
                const isCurrent = role === currentRole;
                output += `• ${role}${isCurrent ? " (current)" : ""}\n`;
              }
            }

            // If no roles at all
            if (
              (!this.rolesConfig ||
                Object.keys(this.rolesConfig.roles).length === 0) &&
              manualRoles.length === 0
            ) {
              return {
                content: [
                  {
                    type: "text",
                    text: "Available roles: none",
                  },
                ],
              };
            }

            return {
              content: [
                {
                  type: "text",
                  text: output.trim(),
                },
              ],
            };
          }

          case "select_role": {
            const { role } = args as { role: string };
            await this.browser.selectRole(role);
            return {
              content: [
                {
                  type: "text",
                  text: `Switched to role: ${role}`,
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Multi-Role Browser MCP Server running on stdio");
  }
}

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

export { VerdexMCPServer };
