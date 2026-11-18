import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parse, run, match } from './review-checklist.mjs';

const script = fileURLToPath(new URL('./review-checklist.mjs', import.meta.url));
const rulesPath = 'config/review-checklist.json';
function fixture(name) { return readFileSync(new URL(`./fixtures/review-checklist/${name}.json`, import.meta.url), 'utf8'); }
function write(root, name, text) {
  const destination = path.join(root, name);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, text);
}
function git(root, ...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function commit(root) {
  git(root, 'add', '-A');
  git(root, '-c', 'user.name=Standards Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'test');
  return git(root, 'rev-parse', 'HEAD');
}
function repository(t, rules = fixture('active'), destination = rulesPath, changes = { 'src/Foo.cs': 'changed\n' }) {
  const root = mkdtempSync(path.join(tmpdir(), 'review-checklist-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '--quiet');
  write(root, 'base.txt', 'base\n');
  if (rules !== null) write(root, destination, rules);
  const base = commit(root);
  for (const [name, text] of Object.entries(changes)) write(root, name, text);
  commit(root);
  return { root, base };
}
function cli(root, ...args) { return spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' }); }

test('CLI uses base rules despite committed and uncommitted head rule edits', (t) => {
  const { root, base } = repository(t, fixture('active'), rulesPath, { 'src/Foo.cs': 'changed', [rulesPath]: fixture('empty') });
  write(root, rulesPath, 'invalid on disk');
  const output = cli(root, '--base', base, '--format', 'json');
  assert.equal(output.status, 0, output.stderr);
  const expected = JSON.parse(fixture('active')).items[0];
  assert.deepEqual(JSON.parse(output.stdout), { items: [{ ...expected, files: ['src/Foo.cs'] }], stale: [] });
  const md = cli(root, '--base', base);
  assert.equal(md.status, 0, md.stderr);
  assert.match(md.stdout, /- \[ \] data.collation-lookup: Lookups must not depend on collation/);
  assert.match(md.stdout, /src\/Foo.cs/);
});

test('missing base rules, empty rules, and unmatched files produce empty results', (t) => {
  const cases = [
    [null, { [rulesPath]: fixture('active'), 'src/Foo.cs': 'changed' }],
    [fixture('empty'), { 'src/Foo.cs': 'changed' }],
    [fixture('active'), { 'docs/note.md': 'changed' }],
  ];
  for (const [rules, changes] of cases) {
    const { root, base } = repository(t, rules, rulesPath, changes);
    assert.deepEqual(run({ base }, root), { items: [], stale: [] });
    for (const format of ['md', 'json']) {
      const output = cli(root, '--base', base, '--format', format);
      assert.equal(output.status, 0, output.stderr);
      if (format === 'json') assert.deepEqual(JSON.parse(output.stdout), { items: [], stale: [] });
      else assert.equal(output.stdout, '');
    }
  }
});

test('moving a file out of a guarded path still fires the checklist item', (t) => {
  const { root } = repository(t);
  const base = git(root, 'rev-parse', 'HEAD');
  git(root, 'mv', 'src/Foo.cs', 'Foo.cs');
  commit(root);
  const output = cli(root, '--base', base, '--format', 'json');
  assert.equal(output.status, 0, output.stderr);
  const expected = JSON.parse(fixture('active')).items[0];
  assert.deepEqual(JSON.parse(output.stdout), { items: [{ ...expected, files: ['src/Foo.cs'] }], stale: [] });
});

test('normalized Windows and Git paths match on every OS', () => {
  assert.equal(match('src\\Foo.cs', 'src/**/*.cs'), true);
  assert.equal(match('src/nested/Foo.cs', 'src/**/*.cs'), true);
  assert.equal(match('src\\Foo.ts', 'src/**/*.cs'), false);
});

test('matched expired items are stale; unmatched expired items stay silent', (t) => {
  const rules = { version: 1, items: [...JSON.parse(fixture('stale')).items, ...JSON.parse(fixture('active')).items] };
  const { root, base } = repository(t, JSON.stringify(rules));
  const output = cli(root, '--base', base, '--format', 'json');
  assert.equal(output.status, 0, output.stderr);
  const result = JSON.parse(output.stdout);
  assert.deepEqual(result.items.map((item) => item.id), ['data.collation-lookup']);
  assert.deepEqual(result.stale.map((item) => item.id), ['stale.match']);
  assert.deepEqual(result.stale[0].files, ['src/Foo.cs']);
  const md = cli(root, '--base', base, '--format', 'md');
  assert.equal(md.status, 0, md.stderr);
  assert.match(md.stdout, /## Stale review items/);
  assert.doesNotMatch(md.stdout, /- \[ \] stale/);
  assert.equal(run({ base }, root, '2020-01-01').items.length, 2);
  assert.equal(run({ base }, root, '2020-01-02').stale.length, 1);
});

test('custom rules path and stable item/file order', (t) => {
  const item = JSON.parse(fixture('active')).items[0];
  const rules = JSON.stringify({ version: 1, items: [{ ...item, id: 'z' }, { ...item, id: 'a', automatedCheck: 'lint' }] });
  const { root, base } = repository(t, rules, 'policy/rules.json', { 'src/Z.cs': 'z', 'src/A.cs': 'a' });
  const output = cli(root, '--base', base, '--rules', 'policy/rules.json', '--format', 'json');
  assert.equal(output.status, 0, output.stderr);
  const result = JSON.parse(output.stdout);
  assert.deepEqual(result.items.map((entry) => entry.id), ['a', 'z']);
  assert.deepEqual(result.items[0].files, ['src/A.cs', 'src/Z.cs']);
  assert.equal(result.items[0].automatedCheck, 'lint');
});

test('CLI rejects missing values, unknown flags, formats and unsafe rules paths', (t) => {
  const { root } = repository(t);
  const args = [[], ['--base'], ['--base', 'HEAD', '--unknown'], ['--base', 'HEAD', '--format'], ['--base', 'HEAD', '--format', 'xml'], ['--base', 'HEAD', '--rules']];
  for (const name of ['/absolute.json', 'C:\\rules.json', '../rules.json', 'config/../rules.json', 'config\\..\\rules.json']) args.push(['--base', 'HEAD', '--rules', name]);
  for (const input of args) {
    const output = cli(root, ...input);
    assert.equal(output.status, 1, input.join(' '));
    assert.ok(output.stderr.trim());
    assert.equal(output.stdout, '');
  }
  assert.deepEqual(parse(['--base', 'main']), { base: 'main', rules: rulesPath, format: 'md' });
});

test('invalid JSON, schema, items, optional fields and dates fail', (t) => {
  const item = JSON.parse(fixture('active')).items[0];
  const invalid = ['{', 'null', '[]', '{}', '{"version":2,"items":[]}', '{"version":"1","items":[]}', '{"version":1,"items":{}}'];
  for (const patch of [{ id: '' }, { check: 1 }, { paths: [] }, { paths: [''] }, { paths: 'src/**' }, { source: null }, { source: { type: 'other', ref: '#123' } }, { source: { type: 'incident', ref: '' } }, { automatedCheck: 1 }, { owner: null }, ...['2027-02-29', '2020-13-01', '2020-04-31', '2020-1-01', 'today', null, 2020].map((expires) => ({ expires }))]) {
    invalid.push(JSON.stringify({ version: 1, items: [{ ...item, ...patch }] }));
  }
  for (const key of ['id', 'paths', 'check', 'source']) {
    const incomplete = { ...item };
    delete incomplete[key];
    invalid.push(JSON.stringify({ version: 1, items: [incomplete] }));
  }
  for (const rules of invalid) {
    const { root, base } = repository(t, rules);
    const output = cli(root, '--base', base);
    assert.equal(output.status, 1, rules);
    assert.ok(output.stderr.trim());
    assert.equal(output.stdout, '');
  }
});

test('invalid base and unexpected Git failures fail instead of reporting missing rules', (t) => {
  const { root } = repository(t, null);
  assert.equal(cli(root, '--base', 'nonexistent-ref').status, 1);
  rmSync(path.join(root, '.git'), { recursive: true, force: true });
  assert.equal(cli(root, '--base', 'HEAD').status, 1);
});
