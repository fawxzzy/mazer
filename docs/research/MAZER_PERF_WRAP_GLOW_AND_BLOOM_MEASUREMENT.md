# Mazer perf measurements: wrap-glow redraw (MAZER-PERF-007) and trail bloom cost (MAZER-PERF-005)

Measured 2026-11-12 on `origin/main` 9eaa079c (before) and the MAZER-PERF-007 branch (after), headless Chromium (Playwright,
software-rendered, Windows host), Vite dev server (unminified modules), `?previewLevel=30&runtimeDiagnostics=1` (a wrap level:
2 horizontal and 2 vertical wrap endpoints). Headless Chromium on a desktop host is a proxy, not a phone: nothing here was
checked on a real device. CPU throttle 4x on this host drops the game to 0.5 to 5 frames a second even before the change, so the
4x rows are frame-bound and noisy; they show no change and prove nothing either way.

## MAZER-PERF-007: wrap-glow full-board redraw

Change: the bleed-dock glow now arms the dynamic-board redraw on the trail's shared colour-redraw schedule
(`isLegacyColourRedrawDue`, 33 ms at full motion, 45 ms reduced) at every motion setting. It used to arm one every frame at full
motion. Reduced motion and levels with no wrap docks are unchanged (reduced motion evaluated the same condition before; a level
with no wrap docks never arms the glow).

Redraws of the whole dynamic board (`drawDynamicBoard`), idle for 10 s on level 30, from `scripts/analysis/profile-level-frame-cost.mjs`:

| Config (1x CPU) | frames/s | redraws/s before -> after | drawDynamicBoard ms/s before -> after |
| --- | --- | --- | --- |
| 390x844, DPR 1 | 60 | 60.0 -> 37.0 | 40.0 -> 22.1 |
| 1280x720, DPR 1 | 60 | 60.0 -> 35.1 | 37.2 -> 31.1 |
| 1280x720, DPR 1 (default run) | 59 | 59.2 -> 36.1 | 50.0 -> 21.7 |
| 1280x720, whole route as trail | 35 to 39 | 35.2 -> 26.1 | 205.3 -> 177.3 |
| 390x844, DPR 3 (default phone run) | 26 | 26.4 -> 25.9 | 14.3 -> 21.3 (noise) |
| non-wrap level 200, 1280x720 | 60 | 15.0 (after only; glow never pending) | 14.2 |

Reading: when the display outruns 30 Hz the redraw rate drops to the 33 ms schedule (about 30 a second plus whatever other
animations arm: the rest of the 35 to 37). A render-bound run (phone at DPR 3 in software, 26 fps) is already slower than the
schedule, so it cannot gain. The saving is a lower redraw count, not a large absolute time: about 15 to 30 ms of main-thread time
per second here. On a 120 Hz phone the redraw count falls to a quarter. In a headed Chromium at 87 fps the redraw rate measured
27.8/s (390x844) and 26.6/s (1280x720), i.e. it follows the 33 ms schedule, not the refresh rate.

### Colour step (largest per-channel change, out of 255, between consecutive redraws; all 8 sweep phases, 8 s)

Colour is the trail core colour at the trail head (`resolveBleedGlowColor`). Numbers from the real palette function:

| Redraw gap | Hue sweep only (Trail Shine off): core / bloom | With the travelling sheen (full motion): core / bloom |
| --- | --- | --- |
| 16.7 ms (every frame at 60 Hz, before) | 3 / 6 | 11 / 22 |
| 33 ms (after) | 5 / 12 | 20 / 44 |
| 45 ms (reduced motion, unchanged) | 7 / 15 | 27 / 57 |

The stated bound (core <= 8, bloom <= 17) holds for the hue sweep at 33 ms (5 / 12). It does NOT hold for the sheen band that
crosses the trail head at full motion (about 6 tiles a second): that jumps 20 per redraw instead of 11. That is the same step the
trail beside the player already takes today on the same 33 ms schedule (same function, same gap), so the dock glow and the trail
now change colour in lockstep. Only the core colour is used by the dock glow; the bloom column applies to the trail itself.
These are the RAW numbers; the dock glow step is now bounded at 8, see the next section. Owner pixel check recommended: watch
a wrap dock while the sheen passes the trail head.

### Sheen-crossing colour step: reproduced and fixed (owner 2026-11-13)

Owner: "there's a possible colour-step risk at the sheen crossing. fix it". The step above (20 per redraw) was left flagged;
it is now bounded.

Cause. The dock glow is painted in the trail core colour at the trail head, which includes the travelling sheen (a narrow
ridge, about 6 tiles a second, 9 tiles apart, that lifts the core toward pearl and refracts the hue). On the shared 33 ms
schedule that ridge is sampled at about 30 Hz, so the colour jumps up to 20 channel units (of 255) per redraw where it crosses
the head, against 11 when the glow redrew every frame at 60 Hz. A walking player makes it no better (head distance and time both
move under the ridge). Interpolating between redraws would need more redraws, which is the cost PERF-007 removes, so the fix
bounds the step at the source instead of raising the cadence.

Smoothness bound (unit: largest change of any 8-bit channel of the painted glow colour between two consecutive displayed
frames; the colour only changes on a redraw, so this is the per-redraw step): at most `BLEED_GLOW_MAX_COLOUR_STEP` = 8
(= `TRAIL_COLOUR_MAX_CORE_STEP`, about 3 % of the range), at every display rate, motion setting and head speed.

Fix (`src/render/bleedGlowColourStep.ts`, one field and one call in `MenuScene.drawDynamicBoard`). The glow colour follows the
trail-head colour but moves at most 8 units per 33 ms (about 240 a second; a shorter gap scales the allowed step down, a longer
one never above 8), along the straight line to the target so the hue is not skewed. The hue sweep alone (5 units per 33 ms at full
motion, 7 per 45 ms under reduced motion) is slower than that, so reduced motion keeps its full colour drift and Trail Shine off
is untouched; only the sheen ridge is softened (the dock flash rises over about three redraws instead of one and its peak trails the
raw colour by up to 44 to 48 units for a few redraws). After a gap over 250 ms (glow off screen, paused clock) or a clock reset it
resyncs to the target with no ramp. Redraw cadence is unchanged: still the shared 33 ms / 45 ms schedule.

Pure simulation, worst case over every phase of the sheen spacing, 8 s, `tests/render/bleed-glow-colour-step.test.ts`
(largest per-frame step of the displayed glow colour, pre-fix -> fixed):

| Display | idle head, full motion | walking head (8 tiles/s, redraw every frame) | idle, reduced motion |
| --- | --- | --- | --- |
| 60 Hz | 20 -> 8 | 13 -> 5 | 8 -> 8 (unchanged, no lag) |
| 120 Hz | 20 -> 8 | 7 -> 3 | 8 -> 8 (unchanged, no lag) |
| 144 Hz | 21 -> 8 | 6 -> 2 | 8 -> 8 (unchanged, no lag) |

Redraws a second are identical with and without the smoothing (it never arms a redraw).

Real browser (`scripts/analysis/measure-bleed-glow-colour-step.mjs`, headless Chromium, level 30, 40-tile trail, 10 s, same build,
pre-fix = the smoother replaced by the identity in the page). Glow = the colour the scene passed to the painter; pixel = one device
pixel at the centre of the most opaque glow rect (it also contains the moving band alpha, so it is not a pure colour step):

| Viewport | DPR | Pass | frames/s | redraws/s | glow colour step max / p99 | lane pixel step max / p99 |
| --- | --- | --- | --- | --- | --- | --- |
| 390x844 | 1 | raw (pre-fix) | 59.1 | 37 | 18 / 15 | 15 / 10 |
| 390x844 | 1 | fixed | 59.7 | 37.1 | 8 / 8 | 18 / 10 |
| 390x844 | 3 | raw (pre-fix) | 20.5 | 20.4 | 33 / 23 | 20 / 19 |
| 390x844 | 3 | fixed | 19.8 | 19.7 | 8 / 8 | 21 / 20 |
| 1280x720 | 1 | raw (pre-fix) | 48.1 | 33.1 | 21 / 16 | 11 / 10 |
| 1280x720 | 1 | fixed | 49.9 | 33.8 | 8 / 8 | 21 / 13 |
| 1280x720 | 3 | raw (pre-fix) | 8.1 | 8 | 63 / 63 | 41 / 41 |
| 1280x720 | 3 | fixed | 7.4 | 7.3 | 8 / 8 | 42 / 42 |

Reading: the glow colour step falls from 18 / 21 (DPR 1, 59 and 48 fps) and 33 / 63 (DPR 3, render-bound at 20 and 8 fps, i.e. 50 to 125 ms between redraws) to 8 in every row, with the redraw rate unchanged (37.0 -> 37.1 and 33.1 -> 33.8 at DPR 1; PR #488 measured 37.0 and 35.1 on the same levels, so no regression). The lane-pixel step does NOT fall: that pixel is dominated by the travelling band alpha (at most 0.55, moving about 0.05 per 33 ms redraw), which does not depend on the sheen and is not changed here; the colour part of it is at most 8 x 0.55 = 4.4. The DPR 3 rows are render-bound on this software-rendered host (the redraw gap there is 50 to 125 ms, not 33 ms), so they exaggerate the band step and say nothing about a phone GPU. The pixel numbers are therefore reported, not bounded.

Headless Chromium runs at the host refresh (about 60 Hz); 120 and 144 Hz are the simulation only. Nothing was checked on a real
phone or display. Not covered: the trail canvas itself still takes its own 20-unit core step on this schedule (unchanged, and its
bloom code conflicts with draft PR #461); a follow-up card could apply the same bound there.

### Kept frame vs forced redraw (`scripts/analysis/check-bleed-glow-redraw-equivalence.mjs`)

For every kept frame (no redraw) the script snapshots the canvas, forces a redraw, snapshots again and diffs, at DPR 1, idle,
level 30. It is not pixel-identical, by design: the band moves.

| Viewport | samples | inside the glow lanes: max channel diff, pixels differing (max / mean) |
| --- | --- | --- |
| 390x844 | 80 (and 100 in an earlier run, max diff 42) | 17, 448 / 365 |
| 1280x720 | 60 | 21, 1487 / 1248 |

The band moves 1.7 % of its loop per 33 ms: under one device pixel on a 42 px dock. Outside the lanes the diff is not zero:
the settings cog (HUD, redrawn every frame regardless of this gate) and other time-driven elements on the dynamic board, which were
being repainted at 60 Hz only because the glow forced it. On a non-wrap level the same board redraws about 15 times a second
today, so wrap levels now sit between that and the old 60.

## MAZER-PERF-005: bloom cost on a long route (measure only, no pixels changed)

`scripts/analysis/measure-trail-bloom-cost.mjs` captures the real arguments of `drawTrailCanvasSegments` for the whole solved
route as the trail, then replays `drawTrailLayersToCanvasContext` on a canvas of the same backing size, full vs with the bloom
off (alpha 0, blur 0), forcing the raster to finish with a 1 px `getImageData`. Median of 40 runs (25 / 20 where noted):

| Config | route tiles / segments | backing | bloom downscale | full ms | no-bloom ms | bloom ms | bloom share |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 390x844 DPR 1 | 166 / 843 | 342x446 | 1 (in place) | 25.5 | 8.1 | 17.4 | 68 % |
| 1280x720 DPR 1 | 158 / 1189 | 828x580 | 2 | 40.3 | 11.3 | 29.0 | 72 % |
| 390x844 DPR 3 | 158 / 875 | 807x1248 | 4 | 50.8 | 12.3 | 38.5 | 76 % |
| 390x844 DPR 1, 4x throttle (noisy host) | 204 / 1020 | 313x666 | 1 | 421.8 | 131.9 | 289.9 | 69 % |
| 1280x720 DPR 1, 4x throttle (noisy host) | 158 / 1141 | 476x578 | 1 | 471.4 | 140.1 | 331.3 | 70 % |

The bloom is about 70 % of the trail canvas redraw on a long route. Observations for the owner (no change made): on a
small blur (below 4.5 device px: phone at DPR 1) the downscale fast path is not used (`bloomDownscale` 1, the blur runs in
place); the cost is mostly raster after the 2D calls are recorded (record 1 to 4 ms vs 17 to 38 ms total), so a cheaper bloom would
need a cached or lower-resolution layer. Any change to the bloom conflicts with draft PR #461 (`trailLayersCanvas.ts`) and
needs an owner pixel review ("the halo is not visibly dimmer"). Acceptance criteria 2 and 3 of MAZER-PERF-005 are not
attempted here.
