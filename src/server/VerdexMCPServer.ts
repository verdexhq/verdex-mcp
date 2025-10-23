import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { RolesConfiguration } from "../types.js";
import { MultiContextBrowser } from "../multi-context-browser.js";
import { RolesConfigParser } from "./config/RolesConfigParser.js";
import { TOOL_DEFINITIONS } from "./tools/ToolDefinitions.js";
import { BrowserHandlers } from "./handlers/BrowserHandlers.js";
import { AnalysisHandlers } from "./handlers/AnalysisHandlers.js";
import { RoleHandlers } from "./handlers/RoleHandlers.js";

export class VerdexMCPServer {
  private server: Server;
  private browser: MultiContextBrowser;
  private rolesConfig: RolesConfiguration | null = null;
  private browserHandlers: BrowserHandlers;
  private analysisHandlers: AnalysisHandlers;
  private roleHandlers: RoleHandlers;

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
    this.rolesConfig = RolesConfigParser.parse();

    // Pass roles configuration to bridge if available
    if (this.rolesConfig) {
      this.browser.setRolesConfiguration(this.rolesConfig);
    }

    // Initialize handlers
    this.browserHandlers = new BrowserHandlers(this.browser);
    this.analysisHandlers = new AnalysisHandlers(this.browser);
    this.roleHandlers = new RoleHandlers(this.browser, this.rolesConfig);

    this.setupHandlers();
  }

  private setupHandlers() {
    // Register tool list handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: TOOL_DEFINITIONS,
      };
    });

    // Register tool call handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          // Core browser functionality
          case "browser_initialize":
            return await this.browserHandlers.handleInitialize();

          case "browser_navigate":
            return await this.browserHandlers.handleNavigate(
              args as { url: string }
            );

          case "browser_snapshot":
            return await this.browserHandlers.handleSnapshot();

          case "browser_click":
            return await this.browserHandlers.handleClick(
              args as { ref: string }
            );

          case "browser_type":
            return await this.browserHandlers.handleType(
              args as { ref: string; text: string }
            );

          case "browser_inspect":
            return await this.browserHandlers.handleInspect(
              args as { ref: string }
            );

          case "wait_for_browser":
            return await this.browserHandlers.handleWait(
              args as { milliseconds?: number }
            );

          case "browser_close":
            return await this.browserHandlers.handleClose();

          // Element analysis tools
          case "get_ancestors":
            return await this.analysisHandlers.handleGetAncestors(
              args as { ref: string }
            );

          case "get_siblings":
            return await this.analysisHandlers.handleGetSiblings(
              args as { ref: string; ancestorLevel: number }
            );

          case "get_descendants":
            return await this.analysisHandlers.handleGetDescendants(
              args as { ref: string; ancestorLevel: number }
            );

          // Multi-role functionality
          case "get_current_role":
            return await this.roleHandlers.handleGetCurrentRole();

          case "list_current_roles":
            return await this.roleHandlers.handleListRoles();

          case "select_role":
            return await this.roleHandlers.handleSelectRole(
              args as { role: string }
            );

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
