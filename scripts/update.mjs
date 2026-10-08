#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { KIT_ROOT, LOCK_PATH, isMain, REPOSITORY, lockDocument, normalize, readInstallation, safeDestination, splitGuide, targetRoot, validateRelativePath } from './installation.mjs';

function git(source, args) {
  const result = spawnSync('git', args, { cwd: source, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`Git failed (${args[0]}): ${result.error?.message || result.stderr.trim()}`);
  return result.stdout;
}

function snapshot(source, commit) {
  const entries = git(source, ['ls-tree', '-r', '-z', '--name-only', commit]).split('\0');
  const names = new Set(entries);
  return readInstallation((name) => names.has(name) ? git(source, ['show', `${commit}:${name}`]) : null);
}

function currentText(root, name) {
  const destination = safeDestination(root, name);
  return existsSync(destination) ? readFileSync(destination, 'utf8') : null;
}

function mergeText(base, local, incoming) {
  const ancestor = normalize(base);
  const current = normalize(local);
  const next = normalize(incoming);
  if (current === next || ancestor === next) return { content: local, conflict: false, merged: false };
  if (current === ancestor) return { content: incoming === null ? null : preserveEol(incoming, local), conflict: false, merged: false };
  if (ancestor === null) return { conflict: true, reason: 'New standards file already exists with different project content.' };
  if (current === null || next === null) return { conflict: true, reason: 'Deletion conflicts with changes in the other version.' };
  const temporary = mkdtempSync(path.join(tmpdir(), 'standards-merge-'));
  try {
    const filenames = ['project', 'installed', 'incoming'].map((name) => path.join(temporary, name));
    [current, ancestor, next].forEach((text, index) => writeFileSync(filenames[index], text));
    const result = spawnSync('git', ['merge-file', '--stdout', '--diff3', '-L', 'project', '-L', 'installed', '-L', 'incoming', ...filenames], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    if (result.error || result.status === null || result.status < 0 || result.status > 127) throw new Error(`Unable to merge standards text: ${result.error?.message || result.stderr.trim()}`);
    if (result.status !== 0) return { conflict: true, reason: 'Project and standards changed overlapping lines.' };
    return { content: preserveEol(result.stdout, local), conflict: false, merged: true };
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

function valueAt(document, key) {
  return key.split('.').reduce((value, part) => (value !== null && typeof value === 'object' ? value[part] : undefined), document);
}

/** A clean text merge must still not change a project-owned JSON value, such as a coverage floor. */
function reviewChange(current, next, keys) {
  if (!keys?.length || current === null || next === null || normalize(current) === normalize(next)) return null;
  let before;
  let after;
  try {
    before = JSON.parse(current);
    after = JSON.parse(next);
  } catch {
    return 'Merged configuration is not valid JSON; review it manually.';
  }
  const changed = keys.filter((key) => JSON.stringify(valueAt(before, key)) !== JSON.stringify(valueAt(after, key)));
  if (!changed.length) return null;
  const detail = changed.map((key) => `${key} ${JSON.stringify(valueAt(before, key)) ?? 'unset'} -> ${JSON.stringify(valueAt(after, key)) ?? 'unset'}`).join(', ');
  return `Project-owned value would change (${detail}). Set it in the project file deliberately, or keep the local file with --keep-local.`;
}

function preserveEol(text, local) {
  const normalized = normalize(text);
  return local?.includes('\r\n') ? normalized.replaceAll('\n', '\r\n') : normalized;
}

/** Plan a three-way update, then apply only when every conflict is resolved. */
export function update(target, { dryRun = false, source = KIT_ROOT, keepLocal = [] } = {}) {
  const root = targetRoot(target, source);
  const lockText = currentText(root, LOCK_PATH);
  if (lockText === null) throw new Error('No standards lock found. Install/adopt the kit before updating.');
  const lock = JSON.parse(lockText);
  if (lock.repository !== REPOSITORY || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(lock.commit || '') || typeof lock.version !== 'string') throw new Error('Invalid standards lock repository, commit, or version.');
  const to = git(source, ['rev-parse', 'HEAD^{commit}']).trim();
  if (git(source, ['status', '--porcelain']).trim()) throw new Error('Standards checkout must be clean. Commit changes or select a clean reviewed version.');
  try { git(source, ['cat-file', '-e', `${lock.commit}^{commit}`]); }
  catch { throw new Error(`Installed standards commit ${lock.commit} is unavailable. Fetch its history in the standards clone; no project files were changed.`); }
  const previous = snapshot(source, lock.commit);
  if (previous.version !== lock.version) throw new Error('Lock version does not match its standards commit. Review the installation provenance.');
  const incoming = snapshot(source, to);
  const names = new Set([...previous.files.keys(), ...incoming.files.keys(), 'AGENTS.md']);
  const overrides = new Set(keepLocal);
  for (const name of overrides) {
    validateRelativePath(name);
    if (!names.has(name)) throw new Error(`--keep-local is not a managed path: ${name}`);
  }
  const actions = [];
  const conflicts = [];
  const writes = [];
  const keptLocal = [];
  // Validate every destination before applying, including local overrides.
  for (const name of names) safeDestination(root, name);
  for (const name of names) {
    const current = currentText(root, name);
    let merged;
    let guide;
    if (name === 'AGENTS.md') {
      guide = splitGuide(current);
      merged = mergeText(previous.block, guide.block, incoming.block);
      if (!merged.conflict) merged.content = `${guide.prefix}${merged.content}${guide.suffix}`;
    } else {
      merged = mergeText(previous.files.get(name) ?? null, current, incoming.files.get(name) ?? null);
      const reason = merged.conflict ? null : reviewChange(current, merged.content, incoming.reviewKeys.get(name));
      if (reason) merged = { conflict: true, reason };
    }
    if (merged.conflict && overrides.has(name)) {
      actions.push({ path: name, action: 'keep-local' });
      keptLocal.push(name);
      continue;
    }
    if (merged.conflict) {
      conflicts.push({ path: name, reason: merged.reason });
      continue;
    }
    const action = merged.content === current ? 'keep' : merged.content === null ? 'remove' : current === null ? 'add' : 'update';
    actions.push({ path: name, action, merged: merged.merged });
    if (action !== 'keep') writes.push([name, merged.content]);
  }
  const report = { from: lock.commit, to, dryRun, applied: false, actions, conflicts, keptLocal };
  if (conflicts.length) return report;
  const nextLock = to === lock.commit && !keptLocal.length ? lockText : lockDocument(to, incoming.version, keptLocal);
  if (normalize(nextLock) !== normalize(lockText)) {
    writes.push([LOCK_PATH, nextLock]);
    actions.push({ path: LOCK_PATH, action: 'update', merged: false });
  }
  if (dryRun) return report;
  // No conflict markers are written to the project, and the lock advances last.
  for (const [name, content] of writes) {
    const destination = safeDestination(root, name);
    if (content === null) rmSync(destination);
    else {
      mkdirSync(path.dirname(destination), { recursive: true });
      writeFileSync(destination, content);
    }
  }
  report.applied = true;
  return report;
}

export function parseArgs(args) {
  const options = { dryRun: false, keepLocal: [] };
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--dry-run') options.dryRun = true;
    else if (token === '--target' || token === '--keep-local') {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${token}.`);
      if (token === '--target') {
        if (options.target) throw new Error('Specify --target once.');
        options.target = path.resolve(value);
      } else options.keepLocal.push(value);
    } else throw new Error(`Unknown argument: ${token}`);
  }
  if (!options.target) throw new Error('Usage: node scripts/update.mjs --target /path/to/project [--dry-run] [--keep-local relative/path]');
  return options;
}

if (isMain(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = update(options.target, options);
    console.log(`Standards ${result.from} -> ${result.to}`);
    for (const item of result.actions.filter((item) => item.action !== 'keep')) console.log(`${item.action}${item.merged ? ' (three-way merge)' : ''}: ${item.path}`);
    if (result.conflicts.length) {
      for (const item of result.conflicts) console.error(`CONFLICT: ${item.path}: ${item.reason}`);
      console.error('No project files or lock were changed. Review conflicts; --keep-local can retain an explicitly reviewed local version.');
      process.exitCode = 1;
    } else console.log(result.dryRun ? 'Preview only; no files changed.' : 'Update complete. Review the target diff and run its checks before committing.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
