#!/usr/bin/env node
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const kit = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'LICENSE', 'development-standards.json', 'coverlet.runsettings',
  'config/suppression-baseline.json', 'config/typescript-coverage.json', 'config/feature-map.json',
  'scripts/Test-CoverageGate.ps1', 'scripts/Get-CrapReport.ps1', 'scripts/Test-TypeScriptCoverageGate.mjs',
  'scripts/check-suppressions.mjs', 'scripts/check-feature-map.mjs', 'scripts/check-pr-verification.mjs',
  'scripts/verify.mjs', 'docs/testing.md', 'docs/coverage.md', 'docs/verification.md', 'docs/suppressions.md',
  'docs/adoption.md', 'docs/provenance.md',
];
const begin = '<!-- development-standards:begin -->';
const end = '<!-- development-standards:end -->';

function safeDestination(root, relative) {
  const destination = path.resolve(root, relative);
  const rel = path.relative(root, destination);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`Path escapes target: ${relative}`);
  let current = root;
  for (const part of rel.split(path.sep)) {
    current = path.join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error(`Symlink destination: ${relative}`);
  }
  return destination;
}

export function install(target, { dryRun = false, source = kit } = {}) {
  if (!existsSync(target) || !lstatSync(target).isDirectory()) throw new Error('Target must be an existing directory.');
  const root = realpathSync(target);
  if (root === realpathSync(source)) throw new Error('Install into a consuming project, not the kit.');
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' });
  if (revision.status !== 0) throw new Error('Standards source must have a Git commit.');
  const fragment = readFileSync(path.join(source, 'templates/AGENTS.fragment.md'), 'utf8');
  const writes = files.map((name) => [name, readFileSync(path.join(source, name), 'utf8')]);
  // A license belonging to the consuming project must remain intact.
  const license = writes.find(([name]) => name === 'LICENSE');
  license[0] = 'docs/development-standards-LICENSE';
  writes.push(['.github/pull_request_template.md', readFileSync(path.join(source, 'templates/pull_request_template.md'), 'utf8')]);
  writes.push(['examples/development-standards-quality.yml', readFileSync(path.join(source, 'examples/consumer-quality.yml'), 'utf8')]);
  writes.push(['examples/development-standards-pr-verification.yml', readFileSync(path.join(source, 'examples/consumer-pr-verification.yml'), 'utf8')]);
  writes.push(['development-standards.lock.json', `${JSON.stringify({ repository: 'https://github.com/RichardOrchardOrganisation/development-standards', commit: revision.stdout.trim(), version: JSON.parse(readFileSync(path.join(source, 'package.json'), 'utf8')).version }, null, 2)}\n`]);
  const agentsPath = safeDestination(root, 'AGENTS.md');
  const existing = existsSync(agentsPath) ? readFileSync(agentsPath, 'utf8') : '';
  const block = `${begin}\n${fragment.trim()}\n${end}`;
  if (existing.includes(begin)) {
    const start = existing.indexOf(begin);
    const stop = existing.indexOf(end, start);
    if (stop < 0 || existing.slice(start, stop + end.length) !== block) throw new Error('Existing managed AGENTS section differs; review an update manually.');
  } else {
    if (existing.includes(end)) throw new Error('Malformed managed AGENTS section.');
    writes.push(['AGENTS.md', `${existing.trimEnd()}${existing ? '\n\n' : ''}${block}\n`]);
  }
  const planned = [];
  for (const [name, content] of writes) {
    const destination = safeDestination(root, name);
    if (existsSync(destination)) {
      if (name !== 'AGENTS.md' && readFileSync(destination, 'utf8') !== content) throw new Error(`Refusing to overwrite ${name}. Review a manual adoption/update.`);
      if (name !== 'AGENTS.md') continue;
    }
    planned.push([name, destination, content]);
  }
  if (!dryRun) for (const [, destination, content] of planned) {
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, content);
  }
  return planned.map(([name]) => name);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => !['--target', '--dry-run'].includes(arg) && arg !== args[args.indexOf('--target') + 1])) throw new Error('Unknown argument.');
    const at = args.indexOf('--target');
    if (at < 0 || !args[at + 1]) throw new Error('Usage: node scripts/install.mjs --target /path/to/project [--dry-run]');
    const names = install(path.resolve(args[at + 1]), { dryRun: args.includes('--dry-run') });
    console.log(`${args.includes('--dry-run') ? 'Would install' : 'Installed'} ${names.length} files:\n${names.join('\n')}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
