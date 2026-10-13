import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { refreshUiProof } from './refresh-ui-proof.mjs';

// Only JSON configuration crosses the repository boundary. Executable code is
// supplied by the caller's immutable action SHA, never by a PR or artifact.
export async function publishConfiguredProof({ github, context, core, root, publish = refreshUiProof }) {
  const { data: repository } = await github.rest.repos.get(context.repo);
  const { data: commit } = await github.rest.repos.getCommit({ ...context.repo, ref: repository.default_branch });
  const { data: file } = await github.rest.repos.getContent({ ...context.repo, path: 'development-standards.json', ref: commit.sha });
  if (file.type !== 'file' || file.encoding !== 'base64') throw new Error('Expected default-branch standards JSON configuration.');
  const config = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
  if (config.uiProof?.baseBranch !== repository.default_branch) throw new Error('Proof baseBranch must match the repository default branch.');
  writeFileSync(path.join(root, 'development-standards.json'), JSON.stringify(config));
  await publish({ github, context, core, root });
}
