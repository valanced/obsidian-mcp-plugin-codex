# Codex Fork Adaptation

This fork keeps the upstream repository mergeable by concentrating local
behavior in `src/codex-fork.ts`.

## Upstream

- Upstream repository: <https://github.com/aaronsb/obsidian-mcp-plugin>
- Fork repository: <https://github.com/valanced/obsidian-mcp-plugin-codex>
- Upstream plugin id: `semantic-vault-mcp`
- Fork plugin id: `codex-obsidian-mcp`
- License: MIT

## Merge Policy

Prefer merging or rebasing upstream changes normally, then re-check these small
adaptation points:

- `src/codex-fork.ts`
- package and manifest metadata
- tiny imports/usages of `CODEX_FORK` in runtime files
- MCPB output names in `scripts/build-mcpb.mjs` and `scripts/make-mcpb.mjs`
- `.mcpignore` default template injection

Avoid broad rewrites of upstream documentation and implementation files. Add
Codex-specific notes in separate files unless a runtime hook is needed.

## First Run

The fork assumes Codex may be connected to a personal notes vault. For that
reason, the fork gate enables `.mcpignore` handling by default and recommends
excluding Obsidian internals, Git metadata, trash, journals, and other private
areas before writes are enabled.

Recommended flow:

1. Install the plugin.
2. Enable read-only mode.
3. Create `.mcpignore` from the plugin settings or `codex-default.mcpignore`.
4. Confirm Codex can search and summarize.
5. Enable writes only after Obsidian Sync, Git, Time Machine, or equivalent
   version history is in place.
