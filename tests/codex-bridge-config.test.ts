// eslint-disable-next-line @typescript-eslint/no-require-imports -- Codex bridge is plain CommonJS so it can run without a build step.
const bridge = require('../plugins/codex/server.js') as {
  resolveConfig: (env: Record<string, string | undefined>) => { url: string; authorization: string };
};

describe('Codex plugin bridge configuration', () => {
  test('defaults to the Obsidian HTTP MCP endpoint', () => {
    expect(bridge.resolveConfig({})).toEqual({
      url: 'http://localhost:3001/mcp',
      authorization: '',
    });
  });

  test('supports a custom HTTP port and bearer token', () => {
    expect(bridge.resolveConfig({
      OBSIDIAN_MCP_PORT: '3010',
      OBSIDIAN_MCP_API_KEY: 'test-key',
    })).toEqual({
      url: 'http://localhost:3010/mcp',
      authorization: 'Bearer test-key',
    });
  });

  test('uses the HTTPS default port when protocol is https', () => {
    expect(bridge.resolveConfig({
      OBSIDIAN_MCP_PROTOCOL: 'https',
    })).toEqual({
      url: 'https://localhost:3443/mcp',
      authorization: '',
    });
  });

  test('explicit URL and authorization override split settings', () => {
    expect(bridge.resolveConfig({
      OBSIDIAN_MCP_URL: 'https://127.0.0.1:4555/mcp',
      OBSIDIAN_MCP_PROTOCOL: 'http',
      OBSIDIAN_MCP_PORT: '3010',
      OBSIDIAN_MCP_AUTHORIZATION: 'Bearer custom',
      OBSIDIAN_MCP_API_KEY: 'ignored',
    })).toEqual({
      url: 'https://127.0.0.1:4555/mcp',
      authorization: 'Bearer custom',
    });
  });

  test('ignores unresolved Codex user_config placeholders', () => {
    expect(bridge.resolveConfig({
      CODEX_OBSIDIAN_MCP_URL: '${user_config.url}',
      CODEX_OBSIDIAN_MCP_PORT: '${user_config.port}',
      OBSIDIAN_MCP_PORT: '3011',
      OBSIDIAN_MCP_API_KEY: 'test-key',
    })).toEqual({
      url: 'http://localhost:3011/mcp',
      authorization: 'Bearer test-key',
    });
  });

  test('rejects invalid protocol and port values', () => {
    expect(() => bridge.resolveConfig({ OBSIDIAN_MCP_PROTOCOL: 'ftp' })).toThrow(/http.*https/);
    expect(() => bridge.resolveConfig({ OBSIDIAN_MCP_PORT: '99999' })).toThrow(/1 to 65535/);
  });
});
