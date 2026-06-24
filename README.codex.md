# Codex Obsidian MCP

Codex-focused fork of
[aaronsb/obsidian-mcp-plugin](https://github.com/aaronsb/obsidian-mcp-plugin).
The upstream plugin exposes an Obsidian vault through a local MCP server; this
fork keeps that implementation and adds a small merge-friendly Codex adaptation
gate in `src/codex-fork.ts`.

## What This Fork Changes

- Obsidian plugin id: `codex-obsidian-mcp`
- Display name: `Codex Obsidian MCP`
- MCPB release asset names: `codex-obsidian-mcp-<version>.mcpb` and
  `codex-obsidian-mcp.mcpb`
- `.mcpignore` support is enabled by default
- The generated `.mcpignore` template includes active exclusions for
  `.obsidian/`, `.git/`, `.trash/`, and temporary files
- The settings screen includes a Codex MCP command that reads the bearer token
  from `OBSIDIAN_MCP_API_KEY`

The local adaptation is intentionally small so upstream improvements can be
merged with fewer conflicts. See `ADAPTATION.md`.

## Build

```bash
npm install
npm run build
```

The Obsidian plugin artifacts are:

- `main.js`
- `manifest.json`
- `styles.css`

Copy those three files into:

```text
<vault>/.obsidian/plugins/codex-obsidian-mcp/
```

Then enable `Codex Obsidian MCP` in Obsidian's Community Plugins settings.

## Connect Codex

1. Open Obsidian and enable this plugin.
2. Open the plugin settings.
3. Copy the local MCP URL and API key.
4. Export the API key in the shell/environment Codex uses:

```bash
export OBSIDIAN_MCP_API_KEY="paste-api-key-here"
```

5. Add the HTTP MCP server to Codex:

```bash
codex mcp add obsidian --url http://localhost:3001/mcp --bearer-token-env-var OBSIDIAN_MCP_API_KEY
```

Durable Codex config:

```toml
[mcp_servers.obsidian]
url = "http://localhost:3001/mcp"
bearer_token_env_var = "OBSIDIAN_MCP_API_KEY"
default_tools_approval_mode = "prompt"
```

## Install As A Codex Plugin

This repository also includes a Codex marketplace descriptor:

- `.agents/plugins/marketplace.json`
- `plugins/codex/.codex-plugin/plugin.json`
- `plugins/codex/.mcp.json`

The Codex plugin points to the local Obsidian MCP endpoint at
`http://localhost:3001/mcp` and sends `Authorization: Bearer
${OBSIDIAN_MCP_API_KEY}`. Start Obsidian and set `OBSIDIAN_MCP_API_KEY` before
using the plugin from Codex.

To add the marketplace in Codex:

- Source: `https://github.com/valanced/obsidian-mcp-plugin-codex`
- Git ref: `main`
- Sparse paths: leave empty, or include both `.agents/plugins/marketplace.json`
  and `plugins/codex`

## Safety

Create a `.mcpignore` file in the vault root before broad write access:

```gitignore
.obsidian/
.git/
.trash/
private/
journal/
diary/
```

Use read-only mode first if you only need search and summaries.
