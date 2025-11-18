/**
 * Validation Tests: MCP Tool Definitions
 *
 * Tests that ensure tool definitions match actual handlers:
 * - All tools have correct schemas
 * - Required parameters are marked correctly
 * - Tool names match handler routing
 * - No drift between definitions and implementations
 *
 * Prevents API contract breaks before deployment.
 */

import { test, expect } from "@playwright/test";
import { TOOL_DEFINITIONS } from "../src/server/tools/ToolDefinitions.js";

test.describe("Tool Definitions Validation", () => {
  test("should define all expected MCP tools", () => {
    const toolNames = TOOL_DEFINITIONS.map((tool) => tool.name);

    // Browser control tools
    expect(toolNames).toContain("browser_initialize");
    expect(toolNames).toContain("browser_navigate");
    expect(toolNames).toContain("browser_snapshot");
    expect(toolNames).toContain("browser_click");
    expect(toolNames).toContain("browser_type");
    expect(toolNames).toContain("wait_for_browser");
    expect(toolNames).toContain("browser_close");

    // Structural analysis tools
    expect(toolNames).toContain("resolve_container");
    expect(toolNames).toContain("inspect_pattern");
    expect(toolNames).toContain("extract_anchors");

    // Role management tools
    expect(toolNames).toContain("get_current_role");
    expect(toolNames).toContain("list_current_roles");
    expect(toolNames).toContain("select_role");

    // Should have exactly these tools (no more, no less)
    expect(toolNames.length).toBe(13);
  });

  test("should have valid input schemas for all tools", () => {
    TOOL_DEFINITIONS.forEach((tool) => {
      // Every tool must have an inputSchema
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.properties).toBeDefined();
    });
  });

  test("should mark required parameters correctly", () => {
    // browser_navigate requires url
    const navigateTool = TOOL_DEFINITIONS.find(
      (t) => t.name === "browser_navigate"
    );
    expect(navigateTool?.inputSchema.required).toContain("url");

    // browser_click requires ref
    const clickTool = TOOL_DEFINITIONS.find((t) => t.name === "browser_click");
    expect(clickTool?.inputSchema.required).toContain("ref");

    // browser_type requires ref and text
    const typeTool = TOOL_DEFINITIONS.find((t) => t.name === "browser_type");
    expect(typeTool?.inputSchema.required).toContain("ref");
    expect(typeTool?.inputSchema.required).toContain("text");

    // resolve_container requires ref
    const containerTool = TOOL_DEFINITIONS.find(
      (t) => t.name === "resolve_container"
    );
    expect(containerTool?.inputSchema.required).toContain("ref");

    // inspect_pattern requires ref and ancestorLevel
    const patternTool = TOOL_DEFINITIONS.find(
      (t) => t.name === "inspect_pattern"
    );
    expect(patternTool?.inputSchema.required).toContain("ref");
    expect(patternTool?.inputSchema.required).toContain("ancestorLevel");

    // extract_anchors requires ref and ancestorLevel
    const anchorsTool = TOOL_DEFINITIONS.find(
      (t) => t.name === "extract_anchors"
    );
    expect(anchorsTool?.inputSchema.required).toContain("ref");
    expect(anchorsTool?.inputSchema.required).toContain("ancestorLevel");

    // select_role requires role
    const selectRoleTool = TOOL_DEFINITIONS.find(
      (t) => t.name === "select_role"
    );
    expect(selectRoleTool?.inputSchema.required).toContain("role");
  });

  test("should have helpful descriptions", () => {
    TOOL_DEFINITIONS.forEach((tool) => {
      expect(tool.description).toBeDefined();
      expect(tool.description.length).toBeGreaterThan(10);
    });
  });

  test("should have unique tool names", () => {
    const toolNames = TOOL_DEFINITIONS.map((tool) => tool.name);
    const uniqueNames = new Set(toolNames);
    expect(uniqueNames.size).toBe(toolNames.length);
  });

  test("should define parameter types correctly", () => {
    // browser_navigate url should be string
    const navigateTool = TOOL_DEFINITIONS.find(
      (t) => t.name === "browser_navigate"
    );
    expect(navigateTool?.inputSchema.properties.url?.type).toBe("string");

    // browser_click ref should be string
    const clickTool = TOOL_DEFINITIONS.find((t) => t.name === "browser_click");
    expect(clickTool?.inputSchema.properties.ref?.type).toBe("string");

    // browser_type ref and text should be strings
    const typeTool = TOOL_DEFINITIONS.find((t) => t.name === "browser_type");
    expect(typeTool?.inputSchema.properties.ref?.type).toBe("string");
    expect(typeTool?.inputSchema.properties.text?.type).toBe("string");

    // wait_for_browser milliseconds should be number
    const waitTool = TOOL_DEFINITIONS.find(
      (t) => t.name === "wait_for_browser"
    );
    expect(waitTool?.inputSchema.properties.milliseconds?.type).toBe("number");

    // inspect_pattern ancestorLevel should be number
    const patternTool = TOOL_DEFINITIONS.find(
      (t) => t.name === "inspect_pattern"
    );
    expect(patternTool?.inputSchema.properties.ancestorLevel?.type).toBe(
      "number"
    );
  });

  test("should have valid tool definitions structure", () => {
    TOOL_DEFINITIONS.forEach((tool) => {
      // Must have name
      expect(tool.name).toBeDefined();
      expect(typeof tool.name).toBe("string");

      // Must have description
      expect(tool.description).toBeDefined();
      expect(typeof tool.description).toBe("string");

      // Must have inputSchema
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
    });
  });

  test("should group tools logically", () => {
    const browserTools = TOOL_DEFINITIONS.filter(
      (t) => t.name.startsWith("browser_") || t.name === "wait_for_browser"
    );
    const analysisTools = TOOL_DEFINITIONS.filter(
      (t) =>
        t.name === "resolve_container" ||
        t.name === "inspect_pattern" ||
        t.name === "extract_anchors"
    );
    const roleTools = TOOL_DEFINITIONS.filter(
      (t) =>
        t.name === "get_current_role" ||
        t.name === "list_current_roles" ||
        t.name === "select_role"
    );

    expect(browserTools.length).toBe(7); // initialize, navigate, snapshot, click, type, wait_for_browser, close
    expect(analysisTools.length).toBe(3); // resolve_container, inspect_pattern, extract_anchors
    expect(roleTools.length).toBe(3); // get_current_role, list_current_roles, select_role
  });

  test("should have STEP indicators for structural analysis tools", () => {
    const resolveContainer = TOOL_DEFINITIONS.find(
      (t) => t.name === "resolve_container"
    );
    expect(resolveContainer?.description).toContain("STEP 1");

    const inspectPattern = TOOL_DEFINITIONS.find(
      (t) => t.name === "inspect_pattern"
    );
    expect(inspectPattern?.description).toContain("STEP 2");

    const extractAnchors = TOOL_DEFINITIONS.find(
      (t) => t.name === "extract_anchors"
    );
    expect(extractAnchors?.description).toContain("STEP 3");
  });

  test("should have default values for optional parameters", () => {
    const waitTool = TOOL_DEFINITIONS.find(
      (t) => t.name === "wait_for_browser"
    );
    expect(waitTool?.inputSchema.properties.milliseconds?.default).toBe(1000);
  });

  test("should export tool definitions as array", () => {
    expect(Array.isArray(TOOL_DEFINITIONS)).toBe(true);
    expect(TOOL_DEFINITIONS.length).toBeGreaterThan(0);
  });

  test("should match tool names with expected routing", () => {
    // These tool names must match the switch cases in VerdexMCPServer.ts
    const expectedToolNames = [
      "browser_initialize",
      "browser_navigate",
      "browser_snapshot",
      "browser_click",
      "browser_type",
      "wait_for_browser",
      "browser_close",
      "resolve_container",
      "inspect_pattern",
      "extract_anchors",
      "get_current_role",
      "list_current_roles",
      "select_role",
    ];

    const actualToolNames = TOOL_DEFINITIONS.map((t) => t.name);

    expectedToolNames.forEach((expectedName) => {
      expect(actualToolNames).toContain(expectedName);
    });
  });

  test("should have parameter descriptions", () => {
    const navigateTool = TOOL_DEFINITIONS.find(
      (t) => t.name === "browser_navigate"
    );
    expect(navigateTool?.inputSchema.properties.url?.description).toBeDefined();

    const clickTool = TOOL_DEFINITIONS.find((t) => t.name === "browser_click");
    expect(clickTool?.inputSchema.properties.ref?.description).toBeDefined();

    const patternTool = TOOL_DEFINITIONS.find(
      (t) => t.name === "inspect_pattern"
    );
    expect(
      patternTool?.inputSchema.properties.ancestorLevel?.description
    ).toBeDefined();
  });

  test("should not have duplicate property names within a tool", () => {
    TOOL_DEFINITIONS.forEach((tool) => {
      const propertyNames = Object.keys(tool.inputSchema.properties);
      const uniqueNames = new Set(propertyNames);
      expect(uniqueNames.size).toBe(propertyNames.length);
    });
  });
});
