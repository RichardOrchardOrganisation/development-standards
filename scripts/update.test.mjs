import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { install } from './install.mjs';
import { update, parseArgs } from './update.mjs';
import { KIT_ROOT, LOCK_PATH, installationFiles } from './installation.mjs';

function temporary(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'standards-update-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function write(root, name, content) {
  const filename = path.join(root, name);
  mkdirSync(path.dirname(filename), { recursive: true });
  writeFileSync(filename, content);
}
function read(root, name) { return readFileSync(path.join(root, name), 'utf8'); }
function git(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function commit(root, message) {
  git(root, 'add', '-A');
  git(root, '-c', 'user.name=Standards Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}
function tree(root) {
  const result = {};
  function walk(dir) {
    for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const name = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(name);
      else if (entry.isFile()) result[name] = read(root, name);
    }
  }
  walk('');
  return result;
}
function fixture(t, { reviewKeys } = {}) {
  const source = temporary(t);
  const target = temporary(t);
  git(source, 'init', '--quiet');
  const manifest = { version: 1, files: [
    { source: 'rules.md', target: 'docs/rules.md' },
    { source: 'settings.json', target: 'config/settings.json', ...(reviewKeys ? { reviewKeys } : {}) },
  ] };
  write(source, 'installation-manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
  write(source, 'package.json', '{"version":"1.0.0"}\n');
  write(source, 'rules.md', 'first rule\n\nsecond rule\n\nthird rule\n');
  write(source, 'settings.json', '{\n  "floor": 70,\n  "path": "app",\n  "mode": "old"\n}\n');
  write(source, 'templates/AGENTS.fragment.md', 'shared first\n\nshared second\n\nshared third\n');
  const base = commit(source, 'base');
  write(target, 'AGENTS.md', 'Project architecture\n');
  install(target, { source });
  return { source, target, base, manifest };
}

test('update merges independent edits, preserves settings and guide context, and previews without writes', (t) => {
  const { source, target, base } = fixture(t);
  write(target, 'docs/rules.md', read(target, 'docs/rules.md').replace('first rule', 'local first rule'));
  write(target, 'config/settings.json', read(target, 'config/settings.json').replace('"floor": 70', '"floor": 91'));
  write(target, 'AGENTS.md', read(target, 'AGENTS.md').replace('shared first', 'local shared first') + '\nProject-only appendix\n');
  write(target, 'custom.txt', 'untouched\n');
  write(source, 'rules.md', read(source, 'rules.md').replace('third rule', 'incoming third rule'));
  write(source, 'settings.json', read(source, 'settings.json').replace('"mode": "old"', '"mode": "new"'));
  write(source, 'templates/AGENTS.fragment.md', read(source, 'templates/AGENTS.fragment.md').replace('shared third', 'incoming shared third'));
  const incoming = commit(source, 'new rules');
  const before = tree(target);
  const preview = update(target, { source, dryRun: true });
  assert.deepEqual(preview.conflicts, []);
  assert.equal(preview.from, base);
  assert.equal(preview.to, incoming);
  assert.equal(preview.applied, false);
  assert.deepEqual(tree(target), before);
  assert.ok(preview.actions.some((action) => action.path === 'docs/rules.md' && action.merged));
  const applied = update(target, { source });
  assert.equal(applied.applied, true);
  assert.match(read(target, 'docs/rules.md'), /local first rule[\s\S]*incoming third rule/);
  assert.deepEqual(JSON.parse(read(target, 'config/settings.json')), { floor: 91, path: 'app', mode: 'new' });
  const guide = read(target, 'AGENTS.md');
  assert.match(guide, /^Project architecture/);
  assert.match(guide, /local shared first[\s\S]*incoming shared third/);
  assert.match(guide, /Project-only appendix\n$/);
  assert.equal(read(target, 'custom.txt'), 'untouched\n');
  assert.equal(JSON.parse(read(target, LOCK_PATH)).commit, incoming);
  const again = update(target, { source });
  assert.ok(again.actions.every((action) => action.action === 'keep'));
});

test('an overlap blocks every write including clean updates and lock advancement', (t) => {
  const { source, target } = fixture(t);
  write(target, 'docs/rules.md', read(target, 'docs/rules.md').replace('first rule', 'local rule'));
  write(source, 'rules.md', read(source, 'rules.md').replace('first rule', 'upstream rule'));
  write(source, 'settings.json', read(source, 'settings.json').replace('old', 'new'));
  commit(source, 'conflicting rule and clean settings');
  const before = tree(target);
  const result = update(target, { source });
  assert.equal(result.applied, false);
  assert.deepEqual(result.conflicts.map((item) => item.path), ['docs/rules.md']);
  assert.deepEqual(tree(target), before);
  assert.ok(!read(target, 'docs/rules.md').includes('<<<<<<<'));
});

test('reviewed keep-local resolves a conflict and is recorded without rewriting the local file', (t) => {
  const { source, target } = fixture(t);
  write(target, 'config/settings.json', read(target, 'config/settings.json').replace('70', '91'));
  write(source, 'settings.json', read(source, 'settings.json').replace('70', '80'));
  const incoming = commit(source, 'new default floor');
  assert.equal(update(target, { source }).conflicts.length, 1);
  const result = update(target, { source, keepLocal: ['config/settings.json'] });
  assert.equal(result.applied, true);
  assert.equal(JSON.parse(read(target, 'config/settings.json')).floor, 91);
  const lock = JSON.parse(read(target, LOCK_PATH));
  assert.equal(lock.commit, incoming);
  assert.deepEqual(lock.keptLocal, ['config/settings.json']);
  const before = tree(target);
  update(target, { source });
  assert.deepEqual(tree(target), before);
  assert.throws(() => update(target, { source, keepLocal: ['unmanaged.txt'] }), /not a managed path/);
});

test('managed files can be added or removed; modified deletions and new-file collisions conflict', (t) => {
  const { source, target, manifest } = fixture(t);
  manifest.files = manifest.files.filter((item) => item.target !== 'docs/rules.md');
  manifest.files.push({ source: 'new.md', target: 'docs/new.md' });
  write(source, 'new.md', 'new standard\n');
  write(source, 'installation-manifest.json', JSON.stringify(manifest));
  commit(source, 'add and remove');
  write(target, 'docs/new.md', 'project-owned file\n');
  write(target, 'docs/rules.md', 'project-modified rules\n');
  const before = tree(target);
  const blocked = update(target, { source });
  assert.deepEqual(new Set(blocked.conflicts.map((item) => item.path)), new Set(['docs/rules.md', 'docs/new.md']));
  assert.deepEqual(tree(target), before);
  rmSync(path.join(target, 'docs/new.md'));
  write(target, 'docs/rules.md', 'first rule\n\nsecond rule\n\nthird rule\n');
  const result = update(target, { source });
  assert.equal(result.applied, true);
  assert.equal(existsSync(path.join(target, 'docs/rules.md')), false);
  assert.equal(read(target, 'docs/new.md'), 'new standard\n');
});

test('local deletions remain deleted unless upstream also changes the file', (t) => {
  const { source, target } = fixture(t);
  rmSync(path.join(target, 'docs/rules.md'));
  write(source, 'settings.json', read(source, 'settings.json').replace('old', 'new'));
  commit(source, 'settings only');
  assert.equal(update(target, { source }).applied, true);
  assert.equal(existsSync(path.join(target, 'docs/rules.md')), false);
  write(source, 'rules.md', 'changed upstream\n');
  commit(source, 'changed deleted rule');
  assert.equal(update(target, { source }).conflicts[0].path, 'docs/rules.md');
});

test('CRLF local edits and project-only guide text retain their line endings', (t) => {
  const { source, target } = fixture(t);
  for (const name of ['docs/rules.md', 'AGENTS.md']) write(target, name, read(target, name).replaceAll('\n', '\r\n'));
  write(source, 'rules.md', read(source, 'rules.md').replace('third rule', 'updated third'));
  write(source, 'templates/AGENTS.fragment.md', read(source, 'templates/AGENTS.fragment.md').replace('shared third', 'updated third'));
  commit(source, 'CRLF-safe update');
  assert.equal(update(target, { source }).applied, true);
  for (const name of ['docs/rules.md', 'AGENTS.md']) assert.ok(!/(?<!\r)\n/.test(read(target, name)));
});

test('missing/corrupt provenance and dirty source fail without changing the project', (t) => {
  const { source, target } = fixture(t);
  const lockText = read(target, LOCK_PATH);
  const before = tree(target);
  write(source, 'rules.md', 'uncommitted\n');
  assert.throws(() => update(target, { source }), /must be clean/);
  assert.deepEqual(tree(target), before);
  git(source, 'checkout', '--', 'rules.md');
  for (const patch of [{ commit: '0'.repeat(40) }, { repository: 'https://other.invalid/repo' }, { version: 'wrong' }]) {
    write(target, LOCK_PATH, JSON.stringify({ ...JSON.parse(lockText), ...patch }));
    const patched = tree(target);
    assert.throws(() => update(target, { source }), /unavailable|Invalid standards lock|does not match/);
    assert.deepEqual(tree(target), patched);
  }
  rmSync(path.join(target, LOCK_PATH));
  assert.throws(() => update(target, { source }), /Install\/adopt/);
});

test('unsafe paths, symlinks, and malformed guide markers fail before writes', (t) => {
  const { source, target, manifest } = fixture(t);
  manifest.files.push({ source: 'rules.md', target: '../escape.md' });
  write(source, 'installation-manifest.json', JSON.stringify(manifest));
  commit(source, 'unsafe manifest');
  const before = tree(target);
  assert.throws(() => update(target, { source }), /Invalid repository-relative/);
  assert.deepEqual(tree(target), before);
  manifest.files.pop();
  write(source, 'installation-manifest.json', JSON.stringify(manifest));
  commit(source, 'safe manifest');
  write(target, 'AGENTS.md', read(target, 'AGENTS.md') + '\n<!-- development-standards:begin -->\n');
  assert.throws(() => update(target, { source }), /exactly one/);
  write(target, 'AGENTS.md', before['AGENTS.md']);
  rmSync(path.join(target, 'docs'), { recursive: true });
  const outside = temporary(t);
  write(outside, 'rules.md', 'external\n');
  symlinkSync(outside, path.join(target, 'docs'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => update(target, { source }), /Symlink destination/);
  assert.equal(read(outside, 'rules.md'), 'external\n');
});

test('known v0.1 installs update using committed legacy sources without a manifest', (t) => {
  const source = temporary(t);
  const target = temporary(t);
  git(source, 'init', '--quiet');
  const legacy = readFileSync(new URL('./fixtures/legacy-install.txt', import.meta.url), 'utf8');
  write(source, 'scripts/install.mjs', legacy);
  const items = installationFiles((name) => name === 'scripts/install.mjs' ? legacy : null);
  for (const item of items) write(source, item.source, read(KIT_ROOT, item.source));
  write(source, 'templates/AGENTS.fragment.md', read(KIT_ROOT, 'templates/AGENTS.fragment.md'));
  write(source, 'package.json', '{"version":"0.1.0"}\n');
  commit(source, 'legacy install');
  install(target, { source });
  write(source, 'installation-manifest.json', JSON.stringify({ version: 1, files: items }));
  write(source, 'package.json', '{"version":"0.2.0"}\n');
  write(source, 'docs/testing.md', read(source, 'docs/testing.md') + '\nNew portable test rule.\n');
  const next = commit(source, 'versioned update');
  const result = update(target, { source });
  assert.equal(result.applied, true);
  assert.match(read(target, 'docs/testing.md'), /New portable test rule/);
  assert.equal(JSON.parse(read(target, LOCK_PATH)).commit, next);
});

test('CLI accepts repeated reviewed overrides and rejects missing or unknown arguments', () => {
  const parsed = parseArgs(['--target', '.', '--dry-run', '--keep-local', 'docs/rules.md', '--keep-local', 'config/settings.json']);
  assert.equal(parsed.dryRun, true);
  assert.deepEqual(parsed.keepLocal, ['docs/rules.md', 'config/settings.json']);
  for (const args of [[], ['--target'], ['--target', '--dry-run'], ['--target', '.', '--force'], ['--target', '.', '--target', '.']]) assert.throws(() => parseArgs(args));
});

test('CLI conflict exits nonzero and leaves the project untouched', (t) => {
  const { source, target } = fixture(t);
  // Copy the updater modules into the fixture so its CLI uses that committed source.
  for (const name of ['update.mjs', 'installation.mjs']) write(source, `scripts/${name}`, read(KIT_ROOT, `scripts/${name}`));
  write(target, 'docs/rules.md', 'local replacement\n');
  write(source, 'rules.md', 'incoming replacement\n');
  commit(source, 'CLI conflict');
  const before = tree(target);
  const result = spawnSync(process.execPath, [path.join(source, 'scripts/update.mjs'), '--target', target], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /CONFLICT: docs\/rules.md/);
  assert.match(result.stderr, /No project files or lock were changed/);
  assert.deepEqual(tree(target), before);
});

test('agent-section overlap blocks updates until the local section is explicitly retained', (t) => {
  const { source, target } = fixture(t);
  write(target, 'AGENTS.md', read(target, 'AGENTS.md').replace('shared second', 'local shared second'));
  write(source, 'templates/AGENTS.fragment.md', read(source, 'templates/AGENTS.fragment.md').replace('shared second', 'upstream shared second'));
  commit(source, 'overlapping guidance');
  const before = tree(target);
  assert.deepEqual(update(target, { source }).conflicts.map((item) => item.path), ['AGENTS.md']);
  assert.deepEqual(tree(target), before);
  assert.equal(update(target, { source, keepLocal: ['AGENTS.md'] }).applied, true);
  assert.equal(read(target, 'AGENTS.md'), before['AGENTS.md']);
});

test('unknown legacy installer and overlapping manifest targets are refused', (t) => {
  const { source, target, manifest } = fixture(t);
  rmSync(path.join(source, 'installation-manifest.json'));
  write(source, 'scripts/install.mjs', '// Different legacy installation layout\n');
  commit(source, 'unsupported legacy');
  const before = tree(target);
  assert.throws(() => update(target, { source }), /Unknown legacy installer/);
  assert.deepEqual(tree(target), before);
  for (const bad of ['docs/rules.md', 'DOCS/RULES.MD', 'docs/rules.md/nested.txt', '.git/config']) {
    write(source, 'installation-manifest.json', JSON.stringify({ ...manifest, files: [...manifest.files, { source: 'rules.md', target: bad }] }));
    commit(source, `bad target ${bad}`);
    assert.throws(() => update(target, { source }), /Duplicate or overlapping|Invalid repository-relative/);
    assert.deepEqual(tree(target), before);
  }
});

test('a project-owned floor never changes silently, even when the text merges cleanly', (t) => {
  const { source, target } = fixture(t, { reviewKeys: ['floor'] });
  // The project keeps the default floor but edits a non-adjacent line, so Git would merge cleanly.
  write(target, 'config/settings.json', read(target, 'config/settings.json').replace('"mode": "old"', '"mode": "local"'));
  write(source, 'settings.json', read(source, 'settings.json').replace('"floor": 70', '"floor": 80'));
  write(source, 'rules.md', read(source, 'rules.md').replace('third rule', 'incoming third rule'));
  const incoming = commit(source, 'raise default floor');
  const before = tree(target);
  const blocked = update(target, { source });
  assert.equal(blocked.applied, false);
  assert.deepEqual(blocked.conflicts.map((item) => item.path), ['config/settings.json']);
  assert.match(blocked.conflicts[0].reason, /floor 70 -> 80/);
  assert.deepEqual(tree(target), before);

  // Accepting the new floor is a deliberate local edit; the rest of the update then merges.
  write(target, 'config/settings.json', read(target, 'config/settings.json').replace('"floor": 70', '"floor": 80'));
  const accepted = update(target, { source });
  assert.equal(accepted.applied, true);
  assert.deepEqual(JSON.parse(read(target, 'config/settings.json')), { floor: 80, path: 'app', mode: 'local' });
  assert.match(read(target, 'docs/rules.md'), /incoming third rule/);
  assert.equal(JSON.parse(read(target, LOCK_PATH)).commit, incoming);
});

test('a project untouched since install also keeps its floor unless it is reviewed', (t) => {
  const { source, target } = fixture(t, { reviewKeys: ['floor'] });
  write(source, 'settings.json', read(source, 'settings.json').replace('"floor": 70', '"floor": 60'));
  const incoming = commit(source, 'lower default floor');
  assert.match(update(target, { source }).conflicts[0].reason, /floor 70 -> 60/);
  const kept = update(target, { source, keepLocal: ['config/settings.json'] });
  assert.equal(kept.applied, true);
  assert.equal(JSON.parse(read(target, 'config/settings.json')).floor, 70);
  const lock = JSON.parse(read(target, LOCK_PATH));
  assert.equal(lock.commit, incoming);
  assert.deepEqual(lock.keptLocal, ['config/settings.json']);
});

test('other changes to a file with reviewed keys still merge, and invalid merged JSON is refused', (t) => {
  const { source, target } = fixture(t, { reviewKeys: ['floor', 'nested.limit'] });
  write(source, 'settings.json', read(source, 'settings.json').replace('"path": "app"', '"path": "src"'));
  commit(source, 'unrelated setting');
  assert.equal(update(target, { source }).applied, true);
  assert.equal(JSON.parse(read(target, 'config/settings.json')).path, 'src');

  write(target, 'config/settings.json', read(target, 'config/settings.json').replace('"floor": 70,', '"floor": 70'));
  write(source, 'settings.json', read(source, 'settings.json').replace('"mode": "old"', '"mode": "new"'));
  commit(source, 'mode change against locally broken JSON');
  const broken = update(target, { source });
  assert.equal(broken.applied, false);
  assert.match(broken.conflicts[0].reason, /not valid JSON/);
});

test('reviewKeys must be a nonempty list of dot paths, and the kit protects its shipped floors', () => {
  const manifest = (reviewKeys) => () => JSON.stringify({ version: 1, files: [{ source: 'a.json', target: 'a.json', reviewKeys }] });
  for (const bad of [[], 'floor', [''], ['a..b'], [1]]) {
    assert.throws(() => installationFiles(manifest(bad)), /Invalid reviewKeys/, JSON.stringify(bad));
  }
  assert.equal(installationFiles(manifest(['dotnet.globalLine']))[0].reviewKeys[0], 'dotnet.globalLine');
  const shipped = installationFiles((name) => readFileSync(path.join(KIT_ROOT, name), 'utf8'));
  const keys = Object.fromEntries(shipped.filter((item) => item.reviewKeys).map((item) => [item.target, item.reviewKeys]));
  assert.deepEqual(keys, {
    'development-standards.json': ['dotnet.globalLine', 'dotnet.changedLine'],
    'config/typescript-coverage.json': ['globalLine', 'globalBranch', 'changedLine'],
  });
});
