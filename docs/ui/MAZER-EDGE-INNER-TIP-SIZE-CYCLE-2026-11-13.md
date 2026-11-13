# Edge diamonds: beams on the inner tip, a 50% / 100% size cycle, beams that stay connected (MAZER-VIS-038)

Status: implemented 2026-11-13 on branch `claude/vis-038-20261113`, on top of MAZER-VIS-030 (`docs/ui/MAZER-EDGE-BEAMS-DIAMOND-FILL-2026-11-12.md`) and MAZER-VIS-033 (`docs/ui/MAZER-EDGE-DIAMOND-ONE-FILL-2026-11-13.md`). Source, unit, pixel and headless-Chromium evidence only; NOT checked on a real phone.

Owner request (verbatim): "lasers need to connect to the inner most corner/point of the diamonds to the maze and shoot out from there too, we could have them smoothly shrink to half their size while the maze is running, then when player hits the end tile have them smoothly grow back to normal size just before the lasers shoot out and connect and fill them then right after the lasers shoot out and the inner color is all drained shrink them. also make sure the lasers continue to shoot into and out of the diamonds until they are fully drained or filled."

What stays as shipped: the one fill (inner tip toward outer tip) and the drain (outer tip first, last of it exits at the inner tip) from VIS-030 / VIS-033, the head flight, the landing, the input unlock (build end + 400 ms), every duration of the intro and the outro, the board size and zoom, the dark neon look, tile style B. Nothing in `registry`, `exports/**`, `docs/current-truth.md` or `package.json` is touched.

## 1. Beam endpoints: the inner tip

Before (VIS-030): each beam ended on the diamond OUTLINE at the point where the line from the diamond centre toward the player / spawn tile crosses the kite (`resolveOutlineExitPoint`). That point moves with the focus, and with the kite scaled it would drift.

Now: both directions (player to diamond on departure, diamond to spawn tile on arrival) start / end on the diamond's INNERMOST point, the tip that faces the board: `resolveEdgeInnerTip(station)` = centre + 10 px along the inward axis, which is vertex 0 of the kite at full size. Corner diamonds (diagonal axis) use their own tip. The point is snapped to the centre of a device pixel by the existing `snapToDevice` (so the line end is within half a device pixel of the tip on each axis, at every DPR). `resolveOutlineExitPoint` is deleted (nothing else used it).

Caveat, by geometry: a path from the tip into the board leaves the kite's tip wedge (half-angle atan(7/8) = 41 degrees, opening toward the outer tip) for every focus on the board except one: a player standing within about 10 px of a left/right diamond's axis and OUTSIDE its inner tip (the outermost column on the middle row on a phone, where the board runs under the diamond). The beam then runs through the kite body to its tip. Documented, not special-cased (the diamond is only 10 px long at rest size). A test pins the rest of the board.

## 2. Size cycle (`edgeBeamTimeline.ts`, closed form, pure)

`EDGE_DIAMOND_REST_SCALE` = 0.5 is the size of a diamond while the maze runs (and at rest in the menu too). The scale is applied ABOUT THE INNER TIP (`anchorStationToInnerTip`): the kite's centre slides along its axis so vertex 0 never moves; the outer tip pulls away from the screen edge. So the beam attach point does not move and a 50% kite always lies inside the full-size one (it cannot clip where the full one did not).

Clock `c` is the master laser clock (ms). Per diamond `i`, with `contactMs_i` / `launchMs_i` from `resolveBeamTimes`:

| Phase | Size | Exact rule |
| --- | --- | --- |
| Maze running (play, menu demo) | 50% | `lifecycle === null` |
| Goal reached, departure, `0 <= c <= contactMs_i` (302 .. 400 ms) | 50% to 100%, smoothstep | `0.5 + 0.5 * smoothstep(c / contactMs_i)`; exactly 100% at beam contact, monotonic, continuous |
| Departure after contact, the dissolve, the orbit, the build | 100% | held; the beam is attached the whole time the diamond fills |
| Cold start (no deconstruct before the build) | 50% to 100% with the ring charge | `0.5 + 0.5 * ringFill` (the intro charges the ring over its first 400 ms, so it is 100% when full) |
| Arrival, `launchMs_i <= c <= launchMs_i + 200` | 100% | the diamond is draining; it does not shrink until it is empty |
| Arrival, `drainEndMs_i <= c <= drainEndMs_i + 300` | 100% to 50%, smoothstep | `1 - 0.5 * smoothstep((c - drainEndMs_i) / 300)`; per diamond, as soon as THAT diamond is empty |
| After | 50% | the last shrink ends at `c = 598 ms`, before the intro is done (750 ms), so the rest state has no pop |

Grow-window finding: the grow finishes exactly at the beam contact and runs over the head flight itself, which starts at the goal (c = 0). That already fits "just before the lasers connect", so NO gameplay time moves: the input unlock stays at build end + 400 ms, the intro and outro totals are unchanged. If the owner wants the diamonds to finish growing BEFORE any beam leaves the player (grow, then shoot), that needs a delay of about 300 ms between the goal and the beam launch in the deconstruct, which would lengthen every level change; not done, proposed only.

## 3. Continuous beam (`edgeBeamTimeline.ts`, `edgeBeamArt.ts`)

Before: a beam was a rigid packet, the tail 200 ms behind the head on the same flight curve. The tail let go of the player while the diamond was still filling (and drained outgoing diamonds from a tail that had already left).

Now a beam has a HEAD (the shipped flight, unchanged) and a TAIL that HOLDS at its source until the fill / drain it feeds is complete, then retracts to its sink:

- Departure (player to diamond): head contacts the tip at `contactMs`; the tail stays on the player until the fill is exactly 100% (`fillEndMs = contactMs + 200`), then runs in over `EDGE_BEAM_RETRACT_MS` = 120 ms (`tailArrivesMs`, the beam is gone; 600 + 120 = 720 ms for the last diamond).
- Arrival (diamond to spawn): head leaves the tip at `launchMs`; the tail stays on the tip until the drain is exactly 0% (`drainEndMs = launchMs + 200`), then runs to the spawn tile and never ahead of the head (a test samples every ms); every beam is gone by `inwardGoneMs <= 418 ms`.

`resolveBeamTail(direction, clock, index)` replaces the old lagging tail; `resolveEdgeBeamPulse` also reports `connected` (tail still held). `OUTRO_RING_ORBIT_START_MS` is derived as `OUTRO_LASER_MS + INTRO_BEAM_PULSE_MS + INTRO_BEAM_RETRACT_MS` = 720 ms (it was 600): the ring must not orbit while a beam is attached to a tip. The orbit still ends with the outro, so no total duration moves.

Art (`drawBeamPulse`): a steady stream between the two ends: a soft bloom (two wide low-alpha strokes), a body whose alpha ramps up toward the head, bright dashes that FLOW tail to head at 260 px/s (so the beam visibly keeps flowing while attached; at most 8 dashes), a pulsing head, and, while an outgoing beam is still attached to its diamond, a pulsing port glow on the tip. A thin contact ripple runs over the fill / drain window as before. Crisp: line ends snap to a device pixel centre, widths to whole device pixels. Layer counts were cut for the cost budget: body 14 to 5, bloom 8 to 3 (per width), ripple 20 to 14 segments, hot lead removed (the dashes replace it).

One fill only is untouched: the interior is the VIS-033 fill (`resolveDiamondFillShape`), now drawn for the scaled kite (`halfHeight * scale`, centre anchored on the tip).

## 4. Reduce Motion

Decision: fixed 50% (the same size the maze runs at). No size animation, no travelling beam, no pulse, no orbit; the 200 ms crossfade of the fill and drain is kept; the border colour keeps following the trail colour. Why 50% and not 100%: it is the rest size in full motion too, so the ring does not change size when the setting is toggled, and 50% is the smaller footprint on the screen edge. `resolveEdgeRingScales` returns 50% for a null lifecycle and for the crossfade lifecycle.

## 5. Corner diamonds and the two-bottom-diamonds report (OPEN, unchanged)

The owner has not sent a screenshot. With the 50% rest size the outer tip of every diamond, corner kites included, sits 10 px further from the screen edge (a kite shrinks toward its inner tip, which stays put), so a rounded display corner clips a smaller share than before. The board layout, zoom and the station layout are not changed (frozen). The VIS-033 note (rounded corners are the strongest candidate, not observed on a device) stands and still needs one device check.

## 6. Guide

No wording or icon change: the Wrap row ("Some mazes wrap around open edges. Trail-coloured edge diamonds fill as beams hit.", 82 characters) is still true and the Guide icon is the same `drawEdgeMarker` at full size, 60% filled (the standalone icon keeps scale 1; only the board passes `scales`). The drift test is unchanged and green.

## Cost

Headless Chromium on a busy shared machine (other workers were running), so the numbers are indicative, not a phone. The real game, a real goal-reach, a manual 16 ms clock; for every frame in which a beam is on screen (departure plus arrival, 70 frames after, 74 before) it times the scene's `drawLegacyEdgeLasers` (builds the 8 beams and, through it, the 8 markers), Phaser's canvas replay of the two Graphics (`spawnLaserGraphics`, `edgeMarkerGraphics` `renderCanvas`), and counts the Graphics commands of both; Chrome DevTools CPU throttle 1x and 4x, 2 runs averaged. "Before" is main `4f140383` on a second port.

| Viewport | CPU | Build (ms) before / after | Canvas replay (ms) before / after | Graphics commands before / after |
| --- | --- | --- | --- | --- |
| 390x844 @2.625 | 1x | 0.149 / 0.179 | 0.157 / 0.143 | 2642 / 1567 |
| 390x844 @2.625 | 4x | 1.127 / 1.419 | 1.310 / 1.680 | 2642 / 1564 |
| 1280x720 @2 | 1x | 0.125 / 0.161 | 0.160 / 0.149 | 2642 / 1625 |
| 1280x720 @2 | 4x | 1.082 / 0.819 | 1.478 / 0.803 | 2642 / 1625 |

The draw-call budget is down about 40 % (2642 to about 1600 commands per beam-active frame): the lever is the layer counts, now small constants in `edgeBeamArt.ts` (`BEAM_BODY_LAYERS` 5, `BEAM_BLOOM_LAYERS` 3, `BEAM_STREAM_MAX_DASHES` 8). Time is a wash inside the noise of a shared machine and 2 runs: build + replay is 0.31 ms before and 0.32 ms after at 1x on the phone profile, and 2.4 ms before and 3.1 ms after at 4x (desktop profile: 2.6 ms before, 1.6 ms after). The stream dashes cost trig and a few strokes, which is why fewer commands did not give a proportional time drop. Either way it is a small share of a 16.7 ms frame, paid only inside the about 1.1 s per level change in which a beam exists; outside it there is no lifecycle and no redraw. No new layer, no board redraw.

## Evidence (headless Chromium, the real game, a real goal-reach on a controlled near-goal fixture, manual 16 ms clock; not a real phone)

`docs/ui/evidence/2026-11-13-edge-inner-tip-size-cycle/`: `before-*` is main `4f140383`, `after-*` is this branch, each at 390x844 (DPR 2.625) and 1280x720 (DPR 2), full motion and Reduce Motion:

- `*-departure-strip.png`: three diamonds (right-middle, left-middle, top-left corner), crops of 120 css px around each tip, at laser clocks 0, 100, 200, 300, 380, 420, 500, 600, 680, 760 ms. After: 50% at the goal, growing, exactly full as the beam touches the inner tip, the beam attached (tail on the player) while the diamond fills, retracting after the fill, then the ring orbits.
- `*-arrival-strip.png`: the same diamonds at -200, 0, 60, 120, 200, 260, 320, 420, 520, 700 ms of the arrival clock: full through the build, beams leaving from the inner tip, the beam attached to the tip while the diamond drains (colour leaves outer tip first), the tail then leaves, each empty diamond shrinks back to 50%.
- `*-departure-full.png` / `*-arrival-full.png`: full-screen key moments. `*-rest-play.png`: the play screen at rest.
- `*-reduced-motion-*`: fixed 50% size, no beam, 200 ms crossfade, border colour still shifting.
- The strips are one canvas read per manual frame, so a column is the first frame at or after its label.

## Verification

`npx tsc --noEmit`; `tests/render/edgeBeamTimeline.test.ts` (tail holds / retracts, `connected` for the whole fill and drain, tail never ahead of the head, size cycle monotonic per segment, continuous, 100% at contact, 50% at rest, per-diamond shrink, cold start, seams); `tests/render/edgeMarkers.test.ts` (endpoints are the inner tip, anchoring, reduced-motion size, scene wiring, orbit start 720); `tests/render/edgeBeamPixels.test.ts` (per DPR 1 / 2 / 2.625 / 3: both beam directions end on the tip pixel, the recorded line ends equal the snapped tip, the tip does not move at 50%, the fill stays inside the 50% outline and anchored on the tip, plus every VIS-033 fill check); `scripts/analysis/verify-gameplay-teleport-transfer.mjs` (updated to this contract, real built game, manual clock: beams on the inner tip and attached for the whole fill / drain, kite length 10 / 20 / 10 px per phase, fixed 50% in Reduce Motion).

## Not checked

A real phone (touch device, real GPU, real corner radius, home-screen or browser mode); Safari / WebKit; 120 Hz displays; a real-time review of the motion by the owner (frame strips and tests only); the player standing on the outermost column on a diamond's axis (the documented beam-through-kite case) was not looked at in a browser.

## Wave ownership

`MenuScene.ts` (Wave 5C): one import and one `scales:` argument. New logic stays in `src/render/edgeBeamTimeline.ts`, `edgeBeamArt.ts`, `edgeMarkers.ts`, `introTimeline.ts` (a constant and the derived orbit start). No `package.json`, registry, `exports/**` or `docs/current-truth.md` change.
