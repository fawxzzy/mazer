# End markers without a box, start arrow, visible trail shift, diamonds tied to trail and player

Status: implemented 2026-11-10 on branch `claude/mazer-startgoal-trail-20261110`, after the owner looked at the live PR #402 board. Source and headless-browser evidence only; not checked on a real phone.

## What changed and why

| Ask | Change | Where |
| --- | --- | --- |
| A visible square / rounded-square box sits behind the goal star and the start play marker | The pad (tinted tile silhouette), the dark disc and the lit ring are removed. The star and the arrow sit directly on the baked Chip tile. A thin dark keyline traced around the glyph keeps it legible (goal red is about 1.8:1 on the bare chip, above 3:1 on the keyline; start gold is above 3:1 on the chip alone). | `src/render/endpointTiles.ts`, `drawEndpointGlyph` in `src/render/boardTileBake.ts`, `BOARD_TILE_GEOMETRY.endpoint` |
| The start arrow should point the way the player will move | `resolveStartDirection` takes the first step of the real wrap-aware shortest path (the single open side when there is one). The layer stores it on `endpointTiles.start.direction` per rebake. The Guide icon (no board) points right. | `src/render/startDirection.ts`, `src/render/boardTileLayer.ts` |
| The trail colour shift is too subtle | Shorter and faster sweep (8 tiles, 3.6 s) plus a travelling sheen band that also refracts the hue. Stops unchanged, so the contrast floor is unchanged. Reduced motion stops the sheen band and swell but the hue still shifts with time (MAZER-MOTION-004). | `src/render/trailPalette.ts` |
| The edge diamond border must always match the trail | Border = trail core colour at the trail head on the trail's own clock. | `src/render/edgeMarkers.ts` + `trailPaletteHead` in MenuScene |
| The colour inside the diamonds when the player shoots out must equal the player colour | Lit core, beams and landing sparkles = `PLAYER_COLOR`; `boardMaterial.player` reads the same constant. | `src/render/trailPalette.ts`, `edgeMarkers.ts`, `boardTileStyle.ts` |

## Single source of truth

`src/render/trailPalette.ts` owns `PLAYER_COLOR`, the stops, the sweep and sheen constants and `sampleIridescentTrail`. `trailIridescence.ts` (breath, widths) re-exports it. The trail (MenuScene), the Guide trail legend and the edge diamonds all read it, and `tests/render/edgeMarkers.test.ts` asserts every diamond border equals `sampleIridescentTrail(...).core` at the trail head for a grid of times and distances.

## Palette numbers (pinned by `tests/reset/trail-iridescence.test.ts`)

- Worst hue against the bare chip fill: 3.26:1 (unchanged; the lifts only mix toward white). At least 4.5:1 under the dark underlay on every floor.
- Hue sweep: 8 tiles per out-and-back loop, 3.6 s at a fixed point. Sheen: 9 tiles apart, 1.5 s per spacing, ridge = raised cosine to the fifth power, core lift up to 0.55 toward white, hue refracted 0.2 of a sweep ahead. Slow swell: lift 0.2.
- Reduced motion: no sheen, constant swell level; the hue sweep keeps following the colour clock (owner rule, 2026-11-12: reduced motion stops movement and pulsing, never colour).
- Trail Shine off: no time term, no sheen, constant swell level (a fully static trail, the player's own choice).
- Sampling cost: about 0.28 ms per 1000-segment frame in node (`TRAIL_PALETTE_SAMPLE_COST`); the live trail draw is measured in the PR (headless Chromium, 33 ms budget).

## Guide

Start: "An arrow on the first tile points the way you set off." Trail: "A shimmering, colour-shifting line is your route. {Trail Fade} in Settings fades old trail." Wrap: "Some mazes wrap around open edges. The edge diamonds glow in your trail colours." The Start and Wrap icons call the same draw functions as the board.

## Evidence (headless Chromium, `?previewLevel=N`, real game, not a real phone)

In `docs/ui/evidence/2026-11-10-end-markers-trail/`: `endpoints-before-after.png` (start and goal, phone tile 14.7 px at DPR 3 and desktop tile 25 px at DPR 2, levels 1 and 20, before = PR #402 main, after = this change), `start-arrow-directions.png` (all four directions from the real game: down, right, up, left), `trail-frame-strip-phone-L1.png` and `trail-frame-strip-desktop-L20.png` (six real frames 0.25 s apart, before above after; the diamond at the top of the phone strip changes colour with the trail). Trail draw cost on the live scene, headless (4 browsers in parallel, so the frame interval is not meaningful): phone L1 45-tile trail mean 1.12 ms (p95 1.8, max 2.5) vs 0.98 ms before; desktop L20 70-step trail mean 2.64 ms (p95 4.2, max 5.3) vs 2.40 ms before; the 33 ms trail cadence budget is not threatened. Reduced motion: two frames 1.5 s apart are pixel-identical.

## Wave ownership

`MenuScene.ts` (Wave 5C) is touched for three small things: the trail head record, the diamond feed and the pad removal at the marker call site. Everything else is a new module or an unowned file. No Wave 4D-A, 4D-B, 1B or 5B path changed.
