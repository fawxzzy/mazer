# Mazer Level Progression Gallery

Date: `2026-08-27`

> **Superseded by `MAZER-LEVEL-PROGRESSION-GALLERY-2026-08-28.md`.** The
> gallery itself has moved to a 1-500 range with one screenshot per level;
> this doc's two real-bug findings remain historically accurate and are not
> repeated in the newer doc. Kept for that history only.

## Outcome

Single canonical level-progression screenshot gallery for Mazer: every level `1` through `200`, captured **twice per level** (two independent seeds), against real play mode. Saved once, in place, to `C:\ATLAS\tmp\captures\mazer-level-progression-gallery` -- this is the only location; the capture script clears and re-fills it on every run instead of writing a new dated copy alongside the old one. This packet replaces (not supplements) any earlier level-progression or progression-view doc/gallery -- there is exactly one of these going forward.

## Two real bugs found and fixed while building this gallery

1. **Play-mode HUD timer was silently invisible.** `resolveLegacyPlayHudFrame` computed a real `timerText`/`timerBounds` every frame, `drawHud` stored those bounds for diagnostics, and diagnostics genuinely reported `hud.visible: true` with the correct clock string -- but nothing ever fed that string into an actual rendered Phaser Text object. The play clock has been invisible in production this whole time despite every diagnostic insisting otherwise. **Correction: the play-mode HUD timer was intentionally removed from the app long ago and was never meant to come back.** The dead computation (`resolveLegacyPlayHudFrame`, `hudBounds`/`hudTimerBounds`/`hudFrame` fields, the `hud` diagnostics sub-object's fake `visible: true`, the resulting false `board-hud` overlap-violation diagnostic) has been deleted outright rather than resurrected. `legacyPlayHud.ts` now only exports `resolveLegacyFrozenElapsedMs`, which is still genuinely used elsewhere for completion-time bookkeeping.
2. **This is why the previous gallery looked like the main menu.** With the (since-removed) timer never rendering, a freshly-settled play-mode maze and a freshly-settled menu-demo maze looked nearly identical -- no visible per-round chrome distinguished them. The gallery now captures a real play-mode board with no timer (correctly, per the point above) and the real touch-control layer.

## Method

- Script: `scripts/analysis/capture-level-progression-gallery.mjs` (Playwright, follows the existing `capture-play-object-retirement.mjs` pattern -- `npm run build`, launch the real preview server, seed `mazer.progression.v1:user:runtime-diagnostics-auth-fixture` in `localStorage`, load `/?mode=play&runtimeDiagnostics=1&authFixture=authenticated`, wait on `window.__MAZER_RUNTIME_DIAGNOSTICS__` for a settled/ready play frame, screenshot).
- Viewport `405x958`, `deviceScaleFactor 2`, mobile/touch context.
- **Two generations per level** (seeds `1` and `2` by default, overridable with `--seeds=`) -- lets a reviewer see real maze-shape variety at a given difficulty and catch a generation defect that only shows up on one seed's roll, instead of judging every level from a single fixed sample.
- `targetComplexity` per level mirrors `legacyProgression.ts` exactly: `8 + (min(level, 99) - 1) * 4`.
- File names: `level-<NNN>-gen<1|2>.png` (e.g. `level-099-gen2.png`).
- Re-run any time with `node scripts/analysis/capture-level-progression-gallery.mjs` (optional `--minLevel=`, `--maxLevel=`, `--seeds=1,2,3`, `--outputDir=`, `--baseUrl=` overrides for spot checks). `--reconcileExisting` only revalidates an already-complete current-schema gallery after a non-capture code/documentation change; it verifies every expected image, case identity, required seed/geometry/topology field, and immutable capture commit/timestamp, and records its own reconciliation commit/timestamp separately without relabeling prior screenshots as captures from the current head.

## Finding for whoever picks up endless progression next

`legacyEndlessProgression.ts` already defines a real, distinct recipe for `level >= LEGACY_ENDLESS_LEVEL_BOUNDARY` (`100`) -- modifier registry, its own complexity/difficulty budget curve, deterministic per-level recipe resolution -- but as of this capture it is **only consumed by `legacyRemoteProgression.ts`** (the Supabase sync layer). `MenuScene`'s own maze-generation path still resolves everything through `legacyProgression.ts`, whose `resolveLegacyProgressionLevel` / level<->`targetComplexity` helpers hard-clamp level to `[1, 99]`.

Net effect, confirmed in this gallery: **every level >= 100 uses the same topology (per seed generation) as level 99** (same clamped `targetComplexity = 400 = LEGACY_PROGRESSION_MAX_COMPLEXITY`, same seed, same maze size, same topology digest). This is the real, currently-shipped client behavior, not a capture artifact -- the endless recipe module exists but isn't wired to what the player's own screen renders yet. That wiring (`MenuScene` / `legacyProgression.ts` consulting `legacyEndlessProgression.ts` once `level >= 100`) is the concrete next step if endless progression is meant to be visible in-game, and levels 100-200 in this gallery are the evidence for it, not 100 individually-meaningful mazes.

## Verification

- `summary.json` in the output directory records, per case: requested/observed `level`, `seedIndex`, `targetComplexity`, requested base seed, selected candidate seed, actual maze size, topology digest, walkable-tile count, rendered tile size, browser errors, and aggregate progression checks (`targetStepViolations`, `firstTenMazeSizeRegressions`, `clampMismatches`, `level99Through110SameTopology`) computed independently per seed generation.
- The immutable capture commit is recorded in both the backward-compatible `commitSha` and explicit `captureCommitSha` fields. A later evidence-only reconciliation pass records `reconciliationCommitSha` separately.

## Decisions and questions

None from this side. The level 100+ wiring gap above is worth a decision on whether/when to close it.
