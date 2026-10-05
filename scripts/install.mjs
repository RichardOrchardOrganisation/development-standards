#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { BEGIN, END, KIT_ROOT, LOCK_PATH, isMain, lockDocument, normalize, readInstallation, safeDestination, splitGuide, targetRoot } from './installation.mjs';

export function install(target, { dryRun = false, source = KIT_ROOT } = {}) {
  const root = targetRoot(target, source);
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' });
  if (revision.status !== 0) throw new Error('Standards source must have a Git commit.');
  const installation = readInstallation((name) => {
    const filename = path.join(source, name);
    return existsSync(filename) ? readFileSync(filename, 'utf8') : null;
  });
  const writes = [...installation.files];
  writes.push([LOCK_PATH, lockDocument(revision.stdout.trim(), installation.version)]);
  const agentsPath = safeDestination(root, 'AGENTS.md');
  const existing = existsSync(agentsPath) ? readFileSync(agentsPath, 'utf8') : '';
  if (existing.includes(BEGIN) || existing.includes(END)) {
    if (normalize(splitGuide(existing).block) !== normalize(installation.block)) throw new Error('Existing managed AGENTS section differs; use the update command.');
  } else {
    writes.push(['AGENTS.md', `${existing.trimEnd()}${existing ? '\n\n' : ''}${installation.block}\n`]);
  }
  const planned = [];
  for (const [name, content] of writes) {
    const destination = safeDestination(root, name);
    if (existsSync(destination)) {
      if (name !== 'AGENTS.md' && normalize(readFileSync(destination, 'utf8')) !== normalize(content)) throw new Error(`Refusing to overwrite ${name}. Review a manual adoption/update.`);
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

if (isMain(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => !['--target', '--dry-run'].includes(arg) && arg !== args[args.indexOf('--target') + 1])) throw new Error('Unknown argument.');
    const at = args.indexOf('--target');
    if (at < 0 || !args[at + 1]) throw new Error('Usage: node scripts/install.mjs --target /path/to/project [--dry-run]');
    const names = install(path.resolve(args[at + 1]), { dryRun: args.includes('--dry-run') });
    console.log(`${args.includes('--dry-run') ? 'Would install' : 'Installed'} ${names.length} files:\n${names.join('\n')}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
