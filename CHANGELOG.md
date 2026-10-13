# Changelog

Each release is a Git tag (`vX.Y.Z`) on `main`. Consuming projects pin the tagged commit with `scripts/update.mjs`; see [docs/updating.md](docs/updating.md). The version in `package.json` is recorded in each project's `development-standards.lock.json`.

## 0.5.2

- Preserve the GitHub Context repository getter when checking PR and merge-queue evidence.
- Use an explicit text comparator for feature identifiers.

## 0.5.1

- Provide a pinned reusable `actions/publish-ui-proof` action. Privileged workflows read only default-branch JSON configuration and never check out application code.
- The publisher example now requires an explicit reviewed action SHA. Local managed proof modules remain available for the read-only CI gate.

## 0.5.0

UI evidence enforcement and publication are shared, configurable tools.

- Validate uploaded PNG and TRX/JUnit evidence, current heads, producer jobs/attempts and artifact expiry.
- Enforce explicit waivers; local paths, arbitrary links and Not verified no longer pass. Dependabot has no evidence exemption.
- Publish PR artifact links from trusted default-branch code and refresh only the configured required gate.
- Handle squash merge queues and preserve project-specific feature maps through a small adapter.
- Install the policy, archive tooling and workflow examples as managed files. Producers, platforms, job names and base branches are project configuration.

Upgrading: configure `uiProof`, capture/upload evidence, and wire the required check as described in docs/verification.md. Active workflows are never changed by the updater. The optional label-mutation API has been removed; the gate is read-only.

## 0.4.0

The TypeScript coverage gate works in any project layout without per-call configuration.

- `scripts/Test-TypeScriptCoverageGate.mjs` reads its project root from `typescript.projectRoot` in `development-standards.json` (`STANDARDS_TS_PROJECT` still overrides), and finds the repository from its installed location, so it runs from any directory (#13).
- The gate's self-test follows the configured project, and `src/test/` fixtures are excluded for a project at the repository root (#14).
- `git` runs from an absolute path: `GIT_EXECUTABLE`, else a standard install location (#15).
- SonarCloud style cleanup in the gate, with no behaviour change (#16).

Upgrading: no configuration change is needed. Set `GIT_EXECUTABLE` if git is not in a standard location.

## 0.3.0

Coverage floors are protected, and QueenZone.Modern's newer checks are ported into the kit.

- Manifest `reviewKeys`: an update that would change a project's coverage floor is a conflict, even when the text merges cleanly (#7, fixes #5).
- Coverage gate: diff-parsing refactor, `Write-Information`, macOS path fixes, and `-ConfigPath` for configured floors (#8).
- CRAP report: optional baseline ratchet with `-Baseline`, `-Enforce`, `-WriteBaseline`, and `-FromCsv` (#9).
- Suppression checker: optional `suppressions.skippedPaths` and `suppressions.minIssueDigits` settings (#10).
- TypeScript gate: CRAP-driven refactors, and floors resolved from `typescript.floors` (#11).
- PR verification: `checkPullRequestVerification({ github, context, core })` GitHub Actions entry point, Dependabot exemption, and optional `needs-verification` label (#12, completes #6).

## 0.2.0

- Three-way update command with conflict refusal and `--keep-local` (#4).

## 0.1.0

- Initial portable kit extracted from QueenZone.Modern: policies, coverage and CRAP checks, suppression ratchet, feature-map and PR-verification checks, installer, and CI examples (#2).
