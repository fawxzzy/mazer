# Mazer Level Progression Gallery

Date: `2026-08-28`

Supersedes `MAZER-LEVEL-PROGRESSION-GALLERY-2026-08-27.md` in full -- same canonical
location and script, wider range, no duplicate seeds per level. That doc's
two real-bug findings (the dead play-mode HUD timer, and why the previous
gallery looked like the main menu) are historical and already shipped; not
repeated here.

## Outcome

Single canonical level-progression screenshot gallery for Mazer: every level
`1` through `500`, **one screenshot per level**, against real play mode.
Saved once, in place, to `C:\ATLAS\tmp\captures\mazer-level-progression-gallery`
-- the capture script clears and re-fills this directory on every run instead
of writing a new dated copy alongside the old one. Also published as an
artifact contact sheet with a jump-to-level control (thumbnails only, not the
full-resolution captures) for quick browsing without pulling the directory
locally.

## What changed since the 2026-08-27 gallery

- **Range**: `1-200` -> `1-500`.
- **Seeds per level**: `2` -> `1`. The two-seed comparison was useful once to
  catch a generation defect that only shows up on one seed's roll, but at
  500 levels it doubles an already-large run for a benefit this gallery's
  actual use (a fast, frequently-repeated visual/topology check) doesn't
  need. The same per-seed progression checks below still run, just over one
  sample per level instead of two.
- **Capture concurrency**: sequential -> a worker pool of concurrent browser
  contexts within one Chromium instance (default `6`, `--concurrency=N` to
  override). This is the actual speed/cost lever: it's what makes a run this
  size practical to repeat often as the game changes, not the range or seed
  count reduction.

## Method

- Script: `scripts/analysis/capture-level-progression-gallery.mjs`
  (Playwright -- `npm run build`, launch the real preview server, seed
  `mazer.progression.v1:user:runtime-diagnostics-auth-fixture` in
  `localStorage`, load `/?mode=play&runtimeDiagnostics=1&authFixture=authenticated`,
  wait on `window.__MAZER_RUNTIME_DIAGNOSTICS__` for a settled/ready play
  frame, screenshot).
- Viewport `405x958`, `deviceScaleFactor 2`, mobile/touch context.
- `targetComplexity` per level mirrors `legacyProgression.ts` exactly:
  `8 + (min(level, 99) - 1) * 4`.
- File names: `level-<NNN>-gen1.png` (e.g. `level-099-gen1.png`; the `gen1`
  suffix is kept even at one seed so the schema stays compatible with an
  occasional `--seeds=1,2` multi-seed comparison run without special-casing
  either shape).
- Re-run any time with `node scripts/analysis/capture-level-progression-gallery.mjs`
  (optional `--minLevel=`, `--maxLevel=`, `--seeds=1,2`, `--concurrency=N`,
  `--outputDir=`, `--baseUrl=` overrides for spot checks). `--reconcileExisting`
  only revalidates an already-complete current-schema gallery after a
  non-capture code/documentation change.

## Full 1-500 run result (this doc's date, single seed, concurrency 6)

`500/500` captured, `0` failures, `0` clamp mismatches, `0` target-step
violations, `0` first-ten maze-size regressions. `level99Through110SameTopology: true`.

## Finding, unchanged from the 2026-08-27 gallery: endless progression still isn't wired to what the player sees

`legacyEndlessProgression.ts` defines a real, distinct recipe for
`level >= LEGACY_ENDLESS_LEVEL_BOUNDARY` (`100`) -- modifier registry, its own
complexity/difficulty budget curve, deterministic per-level recipe resolution
-- but it is **only consumed by `legacyRemoteProgression.ts`** (the Supabase
sync layer). `MenuScene`'s own maze-generation path still resolves everything
through `legacyProgression.ts`, whose level<->`targetComplexity` helpers
hard-clamp level to `[1, 99]`.

Net effect, reconfirmed by this 1-500 run: **every level >= 100 uses the same
topology as level 99** (same clamped `targetComplexity = 400`, same maze
size, same topology digest). This is real, currently-shipped client behavior.

**This remains a deliberate decision, not an oversight worth silently
reversing.** `legacyEndlessProgression.ts`'s own header comment states it is
non-load-bearing until a server-owned completion contract can verify recipe
provenance -- guarding against exactly the class of client-reported-vs-
server-truth integrity gap behind the R019/R020 production incident. Wiring
it into live client generation needs that provenance contract decided first,
not a quick client-side hookup.

## Verification

- `summary.json` in the output directory records, per case: requested/observed
  `level`, `seedIndex`, `targetComplexity`, requested base seed, selected
  candidate seed, actual maze size, topology digest, walkable-tile count,
  rendered tile size, browser errors, and aggregate progression checks
  (`targetStepViolations`, `firstTenMazeSizeRegressions`, `clampMismatches`,
  `level99Through110SameTopology`).
- The immutable capture commit is recorded in both the backward-compatible
  `commitSha` and explicit `captureCommitSha` fields.

## Decisions and questions

Whether/when to wire `legacyEndlessProgression.ts` into `MenuScene`'s own
generation path is still open -- flagged here again rather than decided
unilaterally, per the reasoning above.
