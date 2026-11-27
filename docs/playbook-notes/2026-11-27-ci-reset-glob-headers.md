# 2026-11-27 - Correct the required-tests header comments after the tests/reset CI glob

- WHAT changed:
  - Header and doc comments in `scripts/verify/measured-baseline-required-tests.mjs`, `navigation-core-required-tests.mjs`, `shared-account-oauth-required-tests.mjs`, `teleport-required-tests.mjs` and `world-identity-required-tests.mjs` now match `.github/workflows/verify.yml` after PR #727: CI runs the whole `tests/reset` folder (two named exclusions, both covered elsewhere) and takes `tests/core`, `cosmetics`, `tutorial`, `architecture`, `brand` and `legacy-runtime` whole. `tests/render`, `tests/scenes`, `tests/visual` and `tests/mazeV2` are still named by file, and the five required-coverage lists are still explicit steps.
  - Comments only: no code, no list entries, no behavior change. One stale CI step name in a comment (navigation-core) was corrected too.
- WHY it changed:
  - The headers still said CI has no directory globbing and "never ran" these files. That was true before #727 and now misleads anyone deciding whether a new test needs listing. The historical reason each list exists is kept.
- Rule:
  - A comment that describes what CI runs must be checked against `verify.yml` in the same change that alters the workflow.
- Evidence:
  - Read `verify.yml` on origin/main 8aaf0af7 line by line. Known and left unchanged: the required-coverage runners do not filter, so 8 `tests/reset` entries (legacy-playable-graph, legacy-menu-backdrop, legacy-auth-gate, legacy-header-edge-padding, legacy-hit-targets, legacy-ui-standards, legacy-ui-tap-recovery, ui-surface-capture-script) now run twice in CI, as do 4 `tests/architecture` entries that already ran twice before #727.
- Status: source only; comment changes, no deploy needed.
