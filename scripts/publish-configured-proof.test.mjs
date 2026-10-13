import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { publishConfiguredProof } from './publish-configured-proof.mjs';

test('publisher reads only config from an immutable default-branch commit', async t => {
  const root = mkdtempSync(path.join(tmpdir(), 'publisher-config-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = { uiPaths: ['ui/'], uiProof: { baseBranch: 'trunk' } };
  const requests = [];
  const github = { rest: { repos: {
    get: async args => { requests.push(args); return { data: { default_branch: 'trunk' } }; },
    getCommit: async args => { requests.push(args); return { data: { sha: 'a'.repeat(40) } }; },
    getContent: async args => { requests.push(args); return { data: { type: 'file', encoding: 'base64', content: Buffer.from(JSON.stringify(config)).toString('base64') } }; },
  } } };
  let published = false;
  await publishConfiguredProof({ github, context: { repo: { owner: 'owner', repo: 'app' }, payload: { pull_request: { head: { sha: 'untrusted' } } } }, core: {}, root,
    publish: async () => { published = true; assert.deepEqual(JSON.parse(readFileSync(path.join(root, 'development-standards.json'))), config); } });
  assert.equal(published, true);
  assert.equal(requests[1].ref, 'trunk');
  assert.equal(requests[2].ref, 'a'.repeat(40));
  assert.equal(requests[2].path, 'development-standards.json');
  config.uiProof.baseBranch = 'other';
  await assert.rejects(publishConfiguredProof({ github, context: { repo: {} }, root }), /default branch/);
});
