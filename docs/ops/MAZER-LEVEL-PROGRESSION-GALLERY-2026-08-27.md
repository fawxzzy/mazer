# Mazer Level Progression Gallery

Date: `2026-08-27`

## Outcome

Re-captured a full level-progression screenshot gallery (level `1` through `110`) against current `main`, following the huge volume of Codex work that landed since the previous packet -- auth/signup overhaul, the new `src/ui/dom` + `src/state` primitives, AI navigation acceptance, camera zoom, the player-transfer goal effect, and the full retirement of the dormant rooms subsystem (`legacyRoomActivationPlan.ts` / `legacyRoomCandidateMetadata.ts` / `legacyStaticSlowTile.ts`, all deleted).

Saved once, in place, to `C:\ATLAS\tmp\captures\mazer-level-progression-gallery` -- this is the single canonical location; the capture script clears and re-fills it on every run instead of writing a new dated copy alongside the old one.

## Method

- New reusable script: `scripts/analysis/capture-level-progression-gallery.mjs` (Playwright, follows the existing `capture-play-object-retirement.mjs` pattern -- `npm run build`, launch the real preview server, seed `mazer.progression.v1:user:runtime-diagnostics-auth-fixture` in `localStorage`, load `/?content=core-only&mode=play&theme=aurora&runtimeDiagnostics=1&authFixture=authenticated`, wait on `window.__MAZER_RUNTIME_DIAGNOSTICS__` for a settled/ready play frame, screenshot).
- Viewport `405x958`, `deviceScaleFactor 2`, mobile/touch context, fixed `mazeSeed=1` for every level (isolates the level->difficulty relationship from seed-driven shape variance).
- `targetComplexity` per level mirrors `legacyProgression.ts` exactly: `8 + (min(level, 99) - 1) * 4`.
- Re-run any time with `node scripts/analysis/capture-level-progression-gallery.mjs` (optional `--minLevel=`, `--maxLevel=`, `--outputDir=`, `--baseUrl=` overrides for spot checks).

## Finding for Codex: levels 100-110 are not yet distinct

`legacyEndlessProgression.ts` already defines a real, distinct recipe for `level >= LEGACY_ENDLESS_LEVEL_BOUNDARY` (`100`) -- modifier registry, its own complexity/difficulty budget curve, deterministic per-level recipe resolution -- but as of this capture it is **only consumed by `legacyRemoteProgression.ts`** (the Supabase sync layer). `MenuScene`'s own maze-generation path still resolves everything through `legacyProgression.ts`, whose `resolveLegacyProgressionLevel` / level<->`targetComplexity` helpers hard-clamp level to `[1, 99]`.

Net effect, confirmed in this gallery: **`level-100.png` through `level-110.png` are pixel-identical to `level-099.png`** (same clamped `targetComplexity = 400 = LEGACY_PROGRESSION_MAX_COMPLEXITY`, same fixed seed). This is the real, currently-shipped client behavior, not a capture artifact -- the endless recipe module exists but isn't wired to what the player's own screen renders yet. That wiring (`MenuScene` / `legacyProgression.ts` consulting `legacyEndlessProgression.ts` once `level >= 100`) is the next concrete step if endless progression is meant to be visible in-game.

## Verification

- `summary.json` in the output directory records, per level: requested/observed `level` and `targetComplexity`, the actual maze seed and size the generator produced, any console/page errors, and a pass/fail per case plus an overall `pass` flag.
- Commit SHA the gallery was captured against is recorded in `summary.json`'s `commitSha` field.

## Decisions and questions

None from this side -- purely an observational capture packet. The level 100-110 wiring gap above is worth a decision on whether/when to close it.
