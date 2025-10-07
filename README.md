## Installation

### Option 1: npx (Recommended - No Installation)

Run directly without installation:

\`\`\`bash
npx verdex-mcp-server --role customer /path/to/auth.json https://example.com
\`\`\`

### Option 2: Global Installation

\`\`\`bash
npm install -g verdex-mcp-server
verdex-mcp-server --role customer /path/to/auth.json https://example.com
\`\`\`

### Option 3: Local Development

\`\`\`bash
git clone [repo-url]
cd browser-bridge
npm install
npm run build
node dist/verdex-mcp-server.js --role customer /path/to/auth.json
\`\`\`

## MCP Configuration

### Using npx (Recommended)

\`\`\`json
{
  "mcpServers": {
    "verdex": {
      "command": "npx",
      "args": [
        "verdex-mcp-server",
        "--role", "customer", "/path/to/customer.json", "https://...",
        "--role", "admin", "/path/to/provider.json", "https://..."
      ]
    }
  }
}
\`\`\`