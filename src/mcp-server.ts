#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { BrowserBridge } from "./browser-bridge.js";

class BrowserMCPServer {
  private server: Server;
  private bridge: BrowserBridge;

  constructor() {
    this.server = new Server(
      {
        name: "browser-bridge-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.bridge = new BrowserBridge();
    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
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
            description: "Get detailed information about an element",
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
          {
            name: "explore_element",
            description: "Explore an element to generate stable selectors",
            inputSchema: {
              type: "object",
              properties: {
                ref: {
                  type: "string",
                  description: "Element reference ID (e.g., 'e1')",
                },
              },
              required: ["ref"],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "browser_initialize": {
            await this.bridge.initialize();
            return {
              content: [
                {
                  type: "text",
                  text: "Browser initialized successfully",
                },
              ],
            };
          }

          case "browser_navigate": {
            const { url } = args as { url: string };
            const snapshot = await this.bridge.navigate(url);
            return {
              content: [
                {
                  type: "text",
                  text: `Navigated to ${url}\n\nPage Snapshot:\n${snapshot.text}\n\nFound ${snapshot.elementCount} interactive elements`,
                },
              ],
            };
          }

          case "browser_snapshot": {
            const snapshot = await this.bridge.snapshot();
            return {
              content: [
                {
                  type: "text",
                  text: `Current Page Snapshot:\n${snapshot.text}\n\nFound ${snapshot.elementCount} interactive elements`,
                },
              ],
            };
          }

          case "browser_click": {
            const { ref } = args as { ref: string };
            await this.bridge.click(ref);
            return {
              content: [
                {
                  type: "text",
                  text: `Clicked element ${ref}`,
                },
              ],
            };
          }

          case "browser_type": {
            const { ref, text } = args as { ref: string; text: string };
            await this.bridge.type(ref, text);
            return {
              content: [
                {
                  type: "text",
                  text: `Typed "${text}" into element ${ref}`,
                },
              ],
            };
          }

          case "browser_inspect": {
            const { ref } = args as { ref: string };
            const info = await this.bridge.inspect(ref);
            if (!info) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Element ${ref} not found`,
                  },
                ],
              };
            }
            return {
              content: [
                {
                  type: "text",
                  text: `Element ${ref} details:
Role: ${info.role}
Name: ${info.name}
Tag: ${info.tagName}
Text: ${info.text || "(no text)"}
Visible: ${info.visible}
Bounds: ${JSON.stringify(info.bounds)}
Selector: ${info.selector}
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
            await this.bridge.close();
            return {
              content: [
                {
                  type: "text",
                  text: "Browser closed successfully",
                },
              ],
            };
          }

          case "explore_element": {
            const { ref } = args as { ref: string };
            const result = await this.bridge.explore(ref);
            if (!result) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Element ${ref} not found`,
                  },
                ],
              };
            }
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
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
    console.error("Browser MCP Server running on stdio");
  }
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new BrowserMCPServer();
  server.run().catch(console.error);
}

export { BrowserMCPServer };
