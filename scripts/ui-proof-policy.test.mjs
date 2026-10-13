import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateProof, visibleMarkdown } from './ui-proof-policy.mjs';
import { loadProofConfig } from './ui-proof-config.mjs';
import { resolveProofPython } from './ui-proof-evidence.mjs';

const sha = 'a'.repeat(40);
const input = { body: '## Verification\nhome', headSha: sha,
  requirements: [{ file: 'ui/home', ids: ['home'] }],
  features: [{ id: 'home', platforms: ['desktop', 'tablet'], fixtures: ['HomeTests'] }] };
const proof = platform => ({ feature: 'home', platform, headSha: sha, fixtures: ['HomeTests'], url: 'https://github.com/o/r/actions/runs/1/artifacts/2' });

test('configured platforms and fixtures are mandatory, independent of app/framework', () => {
  assert.equal(evaluateProof({ ...input, evidence: [proof('desktop')] }).ok, false);
  assert.equal(evaluateProof({ ...input, evidence: [proof('desktop'), proof('tablet')] }).ok, true);
  assert.equal(evaluateProof({ ...input, evidence: [proof('desktop'), { ...proof('tablet'), fixtures: [] }] }).ok, false);
  assert.equal(evaluateProof({ ...input, evidence: [proof('desktop'), { ...proof('tablet'), headSha: 'b'.repeat(40) }] }).ok, false);
});
test('missing platforms, unmapped files and partial feature identifiers fail closed', () => {
  assert.equal(evaluateProof({ ...input, features: [{ id: 'home' }] }).ok, false);
  assert.equal(evaluateProof({ ...input, requirements: [{ file: 'ui/other', ids: [] }] }).ok, false);
  assert.equal(evaluateProof({ ...input, body: '## Verification\nhome-other', evidence: [proof('desktop'), proof('tablet')] }).ok, false);
});
test('hidden and unclosed text cannot waive missing proof', () => {
  for (const body of ['<!-- Verification-skip-reason: hidden -->', '<!--\nVerification-skip-reason: hidden', '```\nVerification-skip-reason: hidden', 'Verification-skip-reason:']) {
    assert.equal(evaluateProof({ ...input, labels: ['no-ui-verification'], body }).ok, false);
  }
  assert.equal(evaluateProof({ ...input, labels: ['no-ui-verification'], body: '- Verification-skip-reason: reviewed limitation' }).ok, true);
  assert.equal(visibleMarkdown('<!<!-- removed -->--'), '<!\n--');
});
test('portable configuration loads producer mappings and executable overrides cannot use PATH', () => {
  assert.equal(loadProofConfig('.').producers['.github/workflows/ci.yml'].browser['browser-tests'], 'Browser tests');
  assert.throws(() => resolveProofPython({ STANDARDS_PYTHON: 'python3' }), /absolute/);
});
