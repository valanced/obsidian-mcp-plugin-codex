# Codex Obsidian MCP Plugin

This directory is the Codex plugin package used by
`.agents/plugins/marketplace.json`.

Codex starts `server.js` as a stdio MCP bridge. The bridge connects to the
Obsidian plugin's local HTTP or HTTPS MCP endpoint.

Configure it with:

```bash
export OBSIDIAN_MCP_URL="http://localhost:3001/mcp"
export OBSIDIAN_MCP_API_KEY="paste-api-key-from-obsidian-settings"
```

Or configure the URL by parts with `OBSIDIAN_MCP_PROTOCOL`,
`OBSIDIAN_MCP_HOST`, `OBSIDIAN_MCP_PORT`, and `OBSIDIAN_MCP_PATH`.
