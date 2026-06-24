export const CODEX_FORK = {
	enabled: true,
	pluginId: 'codex-obsidian-mcp',
	displayName: 'Codex Obsidian MCP',
	mcpbDownloadUrl: 'https://github.com/valanced/obsidian-mcp-plugin-codex/releases/latest/download/codex-obsidian-mcp.mcpb',
	mcpbDownloadLabel: 'Download codex-obsidian-mcp.mcpb',
	codexBearerEnvVar: 'OBSIDIAN_MCP_API_KEY',
	defaults: {
		pathExclusionsEnabled: true,
		enableIgnoreContextMenu: true
	},
	defaultIgnorePatterns: [
		'.git/',
		'.trash/',
		'.DS_Store',
		'Thumbs.db',
		'*.tmp',
		'*.backup',
		'*.bak',
		'~*',
		'.#*'
	]
} as const;

export function codexForkValue<T>(upstreamValue: T, forkValue: T): T {
	return CODEX_FORK.enabled ? forkValue : upstreamValue;
}

export function codexDefaultIgnoreBlock(configDir: string): string {
	if (!CODEX_FORK.enabled) {
		return '';
	}

	const configDirPattern = `${configDir.replace(/^\/+|\/+$/g, '')}/`;
	const patterns = [configDirPattern, ...CODEX_FORK.defaultIgnorePatterns];

	return `# === CODEX FORK ACTIVE DEFAULTS ===
# Never expose Obsidian/plugin/git internals to MCP clients.
${patterns.join('\n')}

`;
}
