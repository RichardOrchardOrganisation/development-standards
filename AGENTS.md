# Agent guide

This repository maintains portable development standards. Keep rules independent of any one application or coding assistant. README.md is the user-facing setup guide; docs/ explains policy; executable checks enforce policy.

Work on `{agent}/{task}` branches. Run `npm test`, `npm run check`, `npm run test:typescript`, and `npm run test:dotnet` before a pull request. Test changes to gates with both passing and failing fixtures. Never loosen a threshold or baseline to make a test pass. Keep generated output out of Git.

When finished, commit, push, and open a PR against main using the PR template and a real issue link. Do not merge without user authorization. Explain skipped checks. Keep source attribution and MIT copyright when adapting scripts.

The installed policy lives in templates/AGENTS.fragment.md; do not confuse application verification with this kit’s own checks. Template changes must preserve existing target instructions, and installation must not overwrite unrelated files.

installation-manifest.json defines installed source/destination paths. Add or remove entries with installer payload changes. The updater must compare committed baseline/local/incoming content, preserve project-only guide text, reject unsafe paths, leave the target and lock untouched on unresolved conflicts, and never change a manifest `reviewKeys` value (such as a coverage floor) without a conflict. Cover these behaviors with regression tests.
