# Mazer maze-lifecycle capture and analysis tool (2026-11-05)

Status: tooling only (no `src/` change). Purpose: watch the whole maze BUILD and DECONSTRUCT frame by frame on a deterministic clock and find animation defects (bleed-path remnants, partial draws, flicker, stalls, timing) with evidence instead of eyeballing a live run.

## Run it

```
npm ci
npm run visual:lifecycle -- --level 15 --viewport 390x844,1280x720 --out <dir outside the repo>
node scripts/visual/analyze-maze-lifecycle.mjs <dir>/lvl15-390x844-s1337
```

`visual:lifecycle` starts this checkout's Vite dev server on a free port (no network, no build), warms it up, drives Chromium through Playwright, and stops the server (process tree) on exit. Use `--base-url http://127.0.0.1:PORT` to reuse a running server.

| Option | Default | Meaning |
| --- | --- | --- |
| `--viewport` | `390x844,1280x720` | comma list; widths <= 430 run as touch/mobile |
| `--level N` | 1 | writes a player-progression state for level N to the auth-fixture storage key before load. Edge wraps (bleed docks) were absent at levels 1, 5 and 10 and present at 15, 20 and 30 when probed |
| `--seed N` | 1337 | `mazeSeed` query value plus a seeded `Math.random` |
| `--step-ms N` | 32 | simulated ms between captured frames (rounded to a multiple of the 16 ms tick) |
| `--complete route\|adjacent` | `route` | walk the real shortest route through `window.__MAZER_QA__.movePlayPlayer` (wrap steps included), or jump next to the goal and make the last real move |
| `--walk-every N` | 2 | capture every Nth move while walking |
| `--grace-ms N` | 1500 | simulated ms captured after the board is empty |
| `--fps N` | 62.5 | emulate a slow device: deliver only every k-th 16 ms animation frame to the app (15 -> every 4th) |
| `--reduced-motion` | off | emulate `prefers-reduced-motion` |
| `--out DIR` | `<os tmpdir>/mazer-lifecycle-capture` | output root. Keep it outside the repo |

Output per run (`lvl<L>-<W>x<H>-s<seed>[-fps<N>]/`): `frames/NNNN_<phase>_<simMs>ms.png`, `manifest.json`, `contact-<phase>.png` (build, play, goal-hold, deconstruct), and `analysis.json` after the analyzer runs.

Sequence: clear storage (+ progression seed) -> load `/?runtimeDiagnostics=1&authFixture=authenticated&mazeSeed=N` -> wait for a settled menu at a fixed simulated time -> click `button[data-mazer-accessibility-command="start"]` -> capture the BUILD until `isLegacyPlayLifecycleInputLocked()` is false -> walk the route (phase `play`) -> `goal-hold` until `menuStaticDrawLifecyclePhase === 'deconstructing'` -> capture `deconstruct` until the tile counter reads 0, plus the grace period. The capture aborts if the diagnostics attribute `data-mazer-visual-diagnostics` does not contain `Player Skill Lv <level>` after Start.

## Deterministic clock

`page.clock.install({ time: 0 })` runs before navigation and the clock is paused immediately (`pauseAt(16)`), so no wall time ever reaches the app. Boot and every later step advance with `page.clock.runFor(n)`. Playwright's fake clock replaces `requestAnimationFrame`, `setTimeout` and `performance.now`; Phaser's loop runs on the fake RAF, so each `runFor(16)` is exactly one game frame (verified: `runFor(1000)` = 62-63 frames, `scene.time.now` tracks `performance.now()` within one frame). Wall-clock rendering speed does not change the simulation.

What is and is not deterministic:

- Deterministic (verified by two identical runs): maze, tile counts, phase transitions, every manifest milestone and every probe value (299/299 frames identical).
- Not bit-identical: 29 of 299 frames differ by <= 12 lit pixels (background sparkles). Detectors use thresholds, not pixel equality.
- The play maze seed mixes `scene.time.now` and `Math.random`, so Start is pressed at a fixed absolute simulated time and `Math.random` is reseeded right before the click. Different `--fps`/`--seed`/`--level` values produce different mazes, so compare like with like.
- `--fps` is emulation by dropping RAF deliveries. It models frame-coupled logic; it is not a measurement of a real device.

The per-frame probe reads internal scene fields (`menuStaticDrawLifecyclePhase`, `menuStaticDrawTilesVisible`, `boardBleedPathImages`, `resolveLegacyBleedDockGrowthProgress()`, ...). They are private TypeScript members but plain properties at runtime; a rename shows up as `null` in the manifest, it does not crash the capture.

## Analyzer (`scripts/visual/analyze-maze-lifecycle.mjs`)

Pure, exported functions over RGBA images and compact per-frame features (decoder in `scripts/visual/lib/png-codec.mjs`, `node:zlib` only). A pixel is "lit" when all channels >= 150 and the channel spread <= 70 (path core, dock stub; excludes saturated stars, gear, digits, beams). Components are 4-connected after a 2 px bridge. The baseline frame (emptiest early build frame: title, sigils, HUD) is subtracted.

| Detector | What it reports |
| --- | --- |
| residual | lit components in the last frame; the tail of the deconstruct (lit area <= 6 % of peak) and islands surviving in it, flagged tile-sized / near a screen edge |
| islands | tile-sized components that are not the main body and persist >= 4 frames in build or deconstruct (`nearEdge` marks bleed docks) |
| partial-bleed | per dock (from `dockEligible` + board render bounds): strip extent strictly between 10 % and 90 % of its usual length for > 3 frames; border cell lit without its strip; strip without its cell |
| flicker | build lit area falling (deconstruct: rising) and 8 px blocks that flip against the phase direction |
| stall | first tile time, mid-build runs of >= 10 unchanged frames, trailing dead time |
| timing | Start -> first tile / build done / input unlocked / goal / deconstruct start / board empty (probe and image) |

Tests: `npx vitest run tests/visual/maze-lifecycle-analysis.test.mjs` (synthetic images only, no browser). They are not in the `npm test` spine.

## Limitations

- Image detectors are heuristics: the level-announcer digit (white blocks inside a coloured glyph) shows up as an island in the middle of the screen, and the laser/trail overlays flip a few path blocks (`flicker` block counts are an upper bound; check the frames cited). Treat findings as pointers to frames, then look at them.
- Dock footprints use the settled play maze; frames of the next maze (after deconstruct) are not analysed as docks.
- Only the Canvas/headless Chromium path is exercised. Real-device frame rates, hidden-tab throttling and audio are not covered.
- The dev server serves unminified modules; timing under `vite build` was not compared.

## Findings on origin/main 1670c8af (bleed-path remnant)

Reproduced at 390x844 and 1280x720 on wrap-bearing level 15 (level 1 has no docks and no such remnant).

- Build: a border "anchor" tile with its dock nub appears on its own, ahead of any on-screen neighbour (desktop frames 63-70, ~2.0-2.2 s), then the dock grows to full length over ~1.3 s (frames 63-105). Mobile shows the same isolated tile for 5-8 frames, but the dock is already near full length (the board-to-edge gap is only ~17 px, so the growth is barely visible).
- Deconstruct: the dock retracts to a nub in the first 420 ms while the tile stays (extent 22 % of the usual length for 42 frames), then the anchor tile is removed late, so a single tile plus nub is the last thing left of that region (desktop frame 243-245; mobile frames 284-288, the top and bottom wrap pair are the last survivors).
- Root cause (code, line numbers at 1670c8af):
  1. The dock is drawn inside the per-tile loop (`MenuScene.ts` `drawBoardPaths` -> `drawPathPoint` -> `drawLegacyPathBorderDock`, ~L8864-8905), so a dock exists exactly when its anchor border tile is revealed, never as a unit with the rest of its path.
  2. The reveal order is a BFS over wrap-aware neighbours (`legacyAnimationCadence.ts` `buildLegacyMazeRevealOrder` L142-190 via `resolveLegacyWalkableGridNeighbors`, `legacyMaze.ts` L390). A wrap hop makes the partner tile on the opposite screen edge enter the order early, so on screen it appears (and, in reverse, disappears) detached from every neighbour.
  3. The dock length is animated on a different clock from the tiles: deconstruct retracts it over `LEGACY_BLEED_DOCK_GROWTH_MS = 420` from the deconstruct arm time (`MenuScene.ts` L1765, `resolveLegacyBleedDockGrowthProgress` L8389-8409) while tile removal starts after hold + player-remove + trail-fade (`resolveLegacyMenuStaticDeconstructTileStartAtMs` L6705) and runs for seconds; build grows it over `LEGACY_BLEED_DOCK_BUILD_GROWTH_MS = 1100` measured against an estimate (`resolveLegacyMenuStaticBuildDurationEstimateMs` L6692), not against the frame-stepped reveal.
  4. At growth 0 the dock is not removed, only shortened to a minimum: `Math.max(1, Math.round(continuationLength))` (`legacyMenuRender.ts` L381 and L445), and the bleed strip image (`drawLegacyBleedPathImage` ~L8655) is stretched over that remnant. Result: a tile plus nub is left standing until the tile's own turn comes.

  The fix direction implied by the owner's "all at once or not at all": make the dock a function of one timeline value shared with the tile it belongs to (both visible, or both hidden), drop the 1 px floor at progress 0, and order the reveal so a wrap-partner tile is revealed with its dock partner or not before its on-screen neighbours.
