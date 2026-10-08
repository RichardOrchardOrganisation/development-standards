#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadMap, matchingFeatures } from './check-feature-map.mjs';

export function evaluate({ body = '', files = [], labels = [], config, features }) {
  const uiFiles = files.filter((file) => !/\.(test|spec)\.[cm]?[jt]sx?$/.test(file) && config.uiPaths.some((prefix) => prefix.endsWith('/') ? file.startsWith(prefix) : file === prefix));
  if (!uiFiles.length) return { ok: true, ui: false };
  if (labels.includes('no-ui-verification')) return { ok: /^Verification-skip-reason:[ \t]*\S[^\r\n]*/im.test(body), ui: true, reason: 'Opt-out requires Verification-skip-reason.' };
  const heading = /^## Verification[^\n]*\n/m.exec(body);
  const section = heading ? body.slice(heading.index + heading[0].length).split(/\n## /)[0] : '';
  const affected = new Set(uiFiles.flatMap((file) => matchingFeatures(file, features).map((feature) => feature.id)));
  const unmapped = uiFiles.filter((file) => !matchingFeatures(file, features).length);
  const missing = [...affected].filter((id) => !new RegExp(`(^|[^A-Za-z0-9_-])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9_-]|$)`).test(section));
  const proof = /https?:\/\/\S+|artifacts\/proof\/\S+/.test(section);
  const notVerified = /^Not verified:[ \t]*\S[^\r\n]*/im.test(section);
  const fields = ['Command', 'Platform', 'Result'].every((field) => new RegExp(`^${field}:[ \t]*\\S[^\\r\\n]*`, 'im').test(section));
  return { ok: !unmapped.length && !missing.length && (notVerified || (proof && fields)), ui: true, reason: 'UI changes require all affected feature IDs and Command/Platform/Result/proof, or Not verified with a reason.', missing, unmapped };
}
export const NEEDS_VERIFICATION = 'needs-verification';

export function isDependabot(pullRequest) {
  return pullRequest?.user?.login === 'dependabot[bot]';
}

async function setNeedsVerification(github, context, pullRequest, needed) {
  const issue = { ...context.repo, issue_number: pullRequest.number };
  const has = (pullRequest.labels || []).some((label) => label.name === NEEDS_VERIFICATION);
  if (needed && !has) {
    try {
      await github.rest.issues.getLabel({ ...context.repo, name: NEEDS_VERIFICATION });
    } catch (error) {
      if (error.status !== 404) throw error;
      await github.rest.issues.createLabel({ ...context.repo, name: NEEDS_VERIFICATION, color: 'd93f0b', description: 'UI PR is missing required verification proof.' });
    }
    await github.rest.issues.addLabels({ ...issue, labels: [NEEDS_VERIFICATION] });
  }
  if (!needed && has) await github.rest.issues.removeLabel({ ...issue, name: NEEDS_VERIFICATION });
}

/**
 * Entry point for actions/github-script. Dependabot PRs are exempt. With label: true
 * the PR gets or loses the needs-verification label, which needs issues: write and
 * pull-requests: write; the default only reads.
 */
export async function checkPullRequestVerification({ github, context, core, root = process.cwd(), label = false }) {
  const pullRequest = context.payload.pull_request;
  if (!pullRequest) {
    core.info('No pull request payload; skipping verification check.');
    return { ok: true, skipped: true };
  }
  if (isDependabot(pullRequest)) {
    core.info('Dependabot is exempt from UI verification.');
    return { ok: true, ui: false, skipped: true };
  }
  const files = await github.paginate(github.rest.pulls.listFiles, { ...context.repo, pull_number: pullRequest.number, per_page: 100 });
  const result = evaluate({
    body: pullRequest.body || '',
    files: files.map((file) => file.filename),
    labels: (pullRequest.labels || []).map((item) => item.name),
    ...loadMap(root),
  });
  if (label) await setNeedsVerification(github, context, pullRequest, !result.ok);
  if (result.ok) core.info(result.ui ? 'Verification section ok.' : 'No UI files changed.');
  else core.setFailed(result.reason);
  return result;
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
