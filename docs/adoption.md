# Adoption and updates

1. Pin a reviewed standards commit/tag, then run the installer with --dry-run.
2. Install onto a feature branch. Existing conflicting files cause a refusal before writes. Existing AGENTS.md content is preserved and receives one managed section. Do not run installation concurrently with other file writers.
3. Configure the solution, source paths, UI paths, coverage thresholds, package scripts, and feature map. Keep project architecture and operational constraints in the local guide.
4. Run host-free checks. Measure and review any existing coverage/suppression baseline. Add provider probes and browser/device jobs relevant to the project.
5. Adapt examples/consumer-quality.yml and examples/consumer-pr-verification.yml, and configure GitHub required status checks and branch/merge-queue protections. Workflow files alone do not create those protections. Use the project’s supported SDK and install Coverlet’s collector in test projects.
6. Review and merge the adoption PR. Record exceptions with their reasons and removal issues.

Installed files are vendored so CI does not depend on a mutable remote branch. development-standards.lock.json records the source Git commit and package version. Commit that lock with the installed files. For updates, generate a fresh install in a temporary directory and compare it to the current project; port changes through a PR. The initial installer intentionally has no force-overwrite/update mode. Never replace local project settings, feature maps, suppression baselines, or custom verification jobs blindly.

The consumer workflow example implements only .NET host-free quality checks. TypeScript projects should run Node 24 and `node scripts/verify.mjs --profile typescript --base-ref "$BASE_SHA"`; preserve the same PR/merge-group base selection and full checkout. Browser/device proof, provider probes, dependency/security auditing, deployment smoke, and environment protection need project-specific configuration.

For assistant portability, install the AGENTS.md fragment and keep its linked docs in the repository. Tools that do not read AGENTS.md should receive a short native instruction file pointing to the same policy, rather than a duplicated policy. Optional tool-specific skills can wrap repeatable commands; mandatory standards remain in repository rules and CI.
