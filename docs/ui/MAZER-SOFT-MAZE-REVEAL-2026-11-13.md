# Soft maze build-in / build-out (MAZER-VIS-040)

Status: implemented 2026-11-13 on branch `claude/mazer-vis-040-20261113`, on top of main `9fd0e890`. Source, unit, pixel and headless-Chromium evidence only (phone emulation, fake 60 fps clock); NOT checked on a real phone.

Owner request (verbatim): "lwk everything in the maze kinda just appears part by part is there a way to draw everything out smoother?"

## UPDATE 2026-11-15 (MAZER-MOTION-020): the alpha ramp below is replaced by a geometric "flow"

Owner: "I hate the current fade in / fade out ... I think we can do better." Sections 2, 3 and 4 describe the VIS-040 alpha ramp and are kept as history. What ships now (render only; `src/render/mazeRevealTimeline.ts`, `boardRevealMask.ts`, `boardTileLayer.ts`, `mazeRevealDriver.ts`):

- Build: the maze is drawn by extent, not opacity. Every floor cell has an extent 0..1. The baked board is drawn ONCE at alpha 1 through one clip path: fully shown cells (row runs merged) plus one rect per partial cell. A partial cell is the slice that starts at the side its BFS parent is on (left / right / above / below), so a corridor extrudes out of the one before it; the spawn cell, walls and the pad ring open from their centre. Edges are device-snapped.
- One cell wipes for exactly one rank step (`span / N`), linear. A cell's BFS parent always has a lower rank, so a cell starts only when its parent is whole: the drawn line has no gap at any instant on any maze, and the tip moves at constant speed (an eased or longer wipe left gaps and a ladder at the tip, seen in the first filmstrips).
- Tear-down is the build run backwards in time with the same rank: `deconstruct(rank, t) == build(rank, span - t)`, so the far end retracts first and the spawn cell leaves last. Same windows as before.
- Walls and the pad ring open only once the LEAST built floor cell around them is past 60 % (and close as soon as the first one starts to go). The baked wall cell holds the outer glow of every corridor beside it, so this is what stops the faint halo of a not-yet-built corridor showing ahead of its fill.
- The "thin white 1px line before the fill" (VIS-050 leftover) was the pale rim of the first low-alpha cells showing before their dark fill (a chip is rim plus fill; low alpha shows the rim first). No cell is drawn at partial alpha any more, so rim and fill arrive together. Opacity is not used by the board reveal at all.
- Wrap docks slide out of the board edge over `MAZE_DOCK_FADE_MS` (200 ms, easeOutCubic) instead of fading.
- Cost: one clip plus one `drawImage` per recompose (was up to 16 draws). The bake is unchanged, so `BOARD_TILE_BAKE_VERSION` stays v3. Timing is unchanged: windows, input unlock, beams, totals and the strict 0/1 edge-path switch.
- Reduce Motion (MOTION-020): the maze appears and disappears instantly, no fade and no movement (`resolveMazeRevealFrame` and `resolveReducedBoardFade` both return null).
- No separate leading-edge glint: a bright 1px tip is exactly the "thin white line" the owner rejected, and the crisp sliced edge of a whole chip already reads as the front.
- Evidence: `scripts/analysis/capture-maze-motion-filmstrip.mjs` (filmstrips and native-pixel zoom crops at fixed times, Chromium 390x844 DPR3 and WebKit iPhone 15 Pro). Headless only; nothing was checked on a real phone. The gap between tear-down end and the next build (digit interstitial) is lifecycle timing, outside this change.

What stays as shipped (VIS-040 list): board size and zoom, tile style B "Chip", the dark neon look, every duration of the intro and the outro, the input unlock (build end + 400 ms), the maze generation (determinism untouched: only the order-to-alpha mapping changed, the order itself is the same BFS), the edge diamond / beam timelines and art (another lane), the strict 0/1 `bleedProgress` edge-path switch, the Guide (no wording or icon change).

## 1. What popped (measured before the change; VIS-040 history)

Per-frame captures at 60 fps of virtual time (`scripts/analysis/measure-maze-reveal-pop.mjs`, Playwright, 390x844 at DPR 3, touch, mobile UA, standalone display-mode; a fake clock stepped 16 ms per frame so every frame is sampled and slow recorders do not change the timing). Level 40 (a real maze) via `?previewLevel=40`.

| What | How it popped (before) |
| --- | --- |
| Floor and walls | The reveal was a hard rank mask: `tilesVisible` counts BFS ranks and every frame 1 to 5 cells (about 200 per second) went from alpha 0 to alpha 1. 195 of 259 frames carried at least one pixel that jumped by 96/255 or more inside the maze layer; the largest single-pixel jump was 231/255. |
| Wrap docks | The edge-path switch is atomic: all docks and their border cells appeared in ONE frame at the build end (the largest single-frame change of the whole build, 0.56 % of the layer area at full strength) and vanished in one frame 400 ms into the deconstruct. |
| Start / goal markers | `markersBuiltIn` snapped them from alpha 0 to 0.9 / 0.95 the instant the beams landed. |
| Bake / composite | The full board composite was already redrawn per reveal step (clip + one drawImage + erase); no bake swap or time-sliced generation shows in the frames (the bake runs once per maze, before the first frame of the build). Not the cause. |
| Not touched | The level digit (smootherstep), the trail (250 ms linear fade, continuous), the player (150 ms fade, 350 ms spawn pop), the diamonds and beams (another lane). |

## 2. The design

One closed-form timeline for the whole maze (`src/render/mazeRevealTimeline.ts`, pure, unit tested), driven by the SAME windows as `introTimeline.ts`:

- Every floor cell with BFS rank `r` of `N` has its own eased fade of `MAZE_REVEAL_RAMP_MS` (= `MOTION_DURATION_MS.reveal`, 700 ms). Build: `alpha = smoothstep((t - (start + (span - ramp) * r/(N-1))) / ramp)`; the first cell starts at the build start (100 ms), the LAST cell finishes exactly at the build end, so the beams still fire on a finished maze. Deconstruct: the mirror (far end first, spawn tile last), empty exactly at the tiles-gone instant.
- The front is therefore a soft band about a quarter of the maze wide instead of one tile wide, and no cell changes by more than 3.6 % of full alpha per 60 fps frame (a unit test samples every frame for N up to 4000).
- Wall sockets and the rim glow ride the corridor they belong to: a wall's alpha is the largest alpha among the floor cells around it (the old "grow the clip by one tile").
- Wrap docks (and the border cells that own one) fade over `MAZE_DOCK_FADE_MS` (200 ms): in after the build end, out ending exactly at the 400 ms edge-path switch. The strict 0/1 switch itself is unchanged (trail, bleed glow and dock logic still key off it).
- Start / goal markers fade in over the beam flight (400 ms) through the existing alpha argument only (`0.9 * markerDeconstructAlpha * markerRevealAlpha`); their drawing is untouched.
- Reduce Motion: no front, no dock fade, no board crossfade (MOTION-020: instant appear / disappear; reduced motion never changes colour and stops movement).

## 3. How it is drawn without a per-frame redraw of the board art

`src/render/boardRevealMask.ts` writes one alpha value per cell (floors: their own; walls and the pad ring: the largest alpha of the floor cells around them) into a `(cols + 2) x (rows + 2)` byte grid (27 x 53 on the phone board). The board layer (`composeBoardTileRevealSoft`, `boardTileLayer.ts`) buckets the cells by that alpha rounded to 1/16 and draws the baked board ONCE PER BUCKET through a clip of the cells in it (row runs merged into rects): at most 16 `drawImage` calls per recompose whatever the maze size, never one per tile, no new bake, no new layer, the board art is never redrawn cell by cell. Cell edges are device-snapped, so adjacent buckets leave no antialiasing seam; the Image position stays a whole css px (pixel-alignment rules unchanged). The composite is skipped when the frame key did not change.

Rejected first version: scaling the cell grid over the whole board with bilinear smoothing and a `destination-in` pass (smoother between cells). It was correct but doubled the render cost in headless software raster (a full-frame compositing pass: 13-17 ms to 30-45 ms per reveal frame at 390x844 DPR 3), so it was replaced by the bucket draw, whose cost is at parity.

Thin call sites in `MenuScene.ts` (Wave 5C hot file): one `mazeReveal.update(...)` next to the lifecycle stage, one `mazeReveal.resolveBoardReveal(...)` + crossfade fallback in `resolveBoardTileReveal`, the layer `alpha`, and the marker alpha factor. Everything else lives in `src/render/mazeReveal*.ts` and `boardRevealMask.ts`.

Reduce Motion note: `introTimeline.ts` already computed a 200 ms `boardAlpha` crossfade but nothing applied it, so at that setting the board used to cut out in one frame (a 22 % of the layer pop on the deconstruct) and cut in at the next intro. The board Image now carries that crossfade (`resolveReducedBoardFade`, one Image alpha, no recompose). No wavefront moves at that setting.

## 4. Measured (390x844 at DPR 3 unless noted, level 40, headless Chromium, fake 60 fps clock)

Pop metric = pixels of the baked maze layer that change by 96/255 or more between two consecutive frames (a hard pop); "pop frame" = more than 0.15 % of the layer area does so in one frame. Raw numbers: `docs/ui/evidence/vis-040/summary.json`; the recorder is `scripts/analysis/measure-maze-reveal-pop.mjs`.

| Scenario | Frames with any hard pixel pop (before / after) | Pop frames > 0.15 % (before / after) | Largest single-pixel jump of one frame (before / after) |
| --- | --- | --- | --- |
| Level start 390 | 201 / 0 | 1 / 0 | 231 / 29 |
| Level change 390 (deconstruct + build) | 390 / 0 | 38 / 0 | 231 / 29 |
| Level start 360x740 @2.625 | 201 / 0 | 1 / 0 | 231 / 32 |
| Level start 412x915 @2.625 | 201 / 0 | 1 / 0 | 231 / 34 |
| Level start desktop 1280x720 | 201 / 0 | 1 / 0 | 231 / 29 |
| Level change desktop | 389 / 0 | 96 / 0 | 231 / 29 |
| Level start 390, Reduce Motion | 0 / 0 | 0 / 0 | 0 / 20 (the 200 ms crossfade, a small step per frame) |
| Level change 390, Reduce Motion | 2 / 0 | 2 / 0 | 231 / 19 (the board used to cut out in one frame: 22 % of the layer) |

Whole-screen numbers stay noisy in both versions (the level digit's rainbow, the orbiting diamonds and the player's iridescent core change by more than 96/255 on their own: those are not the maze and not this lane); the maze layer alone is the metric.

Cost (real clock, no recorder, JS cost of scene update + Phaser render per frame, mean over the build; headless software raster, this machine, other work running, so +-15 % is noise): 390 DPR 3 CPU 1x 15.3 / 11.6 ms, CPU 4x 176 / 93 ms (6 / 9 frames only), change 11.5 / 9.1 ms, desktop 8.1 / 8.4 ms, 412 DPR 2.625 17.7 / 18.8 ms. Parity, no regression; the first (bilinear mask) version measured 33 ms and was rejected.

## 5. Not done / open

- Real phone: nothing here was checked on a device (headless only).
- No scale ramp of the tiles (alpha only); the front glow is not added (the soft ramp already reads as a wavefront and every extra pass costs render time).
- The level digit, the trail, the player and the diamonds are untouched.

MOTION-020 update: the 200 ms reduced-motion board crossfade described above was removed; at that setting the board is drawn at alpha 1 from the first build frame and hidden from the first tear-down frame. Non-reduced behaviour is unchanged.
