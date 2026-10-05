import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { install } from './install.mjs';
import { checkMap } from './check-feature-map.mjs';
import { evaluate } from './check-pr-verification.mjs';
import { getChangedLines } from './Test-TypeScriptCoverageGate.mjs';
function temporary(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'standards-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test('installer dry-run leaves project unchanged; install preserves guide and license; repeat is idempotent', (t) => {
  const root = temporary(t);
  writeFileSync(path.join(root, 'AGENTS.md'), '# Local architecture\n');
  writeFileSync(path.join(root, 'LICENSE'), 'Project license\n');
  assert.ok(install(root, { dryRun: true }).length > 10);
  assert.equal(existsSync(path.join(root, 'scripts')), false);
  install(root);
  assert.match(readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), /^# Local architecture/);
  assert.equal(readFileSync(path.join(root, 'LICENSE'), 'utf8'), 'Project license\n');
  assert.ok(JSON.parse(readFileSync(path.join(root, 'development-standards.lock.json'), 'utf8')).commit);
  assert.deepEqual(install(root), []);
});
test('installer detects a conflict before writing any file', (t) => {
  const root = temporary(t);
  writeFileSync(path.join(root, 'development-standards.json'), '{"custom":true}');
  assert.throws(() => install(root), /Refusing to overwrite/);
  assert.equal(existsSync(path.join(root, 'docs')), false);
  assert.equal(existsSync(path.join(root, 'AGENTS.md')), false);
});
test('installer rejects symlinks to paths outside the project', (t) => {
  const root = temporary(t);
  const outside = temporary(t);
  symlinkSync(outside, path.join(root, 'docs'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => install(root), /Symlink destination/);
  assert.equal(existsSync(path.join(outside, 'development-standards-LICENSE')), false);
});
test('feature map fails for missing coverage, stale paths, and duplicate IDs', (t) => {
  const root = temporary(t);
  mkdirSync(path.join(root, 'config'));
  mkdirSync(path.join(root, 'ui'));
  writeFileSync(path.join(root, 'ui/Home.tsx'), 'export default function Home() {}');
  writeFileSync(path.join(root, 'development-standards.json'), JSON.stringify({ uiPaths: ['ui/'] }));
  const save = (features) => writeFileSync(path.join(root, 'config/feature-map.json'), JSON.stringify({ features }));
  save([]);
  assert.throws(() => checkMap(root), /Unmapped UI/);
  const feature = { id: 'home', sources: ['ui/Home.tsx'], command: 'capture home', platform: 'browser' };
  save([feature]);
  assert.equal(checkMap(root), 1);
  save([feature, feature]);
  assert.throws(() => checkMap(root), /unique id/);
  save([{ ...feature, sources: ['ui/Missing.tsx'] }]);
  assert.throws(() => checkMap(root), /Missing feature/);
});
const input = { config: { uiPaths: ['ui/'] }, features: [{ id: 'home', sources: ['ui/Home.tsx'] }], files: ['ui/Home.tsx'] };
test('UI PR proof requires affected IDs and evidence fields; skipped checks must be explicit', () => {
  const body = '## Verification\nhome\nCommand: capture home\nPlatform: browser\nResult: passed\nProof: artifacts/proof/home.png\n';
  assert.equal(evaluate({ ...input, body }).ok, true);
  assert.equal(evaluate({ ...input, body: body.replaceAll('home', 'home-other') }).ok, false);
  assert.equal(evaluate({ ...input, body: body.replace('Platform: browser', '') }).ok, false);
  assert.equal(evaluate({ ...input, body: body.replace('Command: capture home', 'Command:') }).ok, false);
  assert.equal(evaluate({ ...input, body: '## Verification\nhome\nNot verified: emulator unavailable\n' }).ok, true);
  assert.equal(evaluate({ ...input, labels: ['no-ui-verification'] }).ok, false);
  assert.equal(evaluate({ ...input, labels: ['no-ui-verification'], body: 'Verification-skip-reason: token-only change' }).ok, true);
  assert.equal(evaluate({ ...input, files: ['docs/guide.md'] }).ok, true);
});
test('TypeScript gate fails closed for a missing base and nonexistent SHA', (t) => {
  const root = temporary(t);
  assert.throws(() => getChangedLines({ repoRoot: root, baseRef: '', headRef: 'HEAD', paths: ['app/src'] }), /requires a base/);
  const init = spawnSync('git', ['init', '--quiet'], { cwd: root });
  assert.equal(init.status, 0);
  assert.throws(() => getChangedLines({ repoRoot: root, baseRef: '0123456789abcdef0123456789abcdef01234567', headRef: 'HEAD', paths: ['app/src'] }), /not available/);
});
test('TypeScript source root can be configured for nested and root projects', () => {
  for (const [project, expected] of [['clients/mobile', 'clients/mobile/src/api.ts'], ['.', 'src/api.ts']]) {
    const code = 'import { toRepoPath, isCoverableRepoPath } from "./scripts/Test-TypeScriptCoverageGate.mjs"; const p=toRepoPath("src/api.ts"); if(p!==process.env.EXPECTED || !isCoverableRepoPath(p)) process.exit(1);';
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, STANDARDS_TS_PROJECT: project, EXPECTED: expected }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
});

test('configured TypeScript projects merge reports, reject uncovered changes, and include unexecuted files', (t) => {
  const gate = path.resolve('scripts/Test-TypeScriptCoverageGate.mjs');
  for (const project of ['clients/mobile', '.']) {
    const root = temporary(t);
    const projectDir = path.join(root, project);
    const source = path.join(projectDir, 'src/api.ts');
    mkdirSync(path.dirname(source), { recursive: true });
    const git = (...args) => {
      const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout.trim();
    };
    git('init', '--quiet');
    writeFileSync(source, 'export const a = 1;\n');
    git('add', '.');
    git('-c', 'user.name=Standards Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'base');
    const base = git('rev-parse', 'HEAD');
    writeFileSync(source, 'export const a = 1;\nexport const b = 2;\n');
    git('add', '.');
    git('-c', 'user.name=Standards Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'head');
    const reports = path.join(root, 'reports');
    mkdirSync(path.join(reports, 'jest'), { recursive: true });
    mkdirSync(path.join(reports, 'node'));
    const loc = (line) => ({ start: { line, column: 0 }, end: { line, column: 19 } });
    writeFileSync(path.join(reports, 'jest/coverage-final.json'), JSON.stringify({ [source]: { path: source, statementMap: { 0: loc(1), 1: loc(2) }, s: { 0: 1, 1: 0 }, fnMap: {}, f: {}, branchMap: {}, b: {} } }));
    const nodeReport = path.join(reports, 'node/lcov.info');
    writeFileSync(nodeReport, 'TN:\nSF:src/api.ts\nDA:1,1\nDA:2,0\nend_of_record\n');
    const floors = path.join(root, 'floors.json');
    writeFileSync(floors, JSON.stringify({ globalLine: 0, globalBranch: 0, changedLine: 70 }));
    const check = () => spawnSync(process.execPath, [gate, '--repo-root', root, '--reports', reports, '--floors', floors, '--merged', path.join(root, 'merged'), '--base-ref', base], { cwd: root, env: { ...process.env, STANDARDS_TS_PROJECT: project }, encoding: 'utf8' });
    const failed = check();
    assert.notEqual(failed.status, 0);
    assert.match(failed.stdout + failed.stderr, /Changed-line coverage/);
    writeFileSync(nodeReport, 'TN:\nSF:src/api.ts\nDA:1,1\nDA:2,1\nend_of_record\n');
    const passed = check();
    assert.equal(passed.status, 0, passed.stdout + passed.stderr);
    writeFileSync(path.join(projectDir, 'src/untested.ts'), 'export const untested = 1;\n');
    const missing = check();
    assert.notEqual(missing.status, 0);
    assert.match(missing.stdout + missing.stderr, /missing 1 production file/);
  }
});
