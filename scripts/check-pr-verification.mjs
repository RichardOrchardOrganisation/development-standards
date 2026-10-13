#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadMap, matchingFeatures } from './check-feature-map.mjs';
import { evaluateProof, checkProof } from './ui-proof-policy.mjs';

export function proofPolicy({ files, config, features }) {
  const ui = files.filter(file => !/\.(test|spec)\.[cm]?[jt]sx?$/.test(file)
    && config.uiPaths.some(prefix => prefix.endsWith('/') ? file.startsWith(prefix) : file === prefix));
  return {
    requirements: ui.flatMap(file => {
      const matches = matchingFeatures(file, features);
      return matches.length ? matches.map(feature => ({ file, ids: [feature.id] })) : [{ file, ids: [] }];
    }),
    features: features.map(feature => ({ ...feature, platforms: feature.platforms || [feature.platform] })),
  };
}

export function evaluate(input) {
  const result = evaluateProof({ ...input, ...proofPolicy(input) });
  return { ...result, reason: result.error };
}

export async function checkPullRequestVerification({ root = process.cwd(), ...options }) {
  return checkProof({ ...options, root, loadPolicy: files => proofPolicy({ files, ...loadMap(root) }) });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    if (!process.argv[2]) throw new Error('Usage: node scripts/check-pr-verification.mjs <payload.json>');
    const payload = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    const result = evaluate({ ...payload, ...loadMap() });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
