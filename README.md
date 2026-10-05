# Development Standards

Richard Orchard’s reusable development rules and quality checks, extracted from QueenZone.Modern.

Bring the same rules for test writing, coverage, CRAP, suppressions, verification, and pull requests into another project. The kit supplies shared policy, executable checks, an installer, and CI examples. Each project supplies its architecture, commands, paths, thresholds, and platform-specific verification.

**Start here:** [How to bring this into another project](docs/adoption.md). The guide covers new and existing repositories, Windows and macOS/Linux, configuration examples, CI, troubleshooting, and updates.

## Quick start

You need Git and Node 24. For .NET projects you also need PowerShell 7 (`pwsh`) and the project’s .NET SDK. TypeScript projects need their existing npm dependencies installed.

1. In the receiving project, create an adoption branch:

   ```sh
   cd /path/to/your-project
   git switch -c codex/adopt-development-standards
   ```

2. Clone this kit into a **separate directory**, then select a reviewed commit or tag:

   ```sh
   git clone https://github.com/RichardOrchardOrganisation/development-standards.git
   cd development-standards
   git checkout <reviewed-commit-or-tag>
   ```

   Replace the placeholder with a real commit or tag. Until the initial PR is merged, its feature branch contains the kit; see the [adoption guide](docs/adoption.md#1-prepare-the-two-repositories).

3. Preview and install. Run these from the **standards kit directory**:

   ```sh
   node scripts/install.mjs --target "/absolute/path/to/your-project" --dry-run
   node scripts/install.mjs --target "/absolute/path/to/your-project"
   ```

   Windows example:

   ```powershell
   node scripts/install.mjs --target "C:\Projects\MyProject" --dry-run
   node scripts/install.mjs --target "C:\Projects\MyProject"
   ```

4. Return to the **receiving project directory**. Configure `development-standards.json`, the appropriate coverage floors, and `config/feature-map.json`. The [configuration examples](docs/adoption.md#3-configure-your-project) show what to change for .NET, TypeScript, and mixed projects.

5. Fetch the base and run the relevant profile from the receiving repository root:

   ```sh
   git fetch origin main
   node scripts/verify.mjs --profile dotnet --base-ref origin/main
   ```

   For TypeScript, replace `dotnet` with `typescript`. For a mixed project, run both. Replace `main` if your project uses another default branch.

6. Adapt the installed CI examples, review the diff, and open an adoption PR. [CI and PR instructions](docs/adoption.md#6-connect-ci-and-open-the-adoption-pr) explain the remaining steps.

The installer preserves existing `AGENTS.md` content and the project’s license, records the standards source commit, and refuses conflicting files or symlinked destinations. Existing projects may need the [manual adoption procedure](docs/adoption.md#existing-projects-and-file-conflicts). CI examples are installed into `examples/`; they are **not enabled automatically**.

## What you get

| Area | Included |
| --- | --- |
| Agent rules | A managed section appended to your project’s `AGENTS.md` |
| Test writing | [Behavior, boundaries, regression cases, contracts, and test layers](docs/testing.md) |
| Coverage | [Global and changed-line gates, complete source reporting, and merged hits](docs/coverage.md) |
| Complexity | Coverlet-based CRAP reporting; methods above 30 are highlighted for review |
| Suppressions | [Linked exceptions and a shrinking per-file baseline](docs/suppressions.md) |
| UI verification | [Feature mapping and PR proof requirements](docs/verification.md) |
| Pull requests | A template for agent, issue, tests, probes, skipped checks, and UI proof |
| Installation | Dry-run, conflict checks, preserved project files, and a source version lock |
| Updates | Three-way comparison, compatible text merges, conflict refusal, and reviewed local overrides |
| CI | Consumer quality/proof examples and cross-platform tests for the kit |

The .NET profile performs restore, Release build, format verification, tests with coverage, coverage gating, and CRAP reporting. The TypeScript profile runs your `typecheck`, `lint`, and `test:coverage` scripts and then merges Jest and Node reports. Both profiles check suppressions and the feature map.

## What you configure per project

- Solution and TypeScript project paths, test scripts, and SDK/toolchain versions.
- Coverage floors based on the project’s actual baseline and risk.
- UI source paths, feature IDs, capture commands, and proof storage.
- Browser/device jobs and safe provider/database probes.
- GitHub required checks, branch protection, and any merge queue.
- Project architecture, deployment environments, and documented exceptions.

The initial TypeScript adapter requires **both Jest and Node coverage suites**, with production code under the configured project’s `src/` directory. A root-level project is supported. A project with only one runner needs an adapter change; do not invent an empty second report. Other languages need their own executable adapters, but can still adopt the shared policies. CRAP requires method complexity in Coverlet Cobertura; LCOV alone cannot supply it.

## Update a project

From a clean checkout of a newly reviewed standards version:

```sh
node scripts/update.mjs --target "/absolute/path/to/your-project" --dry-run
node scripts/update.mjs --target "/absolute/path/to/your-project"
```

The updater reads the installed commit from the project’s lock and compares it with the current local files and incoming standards. It merges compatible changes, preserves project customizations, and makes no changes if conflicts remain. After reviewing a conflict, `--keep-local relative/path` can retain that local version explicitly. Review the resulting project diff, run its checks, and commit the files and updated lock together.

See [update instructions and conflict resolution](docs/updating.md). The updater runs from the standards clone; it is not copied into each application. CI workflow examples still require deliberate integration into the project’s active workflows.

## Coverage defaults

The starter .NET profile uses 91% global and 70% changed-line coverage, matching QueenZone’s executable CI gate at extraction. TypeScript starter floors are 90% lines, 70% branches, and 70% changed lines; these are suggested new-project values, not QueenZone’s measured mobile baseline.

For an existing project, measure first and explicitly review its initial floors. Ratchet them upward as coverage improves. CRAP is informational, not an automatic merge blocker. Numeric floors live in project configuration; passing percentages do not replace useful assertions.

## Validate or maintain this kit

Run from this repository’s root:

```sh
npm test
npm run check
npm run test:typescript
npm run test:dotnet
```

Kit CI runs these checks on Linux, macOS, and Windows. No production database, service, emulator, or secret is required. Do not commit generated reports. See [the update command guide](docs/updating.md) for bringing future changes into a consumer repository.

## Source and license

Source: [QueenZone.Modern](https://github.com/RichardOrchardOrganisation/QueenZone.Modern), extracted 2026-10-05. See [provenance](docs/provenance.md). The [MIT license](LICENSE) and original copyright are retained.

QueenZone’s database names, deployment configuration, runner names, application fixtures, and architectural choices remain specific to QueenZone.
