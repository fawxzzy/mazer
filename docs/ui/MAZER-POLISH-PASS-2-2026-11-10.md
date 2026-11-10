# Polish pass 2: no backdrop stars, centred end markers, a cheaper long-trail draw

Status: implemented 2026-11-10 on branch `claude/mazer-polish2-20261110`, after the owner looked at the live game (PR #406) on his phone. Source and headless-browser evidence only; not checked on a real phone. Board card `MAZER-VIS-014` (review).

Owner report, verbatim: "no more stagnent stars in the background. the player trail color still stagnenet but the diamonds hve the right color shoft happening. the title text has the correct color shoft too ... the star for the end tiles isnt centered in the middle of its tile ??? same w start arrow and its size should not be making it bleed over tile edges its inside."

## 1. Backdrop stars

Cause: `MenuScene.drawBackdrop` drew its nearest stars as coloured four-point sparkles (green, orange, purple, blue, red crosses) and every other star as a round dot. With Animated Background on "Still" or reduced motion on, every star was a frozen dot, and the sparkles read as fixed decorations behind the maze either way.

Change: `src/render/backdropStars.ts` (new, pure policy). The sparkle tier is gone (a star whose core is 3 px or more is not drawn), and no star at all is drawn while the backdrop is not animating. The remaining faint round dots only exist while they drift and twinkle. The dark space background, shards, runes and edge diamonds are untouched. The Guide never mentioned backdrop stars; its Goal "star" is the goal marker, so no Guide copy changed.

Evidence: `evidence/2026-11-10-polish2/backdrop-stars-before-after-phone-L198.png` (390 x 844 at DPR 3, `?previewLevel=198`, before left, after right).

Tests: `tests/render/backdropStars.test.ts` (new). `tests/architecture/world-identity-star-render-contract.test.ts` pinned the sparkle hue code; it now pins that the hue code stays gone and that every star goes through the policy.

## 2. Trail colour

Measured, not assumed. Frame sequences of the real game (`?previewLevel=20`, seeded maze, real clock, a 40-step real trail, 10 frames 200 ms apart, trail cells only, the 4 cells next to the player excluded):

| Case | Phone 390x844 DPR 3 (tile 14.7 px) | Desktop 1280x720 DPR 1 (tile 25.4 px) |
| --- | --- | --- |
| Player idle | 92 % of trail cells change colour per frame pair, mean RGB delta 78 | 78 %, mean RGB delta 54 |
| Player moving | 92 %, 80 | 78 %, 55 |
| Reduced motion, idle | 0 %, 0 (frames identical, palette clock frozen at 0) | 0 %, 0 |

The same real-keyboard measurement against the LIVE site (mazer.fawxzzy.com, phone and desktop sizes, default settings) shows the trail colour changing every 250 ms frame (per-cell colour delta up to 250 over 2 s). So with default settings, a normal frame rate and no reduced motion, the trail colour flows, whether or not the player moves. The palette is drawn every 33 ms through `hasLegacyPlayTrailPulsePendingFrame`, nothing is baked or cached on the segments, the sheen and hue phase are continuous (not quantised), and the head sample the diamonds read is the same call. Evidence: `trail-idle-frame-strip-phone-L20.png` (five frames 0.4 s apart) and `trail-idle-frame-strip-phone-reduced-motion.png` (identical frames).

So the cause on the owner's phone is not proven. What can make the trail still while the diamonds and the title move:

1. Reduced motion or Trail Shine Off. Both freeze the trail by design (the trail reads `isLegacyTrailShineVisible`), and the same off-screen state would also freeze the backdrop stars (the Animated Background / reduced-motion gate), which matches the owner seeing still stars and a still trail together. The diamond border still changes while the player moves even then, because it samples the gradient at the trail head and the head moves as the trail grows. Not testable without the device. Ask the owner to check Settings (Trail Shine, Animated Background) and iOS Settings > Accessibility > Motion > Reduce Motion.
2. A slow phone. This was found and measured (below). A 100-tile trail on the phone-size board took about 130 ms per frame (3.5 fps) with the CPU throttled 4x, so a 3.6 s colour sweep becomes a slideshow.

### Cost found and reduced

The bloom under the trail was one `shadowBlur` stroke per colour chunk, and with the time-driven palette nearly every 4 px resampled segment is its own chunk (hundreds of blurred strokes per frame for a long trail). Chrome defers canvas work to the next draw, so that cost lands in Phaser's render step, not in the trail draw call the existing counters time (`getTrailPerfDiagnostics().drawMs` reported 2.5 ms while the frame was far longer). `src/render/trailLayersCanvas.ts` (not a wave-owned file) now draws the bloom on a scratch canvas at 1/f of the resolution with the blur radius divided by f, and scales it back up with smoothing. Where there is no DOM (tests) the original in-place blur is used.

Measured on `?previewLevel=198&mazeSeed=1337`, 390x844 DPR 3, 100-tile trail, headless Chromium, 6 s each. The trail is redrawn every 33 ms because it is a moving gradient, so there is no dirty rectangle to save; the saving is per draw.

| | Phaser render step | frame interval (mean) | trail draws per second |
| --- | --- | --- | --- |
| CPU x1, before | 20.7 ms | 46 ms (21.6 fps) | 21.7 |
| CPU x1, after | 17.1 ms | 49 ms (20.6 fps) | 20.8 |
| CPU x4, before | 140.6 ms | 284 ms (3.5 fps) | 3.7 |
| CPU x4, after | 88.9 ms | 237 ms (4.2 fps) | 4.3 |

An honest read: the render step drops 17 % (x1) and 37 % (x4) and the frame rate gains about 20 % on a slow device, but the headless run is software-rasterised and capped near 20 fps, so this is not a real-phone number and it does not rescue a slow device by itself. The bloom looks the same: before and after crops of the same trail differ by a mean 0.49 of 255 per channel (`trail-bloom-before-after.png`). The 33 ms cadence is unchanged. Reduced motion is still a static gradient and the worst-hue contrast floor is untouched (no palette change).

### The corner-raster flake: root cause

`scripts/analysis/verify-trail-corner-raster.mjs` flaked once on cornerNW (55 px against a 40 px limit). Its captures include the backdrop, and the backdrop's coloured sparkle stars are created with an unseeded `Math.random`, so a sparkle landing inside the capture region is a random connected differing region (visible as magenta dots in the old baselines). On clean main the check showed 135 to 260 differing pixels and regions up to 12 px, varying run to run. With the sparkles removed (and no stars drawn under reduced motion) three consecutive runs are pixel-identical to the new baselines (0 differing pixels).

## 3. End-tile star and start arrow

Measured in the live-style game (device pixels; tile rect from `boardTileLayer.endpointTiles`; glyph = goal-red or start-gold pixels). `evidence/2026-11-10-polish2/endpoints-before-after.png` draws the tile rect in cyan, the glyph box in yellow and the tile centre lines in magenta, before left and after right.

| | Phone DPR 3, tile 44 px | Desktop DPR 1, tile 25 px |
| --- | --- | --- |
| Goal star before | centre offset dx 0, dy -1; fill margins l9 t9 r9 b11 | dx 0, dy -1; margins 6/5/6/7 |
| Goal star after | dx 0, dy +0.5; margins 12/13/12/12 | dx 0, dy 0; margins 7/7/7/7 |
| Start arrow before (up / left) | dx 0, dy -5 | dx +1.5, dy 0 |
| Start arrow after | dx 0, dy -3 | dx +1.5, dy 0 |

What the crops show is the real defect: before, the dark outline reached the lit rim and the tile edge (the star was centred on its circumcentre, so its bounding box sat about 0.1 of its radius high; the arrow was centred on its centroid). The remaining arrow offsets above are the bounding box of the gold FILL only (the apex is a point, so a thin tip is lost to rasterisation); the unit tests measure the whole glyph with its outline.

Change (`src/render/endpointTiles.ts`, pure): the star is moved down by 0.0955 of its radius so its whole bounding box (outline included) is centred; the arrow's bounding box (not its centroid) is centred on the tile; both are then scaled so the farthest point of the outline stays an inset (7 % of the half-tile, at least half a device pixel) inside the tile's fill (the area inside the lit rim). Where the one-device-pixel outline would eat the room on a tiny tile it is thinned so the glyph keeps its size. Cost of the fit: the star is 0.49 to 0.85 of its old nominal radius depending on tile size and pixel ratio (about 80 % at 14.7 px tiles, roughly 65 % of the old area), and the red keeps its dark outline for legibility. The goal beacon (halo) still finds it on dense boards.

Tests, in `tests/render/endpointTilePixels.test.ts`: for tile sizes 6.4 to 25.44 css px at DPR 1, 2 and 3, one cell per tile kind (cap, straight, corner, junction, concave corner), the goal and all four start directions: the bounding box of every painted pixel (glyph plus outline) is within 0.5 device px of the tile centre, and every painted pixel is inside the tile's fill and off its edge. 91 of these new tests failed on the previous code (run before the fix) and all pass now. The older "optical centring" assertion (apex further than the back) is replaced by "apex and flat back are the same distance from the centre". `marker-trail-legibility` now bounds the star area at 0.2 to 1.1 of nominal instead of 0.9 to 1.1.

Re-blessed raster fixtures (intended): `tests/fixtures/trail-corner-raster/corner{NE,NW,SE,SW}.png`. The trail pixels are identical (checked at five points); the differences are the start arrow's new size and place and the missing backdrop star dots (`corner-baselines-before-after.png`, old row above new row for each corner).

## Wave ownership

`MenuScene.ts` (Wave 5C) is touched only for the backdrop star loop and one import. `endpointTiles.ts`, `trailLayersCanvas.ts` and `backdropStars.ts` are not in any wave's path list. No 4D-A, 4D-B, 4E (`legacyMenuBackdrop.ts` untouched), 1B or 5B path changed, so the change set stays in one wave. If the still trail turns out to be a Settings or reduced-motion matter, that code also lives in `MenuScene.ts` (5C), so a follow-up there would still be a single-wave change.

## Not checked

A real phone (the owner's reduced-motion state, settings, frame rate and GPU are unknown), Safari or iOS canvas behaviour for the scratch-canvas bloom, and touch input. Everything above is headless Chromium.
