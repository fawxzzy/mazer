# Mazer Integration 2 (2026-11-05)

Status: integration record for one PR, stacked on Integration 1 (PR #373, `claude/mazer-integration-1-20261105`, head `b9691fe4`). Merging is an owner decision; nothing here authorizes a deploy.

Base: `claude/mazer-integration-1-20261105`. Branch: `claude/mazer-integration-2-20261105`. The PR retargets to `main` once #373 merges.

## Risk summary

- Behavior change: the maze intro/outro and the diamond edge markers are rewritten (lane 3), and the AI demo walker no longer draws the red target-tile outline (lane 4). Both live in `src/scenes/MenuScene.ts` (Wave 5C).
- Lanes 1 and 2 add tooling and dormant pure modules. Nothing imports `boardTileBake.ts` / `boardTileStyle.ts` from a scene.

## Merged lanes (merge order, `git merge --no-ff`)

| # | Branch | Tip sha | What |
| --- | --- | --- | --- |
| 1 | `claude/mazer-lifecycle-capture-20261105` | `94519f0f` | Deterministic maze build/deconstruct capture and analyzer (`scripts/visual/capture-maze-lifecycle.mjs`, `analyze-maze-lifecycle.mjs`, `lib/png-codec.mjs`), tests, doc |
| 2 | `claude/mazer-tile-bake-20261105` | `ea17531a` | `src/render/boardTileBake.ts`, `boardTileStyle.ts`, tests, governance and wiring-plan docs. Nothing wired |
| 3 | `claude/mazer-intro-graphics-20261105` | `52eed8c6` | 2 commits: one time-derived intro timeline (`introTimeline.ts`, G1) and one procedural diamond system with all-8 beams in both directions (`edgeMarkers.ts`, G2); large `MenuScene.ts` change, `legacyAnimationCadence` update, tests |
| 4 | `claude/mazer-ai-red-marker-20261105` | `ba29fc74` | Removes the AI "committed target tile" red outline from the menu AI-memory overlay |

Not included on purpose: `claude/mazer-p2-budget-ladder-20261105` (felt-difficulty change; the owner must see it first, own PR later) and `claude/mazer-install-boot-20261105` (PR #372).

## Conflicts and how they were resolved

- Lanes 1, 2 and 3: merged clean.
- Lane 4 vs lane 3: one conflict, the `src/scenes/MenuScene.ts` constants block (~L1615). Lane 3 deleted the old static-draw cadence constants (replaced by `introTimeline.ts` and a comment); lane 4 deleted `LEGACY_MENU_AI_MEMORY_TARGET_EDGE` in the same neighborhood. Resolution: kept lane 3's structure (cadence constants gone, comment kept) and re-applied lane 4's intent (target-edge constant removed). The overlay hunk (option tiles only, `drawLegacyTileEdgeOutline` helper removed) auto-merged and was checked in the final diff. `tests/scenes/menu-render-frame.test.ts` auto-merged; its rewritten pin and the regression test `never draws a red or danger-colored marker for the menu demo walker next step` pass on the merged tree.

## Integration fixes (separate commits after the merges)

- Tests wired by file into the `test:verify` spine (`scripts/verify/run-test-verify.mjs`) and a new step in `.github/workflows/verify.yml`: `tests/render/introTimeline.test.ts`, `edgeMarkers.test.ts`, `boardTileBake.test.ts`, `boardTileStyle.test.ts` and `tests/visual/maze-lifecycle-analysis.test.mjs` (`tests/render/support/boardTileFixtures.ts` is a helper, not a suite). `tests/render/palette.test.ts` is deliberately excluded: it fails 3 tests on a clean `main` (`resolveAmbientThemeProfile is not a function`), so a `tests/render` directory glob would turn the spine red for a pre-existing baseline. Add the glob only after that is repaired.
- `package.json` edits are NOT in this PR (see next section).

## package.json held out (integrator-wave-mix guard)

`package.json` is Wave 5B and `src/scenes/MenuScene.ts` is Wave 5C in the decision registry. A change set spanning both fails the `integrator-wave-mix` architecture guard (4 tests: decision-registry, design-tokens, topology-path, ui-state-model). The guard was not loosened. The merged lifecycle lane's `visual:lifecycle` script line and the `npm test` file list were therefore reverted out of this PR and need a separate package.json-only follow-up PR (no MenuScene change):

- add `"visual:lifecycle": "node ./scripts/visual/capture-maze-lifecycle.mjs",`
- append to the `test` script after `tests/architecture`: `tests/render/introTimeline.test.ts tests/render/edgeMarkers.test.ts tests/render/boardTileBake.test.ts tests/render/boardTileStyle.test.ts tests/visual/maze-lifecycle-analysis.test.mjs`

Until then, `npm test` does not run those five files; `npm run test:verify` and CI do. Run the capture tool with `node ./scripts/visual/capture-maze-lifecycle.mjs ...` instead of `npm run visual:lifecycle`.

## Graphics lane summary (lane 3)

- `src/render/introTimeline.ts`: pure function of elapsed ms for tile reveal (constant duration for any tile count), level digit, spawn laser, spawn pop, goal pulse, input unlock and an atomic wrap/bleed edge-path switch. `MenuScene` keeps only `introStartedAtMs`. Frame rate can no longer stretch the intro (the old one-batch-per-update stepping took 30-60 s at a few fps). Unlock coincides with the laser landing. Deconstruct mirrors the intro in <= 900 ms.
- Measured intro timing: about 1.2 s to input unlock. Reduced motion: 250 ms crossfade, no laser. Tap or key during the Play intro skips it.
- `src/render/edgeMarkers.ts`: eight procedural kites in their own lowest-depth Graphics layer; arrival fires beams from all 8 to the spawn tile, departure fires beams from the player to all 8. Old diamond PNG sprites, the transfer conduit canvas, strip-image beam pools and the orbit/spin lifecycle are retired from `MenuScene`.
- Pins changed by the lane: rewritten pins in `tests/reset/legacy-reset.test.ts`, `tests/reset/legacy-transition-integrity.test.ts` and `tests/scenes/menu-render-frame.test.ts`; 3 harness members removed in `tests/reset/legacy-player-progression-flow.test.ts`; the guard in `scripts/analysis/verify-gameplay-teleport-transfer.mjs` updated. Lane 4 additionally rewrote one `menu-render-frame` source pin and added the no-red-marker regression test.

## Lifecycle tool

```
node ./scripts/visual/capture-maze-lifecycle.mjs --level 15 --viewport 390x844,1280x720 --out <dir outside the repo>
node ./scripts/visual/analyze-maze-lifecycle.mjs <out>/lvl15-390x844-s1337
```

Full usage and detectors: `docs/ops/MAZER-LIFECYCLE-CAPTURE-TOOL-2026-11-05.md`.

## Known gaps and follow-ups

- BootScene still preloads the old diamond/beam PNGs and `public/assets/vfx/diamonds/` still exists. `BootScene.ts` is Wave 4D-A and `MenuScene.ts` is Wave 5C, so removing the preload and the files needs its own PR (the integrator-wave guard blocks mixing them). Follow-up: drop the `/assets/vfx/diamonds` preload entries and the PNGs, and update asset manifests/validators and any tests that pin the file list.
- The lifecycle analyzer reports partial-strip findings on the merged tree; the graphics lane believes they are trail pulses, not dock remnants. Not independently confirmed.
- `goalPulse` is computed by the timeline but not drawn.
- Reduced motion and the tap/key skip were not exercised in a browser.
- `scripts/analysis/verify-gameplay-teleport-transfer.mjs` (guard updated by the lane) is a stale QA script and was not run here.
- `npm test` does not yet include the five new test files (package.json follow-up above).

## Known failing on clean main (recorded, not fixed, no assertion loosened)

- `tests/scenes/menu-intent-runtime.test.ts` "emits spectator-first trap, patrol, plate, and key semantics for longer shipping paths" (already listed in Integration 1).
- `tests/render/palette.test.ts`: 3 tests (`resolveAmbientThemeProfile is not a function`).
- Locally, the four `integrator-wave-mix` architecture tests compare against `origin/main` unless `GITHUB_BASE_REF` is set; run with `GITHUB_BASE_REF=claude/mazer-integration-1-20261105` to evaluate this stacked PR the way CI does.

## Open owner decisions

- Board tile style: Option B "Chip" (default) vs C "Trace" (alternate) is pending; the owner picks after seeing the real game. The Navigation Core v2 amendment (`docs/assets/reference/navigation-core-v2/README.md`) approval line is PENDING.
- Wiring the tile bake (`docs/ui/MAZER-BOARD-TILE-BAKE-WIRING-PLAN-2026-11-05.md`) is blocked on that decision.
- The P2 budget ladder (felt difficulty) still needs owner review before its own PR.

## Verification on the merged tree (local)

- `npm run lint`: clean. `npm run build`: passes (PWA precache 39 entries).
- `npx vitest run` over tests/reset, core, architecture, analysis, cosmetics, tutorial, scenes, visual plus the four render files: 192 files, 2154 passed, 1 skipped, 1 failed (the known `menu-intent-runtime` baseline). Run with `GITHUB_BASE_REF=claude/mazer-integration-1-20261105`.
- `npm run test` (same env): 165 files, 1857 passed, 1 skipped, 0 failed. The five new files are run separately (133 tests passed) because of the held-out package.json edit.
- `tests/render/palette.test.ts`: 3 failed, 6 passed (baseline, excluded from the spine).
- `node scripts/check-decision-registry.mjs` passes; `checkDesignTokens()` returns true.
- Browser proof (dev server, 390x844 and 1280x720, storage cleared, `Player Skill Lv 01` confirmed after Start): menu idle shows no red marker ahead of the walker; Start shows beams from all 8 diamonds; goal reset shows beams from the player to all 8.
- Lifecycle tool, level 15, seed 1337: residual components after deconstruct 0 at both viewports; input unlocked at 1216 ms; islands 3 (390x844) and 4 (1280x720); partial-strip findings 2 and 2 (all in `play`/`goal-hold` phases, extent 0.79-0.88 of the dock). Islands and partial strips are heuristic pointers, not confirmed defects.
