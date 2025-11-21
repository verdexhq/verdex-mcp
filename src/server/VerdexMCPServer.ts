import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { RolesConfiguration } from "../runtime/types.js";
import { MultiContextBrowser } from "../runtime/MultiContextBrowser.js";
import { RolesConfigParser } from "./config/RolesConfigParser.js";
import { TOOL_DEFINITIONS } from "./tools/ToolDefinitions.js";
import { BrowserHandlers } from "./handlers/BrowserHandlers.js";
import { AnalysisHandlers } from "./handlers/AnalysisHandlers.js";
import { RoleHandlers } from "./handlers/RoleHandlers.js";
import {
  StaleRefError,
  UnknownRefError,
  FrameDetachedError,
  FrameInjectionError,
  NavigationError,
  AuthenticationError,
} from "../shared-types.js";

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

          case "wait_for_browser":
            return await this.browserHandlers.handleWait(
              args as { milliseconds?: number }
            );

          case "browser_close":
            return await this.browserHandlers.handleClose();

          // Element analysis tools
          case "resolve_container":
            return await this.analysisHandlers.handleGetAncestors(
              args as { ref: string }
            );

          case "inspect_pattern":
            return await this.analysisHandlers.handleGetSiblings(
              args as { ref: string; ancestorLevel: number }
            );

          case "extract_anchors":
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
              text: this.formatErrorForLLM(error),
            },
          ],
        };
      }
    });
  }

  /**
   * Format errors for LLM consumption with clear recovery instructions.
   * Uses the rich error properties to provide context and actionable guidance.
   */
  private formatErrorForLLM(error: unknown): string {
    // Stale reference - element was removed from DOM
    if (error instanceof StaleRefError) {
      return `❌ Stale Element Reference

Element: ${error.ref}
Type: ${error.elementInfo.role}
Label: "${error.elementInfo.name}"
Tag: <${error.elementInfo.tagName}>

The element was removed from the DOM, likely due to:
• Page navigation or refresh
• Dynamic content update
• JavaScript manipulation

🔧 Action Required:
Call browser_snapshot() to get fresh element references, then retry your action.`;
    }

    // Unknown reference - ref doesn't exist in snapshot
    if (error instanceof UnknownRefError) {
      return `❌ Unknown Element Reference

Reference: ${error.ref}

This reference doesn't exist in the current snapshot.

Possible causes:
• Using a ref from an old snapshot (stale after navigation)
• Typo in the ref name
• Element not yet loaded or not interactive

🔧 Action Required:
1. Call browser_snapshot() to see currently available elements
2. Find the correct element reference in the new snapshot
3. Use the correct ref from the latest snapshot`;
    }

    // Frame detached - iframe removed during operation
    if (error instanceof FrameDetachedError) {
      return `❌ Frame Detached

Frame ID: ${error.frameId}

An iframe was removed or navigated during the operation.

This is often normal during:
• Navigation between pages
• Single-page app (SPA) route changes
• Dynamic iframe removal by JavaScript

🔧 Action Required:
Call browser_snapshot() to see the current page structure and available frames.`;
    }

    // Frame injection failed - can't access iframe
    if (error instanceof FrameInjectionError) {
      return `❌ Frame Injection Failed

Frame ID: ${error.frameId}
Reason: ${error.reason}

The browser automation bridge couldn't be injected into this iframe.

Common causes:
• Cross-origin iframe (browser security restriction)
• about:blank or data: URL (not yet loaded)
• Frame not fully initialized
• Sandboxed iframe with restricted permissions

🔧 Action Required:
This frame cannot be automated. Try one of these approaches:
• Work with elements in the main frame instead
• Wait for the iframe to load fully (if timing issue)
• If cross-origin, this is a browser security limit (cannot be bypassed)`;
    }

    // Authentication failed - required auth cannot load
    if (error instanceof AuthenticationError) {
      return `❌ Authentication Required

Role: ${error.role}
Auth File: ${error.authPath}

Failed to load authentication data: ${error.reason}

This role requires authentication but the auth file couldn't be loaded.

Possible causes:
• Auth file doesn't exist at specified path
• Auth file has invalid JSON format
• Auth file permissions prevent reading
• Path specified incorrectly in configuration

🔧 Action Required:
1. Verify auth file exists: ${error.authPath}
2. Check file permissions (must be readable)
3. Validate JSON format in auth file
4. If auth is optional, set authRequired: false in role config
5. Run auth capture process if credentials expired`;
    }

    // Navigation failed - couldn't navigate to URL
    if (error instanceof NavigationError) {
      return `❌ Navigation Failed

URL: ${error.url}
Role: ${error.role}

${error.message}

Possible causes:
• Invalid or unreachable URL
• Network connectivity issues
• Server error (404, 500, etc.)
• Authentication required (check warnings in snapshot)
• Timeout (page took too long to load)
• Main frame injection failed

🔧 Action Required:
• Verify the URL is correct and accessible
• Check network connectivity
• Call browser_snapshot() to see current page state
• Check role authentication status via getFailures()
• Try a different URL or retry after a moment`;
    }

    // Generic error fallback
    if (error instanceof Error) {
      return `❌ Error

${error.message}

If this error persists, check:
• Your input parameters
• Current page state (call browser_snapshot())
• Network connectivity
• Browser logs for additional context`;
    }

    // Unknown error type
    return `❌ Unknown Error

${String(error)}

This is an unexpected error type. Please report this issue with context about what operation you were attempting.`;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Multi-Role Browser MCP Server running on stdio");
  }
}
