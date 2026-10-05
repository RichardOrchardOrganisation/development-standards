## Shared development standards

Read `docs/testing.md`, `docs/coverage.md`, `docs/verification.md`, and `docs/suppressions.md`. Project architecture and operating details stay in the project’s own guide. Run the matching profile in `scripts/verify.mjs`; commands and floors live in `development-standards.json` and `config/typescript-coverage.json`.

- Assert observable behavior, including boundaries, validation, permissions, state transitions, and error paths. Avoid tests that merely repeat implementation or execute code without meaningful assertions.
- Add a regression test for a behavior bug when practical. Test pure logic without I/O; use deterministic integration tests for routes and composition; keep browser/device journeys focused on critical behavior. Choose tests by risk, not by an urge to maximize test count.
- Default tests must run without production credentials, network services, or real databases. Put provider-specific behavior in opt-in probes against a safe test database. Fakes and SQLite do not establish SQL Server locking, mapping, or retry behavior.
- Cover shared repository behavior through the interface against each implementation. Document intentional differences beside provider-specific tests.
- Run the same build, formatting, tests, and coverage gates locally and in CI. Merge overlapping coverage by file/line hits. Include unexecuted production files; do not manufacture coverage by omitting them.
- Read CRAP hotspots before changing complex methods; add useful tests or simplify the method. A passing coverage percentage does not replace useful assertions.
- Do not add suppressions, exclusions, retries, or weaker assertions merely to pass a gate. Any necessary exception needs a reason and an issue for its removal on the same line. Lower the suppression baseline after removals; never raise it without explicit reviewed justification.
- Search for existing shared helpers before adding another. Fix mistakes in code first, then automated checks, then rules, then skills, then review guidance. On a repeated finding, prefer a code fix or enforceable check.
- UI work must identify affected feature-map IDs and capture actual browser/device evidence. Desktop or Expo web execution does not prove native mobile behavior. Report unavailable checks as NOT RUN or Not verified with the reason.
- Do not push feature work directly to the default branch. Use `{agent}/{task}` branches, fetch the current base before a PR, and include the authoring agent, change summary, checks, real-data probe status, skipped checks, and a plain-text link to an existing issue.
- Finish authorized work, verify it, commit, push, and open a PR unless the user explicitly reserves those steps. Follow the project’s merge policy and protected checks; do not bypass them.
