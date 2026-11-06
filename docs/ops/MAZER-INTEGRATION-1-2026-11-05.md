# Mazer Integration 1 (2026-11-05)

Status: integration record for one PR. Merging this PR is an owner decision; nothing here authorizes a deploy.

Base: `origin/main` at `1670c8af`. Branch: `claude/mazer-integration-1-20261105`.

## Risk summary

- Behavior change: level 1 becomes a straight corridor along the board's longer axis (lane 1). Everything else is tests, docs, scripts, or dormant pure modules that no scene imports.
- Hazard, chaser, placement, loadout and bot modules are DRAFT and dormant. They are exported only from the local barrel `src/mazer-core/hazards/index.ts` (never from `src/mazer-core/index.ts`) and a source-boundary test pins that no scene or legacy-runtime file imports them.

## Merged lanes (merge order, `git merge --no-ff`)

| # | Branch | Tip sha | What |
| --- | --- | --- | --- |
| 1 | `claude/mazer-p1-corridor-level1-20261105` | `6233ce93` | Level 1 is a straight corridor along the longer axis (the only runtime behavior change) |
| 2 | `claude/mazer-lane-e-difficulty-shaping-20261105` | `7ff9fdd5` | Generation delivery-report harness (measurement only), script `generation:delivery-report` |
| 3 | `claude/mazer-p3-hazard-graph-20261105` | `35266e32` | DRAFT hazard graph contract and solvability validator (P3), dormant |
| 4 | `claude/mazer-hazard-placement-20261105` | `bef60c6d` | DRAFT deterministic hazard placement and loadout schedule (pure, dormant) |
| 5 | `claude/mazer-fallible-bots-20261105` | `b32eb23c` | DRAFT fallible practice bots and difficulty report under `src/mazer-core/eval/` (pure, dormant) |
| 6 | `claude/mazer-foundations-validators-20261105` | `1ce720aa` | Asset manifest schema and validator, cosmetic catalog model and validator, tutorial registry v1 and ack store (3 commits) |
| 7 | `claude/mazer-feature-registry-20261105` | `e4820b82` | Maze feature registry and telemetry feature-era stamp |
| 8 | `claude/mazer-endless-checkpoint-20261105` | `3f5f8fea` | Pure versioned Endless checkpoint store |
| 9 | `claude/mazer-run-status-vm-20261105` | `6a9b8f85` | Pure shared run-status panel view-model |
| 10 | `claude/mazer-outcome-fixtures-20261105` | `43267b44` | Progression outcome fixtures, formula inventory, offline candidate comparison, script `progression:compare` |
| 11 | `claude/mazer-corpus-seedpacks-20261105` | `3c8884ed` | Versioned AI run seed packs with deterministic baseline reports (2 commits), scripts `ai:corpus:baseline`, `ai:corpus:coverage` |
| 12 | `claude/mazer-message-audit-20261105` | `a00e9fd3` | Player-message inventory and rank-vocabulary guards (tests and doc) |
| 13 | `claude/mazer-ui-pure-modules-20261105` | `6cc95b44` | Pure view-models for leaderboard, pause card and header identity |
| 14 | `claude/mazer-auth-view-20261105` | `bea6ed77` | Pure shared-account auth screen view-model, layout and anatomy spec |
| 15 | `claude/mazer-contract-docs-20261105` | `1a808afe` | Unsigned contract drafts and board reconciliation (6 doc commits) |
| 16 | `claude/mazer-chaser-engine-20261105` | `69a30a25` | DRAFT junction-greedy chaser/interceptor engine and joint solvability (P6), dormant, nothing wired |

Merge conflicts: only `package.json` (script lines from lanes 2 and 10), resolved by keeping both.

## Integration fixes (separate commits after the merges)

- Hazards barrel `src/mazer-core/hazards/index.ts` exports placement, loadout and the three chaser modules; the exact file list in `tests/core/hazards/source-boundary.test.ts` was updated to match. `src/mazer-core/index.ts` is untouched.
- `npm test`, the `test:verify` spine and the `Verify` workflow now also run `tests/core`, `tests/cosmetics`, `tests/tutorial` and `tests/architecture` (previously none of the new lane tests ran in CI).
- `scripts/check-decision-registry.mjs` entry guard now uses `pathToFileURL(process.argv[1]).href`; the old `file://${argv[1]}` comparison never matched on Windows, so the script silently did nothing there.
- `scripts/analysis/ai-runner-calibration.ts` called `createLegacyGeneratedMenuMaze(scale, seed)` where the signature is `(width, height, seed, ...)`. It now passes `(scale, scale, seed)`. Earlier calibration numbers were therefore measured with the seed used as the maze height and an undefined seed; they should be treated as not comparable with new runs.
- The graph-contract provenance line in the endless hazard draft was corrected (documented in two docs and three passages, not three docs).
- `tests/reset/legacy-player-message-inventory.test.ts` and its inventory doc pin 23 literals added by merged lanes after the audit base (auth and leaderboard view-model copy, feature-registry descriptions). This was a real cross-lane break: the guard was written against a base that did not yet contain those modules.
- `tests/analysis/mazev2-convergence-harness.test.ts` normalizes `\r\n` before asserting multi-line source text (fails on autocrlf checkouts, including clean `origin/main`).

## New npm scripts

- `assets:validate` (asset manifest validator; example: `npm run assets:validate -- --manifest tests/fixtures/assets/example/manifest.json`)
- `generation:delivery-report`
- `progression:compare`
- `ai:corpus:baseline`
- `ai:corpus:coverage`

## Known failing on clean main (not fixed here)

- `tests/scenes/menu-intent-runtime.test.ts` "emits spectator-first trap, patrol, plate, and key semantics for longer shipping paths": fails on a clean `origin/main` checkout. Not a line-ending issue: it uses a fixed 8-tile one-row fixture and asserts a `timed-gate` telegraph at step 6. The spectator plan logic was last changed by `a8808918` (short-maze mechanic tile collisions), which can leave short paths without a gate. Needs an owner decision on whether the fixture or the plan is wrong. Left untouched; no assertion was loosened.

## Open owner decisions

- Hazard product contract (unsigned): `docs/research/MAZER_ENDLESS_HAZARD_PRODUCT_CONTRACT_DRAFT.md`, including the Reopening Gate sign-off line and the freeze-list implication.
- Economy and entitlement contract (unsigned): `docs/research/MAZER_ECONOMY_AND_ENTITLEMENT_CONTRACT_DRAFT.md`.
- Offline sync contract and PWA strategy (unsigned): `docs/architecture/MAZER-OFFLINE-SYNC-CONTRACT.md`, `docs/architecture/MAZER-PWA-STRATEGY-AND-BROWSER-MATRIX.md`.
- Hazard graph contract, placement/loadout, bots, chaser (draft, dormant): `docs/architecture/MAZER-HAZARD-GRAPH-CONTRACT.md`, `docs/architecture/MAZER-HAZARD-PLACEMENT-AND-LOADOUT.md`, `docs/architecture/MAZER-DIFFICULTY-MONITOR-BOTS.md`, `docs/architecture/MAZER-CHASER-ENGINE.md`.
- Level 1 corridor: felt-difficulty change; needs owner sign-off before it ships to players.
- Board reconciliation (unsigned): `docs/ops/MAZER-BOARD-RECONCILIATION-2026-11-05.md`.
- Whether the `menu-intent-runtime` baseline failure is fixed in the fixture or in the spectator plan.
