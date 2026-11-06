# Mazer board tile bake - wiring plan (2026-11-05)

Status: EXECUTED 2026-11-06 by the Chip wiring PR (kept as history; see docs/assets/reference/navigation-core-v2/README.md). Original status: PLAN ONLY, no scene edited. Line numbers are from `src/scenes/MenuScene.ts` at
base `1670c8af` and will move; re-grep by symbol before editing.
Amendment this plan implements: `docs/assets/reference/navigation-core-v2/README.md` (DRAFT,
owner approval PENDING).
Modules to wire: `src/render/boardTileBake.ts`, `src/render/boardTileStyle.ts` (delivered, unwired).

## Preconditions (must hold before any wiring PR)

1. The graphics lane (another lane is rewriting the intro and edge diamonds in
   `MenuScene.ts`) has merged. Wiring edits the same file; do not interleave.
2. Navigation Core v2 amendment has an owner decision to proceed (approval line may stay
   PENDING for the flagged, default-off rollout in step 3 below, but the style choice is
   final only after the owner has seen it in the real game).
3. Decision-registry handling is settled (see the amendment doc: claiming the new files
   would make a `MenuScene.ts` + `boardTile*.ts` change set a two-wave mix).

## API recap

```
bakeBoardTiles(input, surfaceFactory) -> { canvas, width, height, pixelWidth, pixelHeight,
                                           scale, originX, originY, boardWidth, boardHeight,
                                           style, hash, stats }
createBoardTileBakeCache().bake(input, factory) -> { result, rebuilt }
drawBoardMarkers(ctx, { style, tileSize, devicePixelRatio, originX, originY,
                        start, goal, player, phase, reducedMotion })
slotBlocker / slotGate / slotPatrol(ctx|null, { cell, tileSize, devicePixelRatio, ... })  // draw nothing
resolveBoardTileStyleId(value), DEFAULT_BOARD_TILE_STYLE = 'chip'
```

`input.grid[y][x]` is true for floor. The scene derives it from `this.maze` (floor cells), the
tile size from `resolveLegacyMazeRenderFrame(...).tileSize`, DPR from the scene's capped
backing scale, and docks from the existing wrap/bleed topology (cell on the board edge plus
side; `lengthPx` optional). Place the baked canvas at `mazeLeft - originX`, `mazeTop - originY`.

## Call sites to replace (MenuScene.ts at base 1670c8af)

| # | Current code | Line(s) | Replacement |
|---|---|---|---|
| 1 | `drawBoardPaths(time)` call, dirty-flag gated by `boardPathDirty` | call at 4210, definition 8833 | Keep the dirty gating and the method name (tests pin it). Inside, replace the per-tile `drawPathPoint` loop (8865 `drawLegacyPathMaterialTile`, 8882 `drawLegacyPathBorderDock`) with one cache lookup plus one blit of the baked canvas. The menu reveal order (`menuStaticDrawTileOrder`, `resolveLegacyMenuStaticDrawTileLimit`) makes the static build progressive: the bake must either be re-run per reveal step (hash changes, rebuild each step) or the reveal must clip the baked canvas. Decide in the wiring packet; this is the largest open design point. |
| 2 | Floor `TileSprite` + `GeometryMask` | creation 2612-2617 (`boardFloorTileSprite`, `boardFloorMaskGraphics`); per-frame reposition 8851-8863; mask fill via 8880 | Remove from the board path. The chip style has no floor texture. Keep the BootScene texture generator untouched (`BootScene.ts` is Wave 4D-A and its tests pin it); simply stop creating the sprite, or keep it hidden. |
| 3 | Play-mode wall pass: `fillStyle(LEGACY_PLAY_WALL_FILL, LEGACY_PLAY_WALL_GLASS_ALPHA)` over every cell | about 8223-8232 (inside the static board draw, `if (!isMenuMode)`) | The bake draws wall sockets only; the play wall tint stays unless the visual proof shows it muddies the chip. Prefer to leave it and revisit after capture. |
| 4 | Docks: `drawLegacyPathBorderDock` and `drawLegacyPathBorderDockFacet` | 8483, 8581; callers 8882, 11817 (dynamic trail dock) | Static docks come from the bake (`docks` input). The dynamic trail dock at 11817 draws trail over the dock and is not part of the bake; keep it, re-aim it at the new dock geometry (`BoardTileLayout.docks`). |
| 5 | Start marker | `drawLegacyEndpointGlow` 11925 (called 11916, 13603), non-goal branch | `drawBoardMarkers({ start })` onto `boardDynamicGraphics`' canvas layer, or a small dedicated marker canvas |
| 6 | Goal marker | `drawLegacyGoalStarMarker` 12017, canvas halo `drawGoalHaloCanvas` 12160 | `drawBoardMarkers({ goal, phase, reducedMotion })`. Keep the Options/Guide legend icon branch (`graphics !== boardDynamicGraphics`) untouched. |
| 7 | Player marker | `fillLegacyPlayerMarkerTile` 12221 (callers 10349 menu, 10357 play), metrics via `resolveLegacyPlayerMarkerRenderMetrics` | `drawBoardMarkers({ player })` with the interpolated fractional cell; squash/stretch motion stays in the scene (it is animation, not tile style) |
| 8 | Title cells and Guide icons that reuse `drawLegacyPathMaterialTile` | 9175, 10679, 11851, 13650 | Out of scope for the first wiring step: they keep the old material and will look different from the new corridor. Include in the visual proof as a known inconsistency, or migrate in a follow-up. |

Do not touch: `src/render/navigationCore*.ts`, `BootScene.ts`, `src/render/boardRenderer.ts`
(dead code), token sources (`docs/contracts/mazer-ui-rework-design-tokens.v1.json`,
`tokens.css`, `src/theme/tokens.*`).

## Tests that pin the current call sites (from grep at base 1670c8af)

These are source-text assertions on `MenuScene.ts`; a wiring change that renames or removes
the pinned text must update the test in the same PR with the reason recorded.

`tests/scenes/menu-render-frame.test.ts`
- 704-706, 748-753, 854-856, 869-870, 945, 1031: path core/edge constants and
  `isMenuMode ? pathGlow : LEGACY_PLAY_PATH_EDGE` (keep or update together with the material)
- 737, 743, 874, 943, 2426: `private drawLegacyPathMaterialTile(` / `drawLegacyPathTileFacet(` / calls
- 756, 857-858: play wall pass and `LEGACY_PLAY_WALL_FILL` / `LEGACY_PLAY_WALL_GLASS_ALPHA`
- 938, 942: `this.drawBoardPaths(time);` and the method signature
- 1024: `this.drawLegacyPathBorderDock(`
- 1034, 1126, 1128: `fillLegacyPlayerMarkerTile(...)` call shape; 1042, 1150: `resolveLegacyPlayerMarkerRenderMetrics`
- 1125: `private drawLegacyEndpointGlow(`
- 1586: comment-referenced cog blink inside `drawBoardPaths`
- 2694, 2706: `drawLegacyGoalStarMarker` canvas-halo branch scoped to `boardDynamicGraphics`; legend icon branch unchanged
- 2799: method-name list including `drawBoardPaths`, `drawDynamicBoard`

`tests/reset/legacy-reset.test.ts`
- 915: `private drawBoardPaths(time: number): void` (and the neighbouring lines 905-925 for
  `boardPathGraphics`, `boardPathDirty`, tile-limit loop)
- 965: `private drawLegacyPathMaterialTile(`

`tests/reset/boot-floor-texture.test.ts`
- 137, 147: `floorTileTextureKey` selection and `boardFloorTileSprite.setVisible(false)` fallback.
  Removing the sprite (call site 2) requires rewriting these two assertions; the BootScene
  generator tests (lines 42-130) stay valid as long as `BootScene.ts` is untouched.

`tests/reset/legacy-iridescent-material.test.ts`: no `MenuScene` source assertions found by grep (0 matches).

`tests/render/*`: `boardRenderer.test.ts` covers the dead `boardRenderer.ts` (unaffected);
`navigationCore*.test.ts` cover the frozen trail/glow modules (unaffected); `palette.test.ts`,
`cyber-arcade-material.test.ts` pin tokens (unaffected: no token file is edited).
New: `tests/render/boardTileBake.test.ts`, `tests/render/boardTileStyle.test.ts`.

`tests/architecture/design-tokens-contract.test.ts` and `decision-registry-contract.test.ts`
read the token/registry JSON and the live git diff; re-run them in the wiring PR.

## Rollout shape

1. Step 1, flagged: add a board-style setting or URL parameter (`resolveBoardTileStyleId`);
   `legacy` (current material) stays available as the default until the owner has seen chip
   and trace in the real game. Keeping `legacy` means the pinned MenuScene text can stay in
   place, with the new path added beside it.
2. Step 2, after the owner picks: flip the default, retire the legacy path, update the pinned
   tests, and record approval in the amendment doc.
3. Trail underlay or lift (amendment open item A8) lands in the same wiring packet, since the
   trail is drawn above the new floor.

## Visual proof plan (before/after)

Matrix: 390x844 at DPR 2 and DPR 3; 1280x720 at DPR 1. For each, before (current `main`)
and after (chip, then trace):

1. Level 1 straight corridor, saved progress reset, and a check that the progression label
   reads correctly (the board redesign must not change the label or level number).
2. Braided 25x51 maze (menu and play modes), player mid-maze with a trail.
3. Wrap-dock maze with left, right, top and bottom docks.
4. 100% crops of a junction, a dead end, a corner and a dock; colour-vision simulations
   (protanopia, deuteranopia, tritanopia, luminance only) of the maze with markers.

Existing capture tooling (not run here): `npm run visual:capture`, `visual:matrix`,
`visual:proof`, `visual:gate` (scripts under `scripts/visual/`); exact flags and viewport
presets must be confirmed against those scripts at wiring time (UNKNOWN today). Pass
criteria are the amendment's acceptance matrix A1-A10.

## Sequencing

1. This packet (modules, tests, amendment draft, this plan) merges independently: it touches
   no protected path and no scene.
2. Graphics lane (MenuScene intro/edge-diamond rewrite) merges.
3. Registry decision for the new files (amendment doc), then the wiring PR rebased on the
   graphics lane, flagged per "Rollout shape".
4. Owner reviews chip and trace in the real game; approval recorded; default flipped.
5. Follow-ups: title/Guide icon material, hazard grammar built on the reserved slots,
   trail underlay tuning, real-device frame-time check.
