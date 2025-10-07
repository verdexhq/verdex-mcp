# Browser Bridge MCP Server

A Model Context Protocol (MCP) server that provides browser automation capabilities using Puppeteer.

## Available Tools

The server exposes the following tools:

- **browser_initialize**: Initialize the browser instance
- **browser_navigate**: Navigate to a URL and return page snapshot
- **browser_snapshot**: Take a snapshot of the current page's accessibility tree
- **browser_click**: Click an element by its reference ID
- **browser_type**: Type text into an input element
- **browser_inspect**: Get detailed information about an element
- **wait_for_browser**: Wait for a specified amount of time
- **browser_close**: Close the browser instance

## Usage

### Running the MCP Server

```bash
# Development mode (with TypeScript)
npm run mcp-server

# Production mode (compiled)
npm run build
npm run mcp-server:build
```

### MCP Configuration

To use this server with an MCP client, add this to your `mcp.json` configuration:

```json
{
  "mcpServers": {
    "browser-bridge": {
      "command": "npm",
      "args": ["run", "mcp-server"],
      "cwd": "/path/to/your/browser-bridge"
    }
  }
}
```

**Alternative configurations:**

Using compiled version:
```json
{
  "mcpServers": {
    "browser-bridge": {
      "command": "node", 
      "args": ["dist/verdex-mcp-server.js"],
      "cwd": "/path/to/your/browser-bridge"
    }
  }
}
```

Using tsx directly:
```json
{
  "mcpServers": {
    "browser-bridge": {
      "command": "npx",
      "args": ["tsx", "src/verdex-mcp-server.ts"], 
      "cwd": "/path/to/your/browser-bridge"
    }
  }
}
```

### Basic Workflow

1. Initialize the browser: `browser_initialize`
2. Navigate to a page: `browser_navigate` with URL
3. Take a snapshot to see available elements: `browser_snapshot`
4. Interact with elements using their ref IDs: `browser_click`, `browser_type`
5. Close browser when done: `browser_close`

### Example Element References

The page snapshot will show interactive elements with reference IDs like:

```
- button "Submit" [ref=e1]
- textbox "Username" [id='username'] [ref=e2]  
- link "Home" [href='/'] [ref=e3]
```

You can then interact with these elements using their ref IDs (e1, e2, e3, etc.).

## Configuration

### Environment Variables

You can configure the browser bridge performance using environment variables:

```bash
# Maximum depth to traverse when analyzing DOM descendants (default: 4)
export BRIDGE_MAX_DEPTH=4

# Maximum number of siblings to analyze at each level (default: 15)
export BRIDGE_MAX_SIBLINGS=15

# Maximum total number of descendants to process (default: 100)
export BRIDGE_MAX_DESCENDANTS=100
```

**Example configurations for different scenarios:**

For simple pages (faster performance):
```bash
export BRIDGE_MAX_DEPTH=2
export BRIDGE_MAX_SIBLINGS=10
export BRIDGE_MAX_DESCENDANTS=50
```

For complex pages (more thorough analysis):
```bash
export BRIDGE_MAX_DEPTH=6
export BRIDGE_MAX_SIBLINGS=25
export BRIDGE_MAX_DESCENDANTS=200
```

### Programmatic Configuration

You can also set configuration programmatically (this overrides environment variables):

```javascript
const browser = new MultiContextBrowser();

// Set custom performance limits
browser.setBridgeConfiguration({
  maxDepth: 6,
  maxSiblings: 20,
  maxDescendants: 150
});

await browser.initialize();
```

## Features

- Accessibility-focused element detection
- Automatic element reference generation
- Detailed element inspection
- Cross-platform browser automation
- Error handling and validation
- Configurable performance limits via environment variables

## Requirements

- Node.js 18+
- TypeScript 5.8+
- Chrome/Chromium browser (installed automatically by Puppeteer) 