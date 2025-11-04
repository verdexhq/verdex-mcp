export const TOOL_DEFINITIONS = [
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
    description: "Take a snapshot of the current page's accessibility tree",
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
    name: "wait_for_browser",
    description: "Wait for a specified amount of time (useful for page loads)",
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
    name: "resolve_container",
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
    name: "inspect_pattern",
    description:
      "STEP 2: After resolve_container, analyze sibling elements at a specific ancestor level to understand repeating patterns (like product cards, list items, table rows). Reveals if elements share structure but have distinguishing content. Use the ancestor level from resolve_container output. Critical for understanding element uniqueness within its container.",
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
            "Use level number from resolve_container output (e.g., if resolve_container shows 'Level 3' as your target container, use ancestorLevel: 3)",
        },
      },
      required: ["ref", "ancestorLevel"],
    },
  },
  {
    name: "extract_anchors",
    description:
      "STEP 3: After identifying the right ancestor level from inspect_pattern, explore the internal structure within that container to find unique identifying elements (headings, labels, specific text). This discovers semantic identifiers that make selectors robust and human-readable. Use same ancestorLevel as inspect_pattern.",
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
            "Use the same level number identified from inspect_pattern analysis (the ancestor level that contains your target scope)",
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
];
