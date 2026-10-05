# Development Standards

Richard Orchard’s reusable development rules and quality checks, extracted from QueenZone.Modern.

Use this kit to carry the same testing, coverage, complexity, verification, and pull-request discipline into another project. It supports .NET/Coverlet and TypeScript/Jest + Node coverage. Agent instructions explain the standards; CI and repository protection enforce them.

## Adopt in a project

Requires Node 24; .NET checks also require PowerShell 7, Git, and the target project’s .NET SDK.

```sh
git clone https://github.com/RichardOrchardOrganisation/development-standards.git
cd development-standards
git checkout <reviewed-commit-or-tag>
node scripts/install.mjs --target /absolute/path/to/project --dry-run
node scripts/install.mjs --target /absolute/path/to/project
```

The installer copies the portable files, records the source commit, and appends a marked section to the target’s AGENTS.md. It refuses to overwrite conflicting files and refuses paths that escape the target through symlinks. Run from a reviewed, clean checkout. Review the installed diff and commit it on the target project’s feature branch.

Edit `development-standards.json`: set your solution, TypeScript project directory, coverage floors, and UI paths. Configure TypeScript numeric floors in `config/typescript-coverage.json`; C# numeric floors live only in `development-standards.json`. Remove unused profiles. Empty `uiPaths` is an explicit declaration that the project has no UI verification surface.

For TypeScript the configured project directory contains `src/`. A project at the repository root is supported with `projectRoot: "."`. The gate expects `coverage/jest/coverage-final.json` (or `cobertura-coverage.xml`) and `coverage/node/lcov.info`. Configure Jest `collectCoverageFrom` to include every production `src/**/*.ts` and `src/**/*.tsx`; running only tests with touched imports is insufficient. Separate consumer contracts and device smoke from these coverage totals.

Run checks from the consuming repository root:

```sh
node scripts/verify.mjs --profile dotnet --base-ref origin/main
node scripts/verify.mjs --profile typescript --base-ref origin/main
node scripts/check-suppressions.mjs
node scripts/check-feature-map.mjs
```

The verification runner performs .NET restore/build/format/test with coverage, the coverage gate, and the CRAP report; TypeScript runs the project’s `typecheck`, `lint`, and `test:coverage` scripts followed by the merged gate. It stops on the first failure. Fetch the comparison base before running. Use the PR event base SHA in PR CI; use the queue base SHA in merge-group CI. Missing base objects fail closed.

For a project with one TypeScript runner, collect a second suite only if it exists; this initial adapter intentionally requires both Jest and Node. Other languages and coverage formats need their own adapter. CRAP requires method complexity in Coverlet Cobertura; LCOV alone cannot provide CRAP.

## What travels

- [Test-writing policy](docs/testing.md): behavior, boundaries, failures, regression cases, contracts, and test-layer selection.
- [Coverage and CRAP](docs/coverage.md): merged hits, complete source universe, reviewable floors, and complexity hotspots.
- [Verification policy](docs/verification.md): feature maps, actual browser/device proof, and accurate skipped-check reporting.
- [Suppression policy](docs/suppressions.md): linked exceptions, a shrinking baseline, and repeated findings becoming checks.
- [Adoption and updates](docs/adoption.md): CI wiring, repository protections, upgrades, and project exceptions.
- `templates/AGENTS.fragment.md`: portable instructions suitable for different coding assistants.
- `templates/pull_request_template.md`: agent, issue, tests, probes, and UI proof.
- `examples/consumer-quality.yml`: .NET consumer CI example; adapt project-specific browser/device jobs.

## Validate this kit

```sh
npm test
npm run check
npm run test:typescript
npm run test:dotnet
```

The kit CI runs these checks on Linux, macOS, and Windows. No production service, database, emulator, or secret is required. Generated reports are not committed.

## Defaults and provenance

The starter .NET profile uses 91% global and 70% changed-line coverage, matching QueenZone’s executable CI gate at extraction. TypeScript starter floors (90% lines, 70% branches, 70% changed lines) are suggested new-project values, not QueenZone’s mobile baseline. Measure an existing project before choosing its global floors, approve them explicitly, and ratchet upward as coverage improves. CRAP above 30 is reported as a hotspot, not a merge blocker.

Source: [QueenZone.Modern](https://github.com/RichardOrchardOrganisation/QueenZone.Modern), extracted 2026-10-05. See [provenance](docs/provenance.md). The MIT source license is retained. QueenZone’s deployment environments, database names, issue numbers, architectural choices, runner names, and application fixtures are not requirements of this kit.
