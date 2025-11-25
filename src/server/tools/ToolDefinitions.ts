export const TOOL_DEFINITIONS = [
  // Core browser functionality
  {
    name: "browser_initialize",
    description:
      "Initialize browser instance. Required before any browser operations (browser_navigate, browser_click, browser_snapshot, select_role etc.).",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "browser_navigate",
    description: `Navigate to a URL. Returns accessibility tree snapshot showing interactive elements with temporary reference IDs (e1, e2, e3, etc.).

Example output:
  button "Add to Cart" [ref=e25]
  button "Add to Cart" [ref=e26]
  textbox "Email" [ref=e1]

Note: Refs are temporary identifiers valid for the current page state. They change on navigation or page refresh.`,
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
    description: `Capture the current page state as an accessibility tree with interactive elements labeled with reference IDs (e1, e2, etc.).

Shows:
- Headings and text content
- Interactive elements (buttons, links, inputs) with refs
- Element states (disabled, checked, invalid)
- ARIA landmarks and roles

Example output:
  heading "Products" [level=1]
  button "Add to Cart" [ref=e25]
  button "Add to Cart" [ref=e26]
  link "Checkout" [ref=e30]`,
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "browser_click",
    description: `Click an element using its reference ID from the snapshot.

Example: browser_click("e25") clicks the element labeled [ref=e25] in the most recent snapshot.`,
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
    description: `Type text into an input field using its reference ID from the snapshot.

Example: browser_type("e1", "test@example.com") types into the element labeled [ref=e1].`,
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
    description: `Wait for a specified number of milliseconds.

Default: 1000ms (1 second) if not specified.`,
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
    description:
      "Close browser instance and clean up resources. Terminates the browser context created by browser_initialize.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },

  // Element analysis tools
  {
    name: "resolve_container",
    description: `Examine the DOM ancestry of an element, showing parent containers and their attributes up to <body>.

Returns ancestor chain with:
- Level numbers (1 = immediate parent, 2 = grandparent, etc.)
- Tag names at each level
- All attributes at each level (data-testid, id, role, aria-*, class, etc.)

Example output:
  Level 1 (div): {"class": "product-details"}
  Level 2 (article): {"data-testid": "product-card", "role": "article"}
  Level 3 (div): {"data-testid": "product-grid"}
  Level 4 (main): {"role": "main"}`,
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
    description: `Analyze sibling elements at a specific ancestor level, showing their attributes and content outline.

Parameters:
- ref: Element reference from snapshot
- ancestorLevel: Level number from resolve_container (1 = immediate parent, 2 = grandparent, etc.)

Returns sibling analysis:
- Count of siblings at that level
- Attributes for each sibling
- Content outline (text, headings, key elements)

Example output:
  Found 6 siblings at ancestor level 2:
  
  Sibling 1: {"data-testid": "product-card"}
    Contains: "iPhone 15 Pro", "$999", "Add to Cart"
  Sibling 2: {"data-testid": "product-card"}
    Contains: "MacBook Pro", "$1,999", "Add to Cart"
  Sibling 3: {"data-testid": "product-card"}
    Contains: "iPad Air", "$599", "Add to Cart"`,
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
            "Level number from resolve_container output (e.g., 2 for grandparent)",
        },
      },
      required: ["ref", "ancestorLevel"],
    },
  },
  {
    name: "extract_anchors",
    description: `Deep scan of content within a container at a specific ancestor level.

Parameters:
- ref: Element reference from snapshot
- ancestorLevel: Level number from resolve_container

Returns detailed content tree showing:
- Tag names
- Text content
- Attributes (data-testid, id, aria-*, etc.)
- Nesting depth

Example output:
  Descendants at ancestor level 2:
  - tag: "h3", text: "iPhone 15 Pro", depth: 1
  - tag: "span", attrs: {"data-testid": "price"}, text: "$999", depth: 2
  - tag: "button", text: "Add to Cart", depth: 3
  - tag: "img", attrs: {"alt": "iPhone 15 Pro"}, depth: 2`,
    inputSchema: {
      type: "object",
      properties: {
        ref: {
          type: "string",
          description: "Element reference ID (e.g., 'e1', 'e2')",
        },
        ancestorLevel: {
          type: "number",
          description: "Level number from resolve_container output",
        },
      },
      required: ["ref", "ancestorLevel"],
    },
  },
  // Multi-role functionality
  {
    name: "get_current_role",
    description:
      "Get the currently active browser role/context. Useful when managing multiple browser contexts for different user roles or test scenarios.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "list_current_roles",
    description:
      "List all available browser roles/contexts. Use this to see what roles are configured and available for switching.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "select_role",
    description:
      "Switch to a different browser role/context. Useful for testing different user permissions or scenarios without reinitializing the browser.",
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
