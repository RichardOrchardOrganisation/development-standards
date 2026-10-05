#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function loadMap(root = process.cwd()) {
  const config = JSON.parse(readFileSync(path.join(root, 'development-standards.json'), 'utf8'));
  const map = JSON.parse(readFileSync(path.join(root, 'config/feature-map.json'), 'utf8'));
  if (!Array.isArray(config.uiPaths) || !Array.isArray(map.features)) throw new Error('uiPaths and features must be arrays.');
  const ids = new Set();
  for (const feature of map.features) {
    if (!feature.id || ids.has(feature.id) || !feature.command || !feature.platform || !Array.isArray(feature.sources) || !feature.sources.length) throw new Error('Each feature needs a unique id, command, platform, and sources.');
    ids.add(feature.id);
    for (const source of feature.sources) {
      if (typeof source !== 'string' || !source || path.isAbsolute(source) || source.split('/').includes('..')) throw new Error(`Invalid feature source: ${source}`);
      if (!existsSync(path.join(root, source))) throw new Error(`Missing feature source: ${source}`);
    }
  }
  for (const source of config.uiPaths) if (typeof source !== 'string' || !source || path.isAbsolute(source) || source.split('/').includes('..')) throw new Error('UI paths must be nonempty repository-relative prefixes.');
  return { config, features: map.features };
}
export function matchingFeatures(file, features) {
  return features.filter((feature) => feature.sources.some((source) => source.endsWith('/') ? file.startsWith(source) : file === source));
}
function filesUnder(root, prefix) {
  const full = path.join(root, prefix);
  if (!existsSync(full)) throw new Error(`Configured UI path does not exist: ${prefix}`);
  if (!prefix.endsWith('/')) return [prefix];
  const files = [];
  for (const item of readdirSync(full, { withFileTypes: true })) {
    if (item.name.startsWith('.') || ['node_modules', 'bin', 'obj'].includes(item.name)) continue;
    const next = `${prefix}${item.name}`;
    if (item.isDirectory()) files.push(...filesUnder(root, `${next}/`));
    else if (item.isFile()) files.push(next);
  }
  return files;
}
export function checkMap(root = process.cwd()) {
  const { config, features } = loadMap(root);
  const files = config.uiPaths.flatMap((prefix) => filesUnder(root, prefix));
  const missing = files.filter((file) => !/\.(test|spec)\.[cm]?[jt]sx?$/.test(file) && !matchingFeatures(file, features).length);
  if (missing.length) throw new Error(`Unmapped UI files:\n${missing.join('\n')}`);
  return files.length;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try { console.log(`Feature map covers ${checkMap()} configured UI files.`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
