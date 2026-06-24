#!/usr/bin/env node
'use strict';

const { createInterface } = require('node:readline');

const FETCH_TIMEOUT_MS = 30_000;
const DEFAULT_HTTP_PORT = '3001';
const DEFAULT_HTTPS_PORT = '3443';
const DEFAULT_HOST = 'localhost';
const DEFAULT_PATH = '/mcp';
const USER_CONFIG_PLACEHOLDER = /^\$\{user_config\.[A-Za-z0-9_.-]+}$/;

let sessionId = null;
let notifyAbort = null;
let initializing = null;
let cachedInitialize = null;
let reinitCounter = 0;
let bridgeConfig = { url: 'http://localhost:3001/mcp', authorization: '' };

function cleanEnv(value) {
  if (!value || USER_CONFIG_PLACEHOLDER.test(value)) return '';
  return value.trim();
}

function readConfigValue(env, codexName, envName) {
  return cleanEnv(env[codexName]) || cleanEnv(env[envName]);
}

function normalizeProtocol(value) {
  const protocol = cleanEnv(value).replace(/:$/, '').toLowerCase();
  if (!protocol) return 'http';
  if (protocol !== 'http' && protocol !== 'https') {
    throw new Error(`OBSIDIAN_MCP_PROTOCOL must be "http" or "https", got "${value}"`);
  }
  return protocol;
}

function normalizePath(value) {
  const path = cleanEnv(value) || DEFAULT_PATH;
  return path.startsWith('/') ? path : `/${path}`;
}

function normalizePort(value, protocol) {
  const port = cleanEnv(value) || (protocol === 'https' ? DEFAULT_HTTPS_PORT : DEFAULT_HTTP_PORT);
  const portNumber = Number(port);
  if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
    throw new Error(`OBSIDIAN_MCP_PORT must be an integer from 1 to 65535, got "${value}"`);
  }
  return String(portNumber);
}

function buildUrlFromParts(env) {
  const protocol = normalizeProtocol(readConfigValue(env, 'CODEX_OBSIDIAN_MCP_PROTOCOL', 'OBSIDIAN_MCP_PROTOCOL'));
  const host = readConfigValue(env, 'CODEX_OBSIDIAN_MCP_HOST', 'OBSIDIAN_MCP_HOST') || DEFAULT_HOST;
  const port = normalizePort(readConfigValue(env, 'CODEX_OBSIDIAN_MCP_PORT', 'OBSIDIAN_MCP_PORT'), protocol);
  const path = normalizePath(readConfigValue(env, 'CODEX_OBSIDIAN_MCP_PATH', 'OBSIDIAN_MCP_PATH'));

  const url = new URL(`${protocol}://${host}`);
  url.port = port;
  url.pathname = path;
  return url.toString();
}

function resolveMcpUrl(env) {
  const explicitUrl =
    readConfigValue(env, 'CODEX_OBSIDIAN_MCP_URL', 'OBSIDIAN_MCP_URL') ||
    cleanEnv(env.MCP_URL);
  const url = new URL(explicitUrl || buildUrlFromParts(env));
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Obsidian MCP URL must use http or https, got "${url.protocol}"`);
  }
  return url.toString();
}

function resolveAuthorization(env) {
  const explicitAuthorization =
    readConfigValue(env, 'CODEX_OBSIDIAN_MCP_AUTHORIZATION', 'OBSIDIAN_MCP_AUTHORIZATION');
  if (explicitAuthorization) return explicitAuthorization;

  const apiKey =
    readConfigValue(env, 'CODEX_OBSIDIAN_MCP_API_KEY', 'OBSIDIAN_MCP_API_KEY') ||
    cleanEnv(env.MCP_API_KEY);
  return apiKey ? `Bearer ${apiKey}` : '';
}

function resolveConfig(env) {
  const url = resolveMcpUrl(env);
  return {
    url,
    authorization: resolveAuthorization(env),
  };
}

function headers(extra = {}) {
  const h = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    ...extra,
  };
  if (bridgeConfig.authorization) h.Authorization = bridgeConfig.authorization;
  if (sessionId) h['Mcp-Session-Id'] = sessionId;
  return h;
}

function emit(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

async function consumeSse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let match;
    while ((match = /\r?\n\r?\n/.exec(buf)) !== null) {
      const frame = buf.slice(0, match.index);
      buf = buf.slice(match.index + match[0].length);
      const data = frame
        .split(/\r?\n/)
        .filter(l => l.startsWith('data:'))
        .map(l => l.slice(5).trimStart())
        .join('\n');
      if (!data) continue;
      try { emit(JSON.parse(data)); }
      catch (e) { process.stderr.write(`[codex-obsidian-mcp] SSE parse: ${e.message}\n`); }
    }
  }
}

async function startNotifyStream() {
  if (notifyAbort) return;
  notifyAbort = new AbortController();
  try {
    const response = await fetch(bridgeConfig.url, {
      method: 'GET',
      headers: headers({ Accept: 'text/event-stream' }),
      signal: notifyAbort.signal,
    });
    const ctype = response.headers.get('content-type') || '';
    if (response.ok && ctype.includes('text/event-stream')) {
      await consumeSse(response);
    } else {
      await response.body?.cancel().catch(() => {});
    }
  } catch (e) {
    if (e.name !== 'AbortError') {
      process.stderr.write(`[codex-obsidian-mcp] notify stream ended: ${e.message}\n`);
    }
  } finally {
    notifyAbort = null;
  }
}

async function postOnce(message) {
  return await fetch(bridgeConfig.url, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

async function reinitialize() {
  if (!cachedInitialize) return false;
  sessionId = null;
  if (notifyAbort) { notifyAbort.abort(); notifyAbort = null; }

  let response;
  try {
    response = await postOnce({ ...cachedInitialize, id: `reinit-${reinitCounter++}` });
  } catch (e) {
    process.stderr.write(`[codex-obsidian-mcp] reinit fetch failed: ${e.message}\n`);
    return false;
  }
  const sid = response.headers.get('mcp-session-id');
  await response.body?.cancel().catch(() => {});
  if (!response.ok || !sid) {
    process.stderr.write(`[codex-obsidian-mcp] reinit failed: HTTP ${response.status}${sid ? '' : ', no session id'}\n`);
    return false;
  }
  sessionId = sid;

  try {
    const note = await postOnce({ jsonrpc: '2.0', method: 'notifications/initialized' });
    if (note.status !== 200 && note.status !== 202) {
      process.stderr.write(`[codex-obsidian-mcp] reinit: notifications/initialized -> HTTP ${note.status}\n`);
    }
    await note.body?.cancel().catch(() => {});
  } catch (e) {
    process.stderr.write(`[codex-obsidian-mcp] reinit: notifications/initialized failed: ${e.message}\n`);
  }

  startNotifyStream();
  return true;
}

async function dispatch(message, isReplay = false) {
  if (!sessionId && initializing && message.method !== 'initialize') {
    try { await initializing; } catch { /* dispatch surfaces its own error below */ }
  }

  let response;
  try {
    response = await postOnce(message);
  } catch (err) {
    process.stderr.write(`[codex-obsidian-mcp] fetch failed for ${bridgeConfig.url}: ${err.message}\n`);
    if (message.id != null) {
      emit({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: `Bridge: ${err.message}` } });
    }
    return;
  }

  if (message.method === 'initialize') {
    cachedInitialize = message;
    const sid = response.headers.get('mcp-session-id');
    if (sid) {
      sessionId = sid;
      startNotifyStream();
    }
  }

  if (response.status === 404) {
    if (!isReplay && message.method !== 'initialize' && cachedInitialize) {
      if (!initializing) {
        initializing = reinitialize().finally(() => { initializing = null; });
      }
      let healed = false;
      try { healed = await initializing; } catch { healed = false; }
      if (healed) {
        return await dispatch(message, true);
      }
    }
    sessionId = null;
    if (notifyAbort) { notifyAbort.abort(); notifyAbort = null; }
    if (message.id != null) {
      emit({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: 'Session expired and automatic reinitialize failed; please retry.' } });
    }
    return;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    process.stderr.write(`[codex-obsidian-mcp] HTTP ${response.status}: ${text.slice(0, 200)}\n`);
    if (message.id != null) {
      emit({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: `Bridge: HTTP ${response.status}` } });
    }
    return;
  }

  if (response.status === 202) {
    await response.body?.cancel().catch(() => {});
    return;
  }

  const ctype = response.headers.get('content-type') || '';
  if (ctype.includes('text/event-stream')) {
    await consumeSse(response);
  } else {
    const text = await response.text();
    if (!text) return;
    try { emit(JSON.parse(text)); }
    catch (e) { process.stderr.write(`[codex-obsidian-mcp] JSON parse: ${e.message}\n`); }
  }
}

function printConfig() {
  process.stdout.write(JSON.stringify({
    url: bridgeConfig.url,
    hasAuthorization: Boolean(bridgeConfig.authorization),
  }, null, 2) + '\n');
}

function main() {
  try {
    bridgeConfig = resolveConfig(process.env);
  } catch (e) {
    process.stderr.write(`[codex-obsidian-mcp] ${e.message}\n`);
    process.exit(1);
  }

  if (process.argv.includes('--print-config')) {
    printConfig();
    return;
  }

  if (typeof fetch !== 'function') {
    process.stderr.write('[codex-obsidian-mcp] Node.js 18 or newer is required because this bridge uses fetch()\n');
    process.exit(1);
  }

  const rl = createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg;
    try { msg = JSON.parse(trimmed); }
    catch (e) {
      process.stderr.write(`[codex-obsidian-mcp] stdin parse: ${e.message}\n`);
      return;
    }
    if (msg.method === 'initialize') {
      initializing = dispatch(msg).finally(() => { initializing = null; });
      initializing.catch(err => {
        process.stderr.write(`[codex-obsidian-mcp] dispatch: ${err.message}\n`);
      });
    } else {
      dispatch(msg).catch(err => {
        process.stderr.write(`[codex-obsidian-mcp] dispatch: ${err.message}\n`);
      });
    }
  });

  process.stdin.on('end', async () => {
    if (notifyAbort) notifyAbort.abort();
    if (sessionId) {
      try {
        await fetch(bridgeConfig.url, {
          method: 'DELETE',
          headers: headers(),
          signal: AbortSignal.timeout(5_000),
        });
      } catch { /* Obsidian may already be closed. */ }
    }
    process.exit(0);
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  dispatch,
  reinitialize,
  resolveConfig,
  __reset() {
    sessionId = null;
    notifyAbort = null;
    initializing = null;
    cachedInitialize = null;
    reinitCounter = 0;
    bridgeConfig = resolveConfig(process.env);
  },
  __setConfig(config) {
    bridgeConfig = config;
  },
  __state() {
    return { sessionId, cachedInitialize, initializing, bridgeConfig };
  },
};
