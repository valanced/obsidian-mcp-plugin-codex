#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';

try {
  // Read version from package.json
  const packageJson = JSON.parse(readFileSync('package.json', 'utf-8'));
  const version = packageJson.version;

  // package.json is the single source of truth for both version and the
  // plugin description. mcpb/manifest.json keeps its own Claude-Desktop
  // specific description and is intentionally not synced here.
  const description = packageJson.description;

  // Read and update manifest.json
  const manifest = JSON.parse(readFileSync('manifest.json', 'utf-8'));
  manifest.version = version;
  manifest.description = description;

  // Write updated manifest.json
  writeFileSync('manifest.json', JSON.stringify(manifest, null, 2) + '\n');

  // Read and update mcpb/manifest.json (MCPB bundle for Claude Desktop)
  const mcpbManifest = JSON.parse(readFileSync('mcpb/manifest.json', 'utf-8'));
  mcpbManifest.version = version;
  writeFileSync('mcpb/manifest.json', JSON.stringify(mcpbManifest, null, 2) + '\n');

  // Read and update Codex plugin manifests, when present.
  const versionWithExistingBuildMetadata = (existingVersion) => {
    if (typeof existingVersion !== 'string') return version;
    const buildMetadataIndex = existingVersion.indexOf('+');
    return buildMetadataIndex === -1
      ? version
      : `${version}${existingVersion.slice(buildMetadataIndex)}`;
  };

  for (const codexManifestPath of [
    '.codex-plugin/plugin.json',
    'plugins/codex/.codex-plugin/plugin.json',
  ]) {
    const codexPluginManifest = JSON.parse(readFileSync(codexManifestPath, 'utf-8'));
    codexPluginManifest.version = versionWithExistingBuildMetadata(codexPluginManifest.version);
    codexPluginManifest.description = description;
    writeFileSync(codexManifestPath, JSON.stringify(codexPluginManifest, null, 2) + '\n');
  }

  // Update version.ts
  const versionTs = `// Version is injected at build time by sync-version.mjs
export function getVersion(): string {
  return '${version}';
}
`;
  writeFileSync('src/version.ts', versionTs);

  console.log(`✅ Synced version ${version} + description to manifest.json and Codex plugin manifests (version also: mcpb/manifest.json, version.ts)`);
} catch (error) {
  console.error('❌ Failed to sync version:', error.message);
  process.exit(1);
}
