# Edge diamond beams: redesigned pulse, and the diamond fills and drains with the beam (MAZER-VIS-030)

Status: implemented 2026-11-12 on branch `claude/mazer-vis-030-20261112`, after the owner asked: "the lasers that shoot out to the diamonds and out from them we need to spruce up and make look better, redesign, also the way it animated: I want the colour inside the diamond to fill up as the laser goes into it then drain out as the laser shoots out, and ensure the timing is on contact and all that and it looks right." Source, unit, pixel and headless-Chromium evidence only; NOT checked on a real phone.

Amended 2026-11-13 by MAZER-VIS-033 (`docs/ui/MAZER-EDGE-DIAMOND-ONE-FILL-2026-11-13.md`): the drain direction below is reversed (the colour now leaves from the OUTER tip first and the last of it exits at the INNER tip) and the small instant "lit core" this document lists under "Before" is deleted for good (it was still drawn next to the new fill on wrap-end diamonds). Where this document says otherwise, the VIS-033 document wins.

## What "the diamonds" and "the lasers" are

They are the eight edge diamonds (`src/render/edgeMarkers.ts`, MAZER-VIS-004) and the beams drawn by `drawEdgeBeams`: on a level change the player fires a beam OUT to all eight diamonds (the deconstruct, "departure"), the maze dissolves, then the maze builds and all eight diamonds fire a beam OUT to the spawn tile (the build, "arrival"). The Teleport System v1 conduit presentation (`teleportTransferPresentation.ts`, `teleportTransferConduitCanvas.ts`) is NOT drawn by the scene any more (`getGameplayTransferPresentationDiagnostics` returns `null`, "retired with the old diamond/conduit presentation"), so no Wave 4D-B file is touched.

## Before (main 9eaa079c), measured from the code and a real-browser frame strip

Times are on the master laser clock `c` (ms from the instant the beams leave; `INTRO_LASER_MS` = `OUTRO_LASER_MS` = 400). Constants: `introTimeline.ts` (`INTRO_LASER_MS`, `INTRO_BEAM_STAGGER_MS` = 60 from `motionScale.ts`), `edgeMarkers.ts` (`resolveEdgeBeamProgress`, `EDGE_RING_BUILD_LIT` 0.6, `EDGE_RING_LANDING_RAMP` 0.2, `EDGE_RING_FIRE_RAMP` 0.2).

| Moment | Departure (player to diamonds) | Arrival (diamonds to maze) |
| --- | --- | --- |
| Beam head leaves | c = 0 (diamond 0) .. 98 ms (diamond 7) | same (c = build end) |
| Head reaches target ("contact") | 302 ms (diamond 0) .. 400 ms (diamond 7) | same |
| Beam on screen | head > 0 and head < 1: it VANISHES the instant it touches the diamond | same, vanishes on landing |
| Diamond light | rises over the last 20 % of the beam flight, i.e. BEFORE contact, full at contact; small 0.5-scale core | 0.6 lit for the whole build, rises to 1 as the beam leaves |
| End of lighting | fades over the last 150 ms of the outro, then the next intro re-lights it at 0.6 (a dip at the seam) | fades over 150 ms after the landing |
| Ring orbit | starts at 400 ms | parked from the build end |

Look: one 3 px glow + 1 px core line from source to head, a dot on the head, a small kite-shaped core. Nothing filled the diamond and nothing happened at contact.

## After

One pulse model, one clock, in `src/render/edgeBeamTimeline.ts` (pure, no Phaser): a beam is a head and a tail on its path that ride the SAME flight curve, the tail `EDGE_BEAM_PULSE_MS` (200 ms, `MOTION_DURATION_MS.base`) behind the head.

- The HEAD is the shipped flight, unchanged (`resolveBeamHeadFromMaster` is the old `resolveEdgeBeamProgress`; a test pins it against a copy of the old formula). So the landing, the 400 ms laser, the input unlock (build end + 400 ms) and every total duration are unchanged.
- Departure: diamond `i` is empty until the head touches it at `contactMs`, then fills linearly, exactly 0 at contact and exactly 1 when the tail arrives (`contactMs + 200`): the beam is fully absorbed. It stays full through the dissolve and the build (the ring orbits full).
- Arrival: the diamond is full until the head leaves it at `launchMs`, then drains linearly, exactly 1 at release and exactly 0 when the tail has left (`launchMs + 200`).
- Cold start (no deconstruct before it, `digitAlreadyVisible` false): the ring charges over the first 400 ms of the build, then drains the same way.

| Diamond | Head leaves (ms) | Head touches, fill starts (ms) | Drain ends (ms) | Fill full, tail absorbed (ms) |
| --- | --- | --- | --- | --- |
| 0 | 0.0 | 302.2 | 200.0 | 502.2 |
| 1 | 34.8 | 310.2 | 234.8 | 510.2 |
| 2 | 49.9 | 318.7 | 249.9 | 518.7 |
| 3 | 61.8 | 327.9 | 261.8 | 527.9 |
| 4 | 72.1 | 338.2 | 272.1 | 538.2 |
| 5 | 81.3 | 350.1 | 281.3 | 550.1 |
| 6 | 89.8 | 365.2 | 289.8 | 565.2 |
| 7 | 97.8 | 400.0 | 297.8 | 600.0 |

"Head leaves" and "head touches" are the same closed-form instants the unit tests pin (`resolveBeamTimes`: the inverse of the flight curve, not a sampled value). The tails end inside the 350 ms landing pop that already follows the landing.

Contact is geometric, not at the centre: each beam ends on the diamond OUTLINE (`resolveOutlineExitPoint`, the exact point where the line from the diamond centre toward the player or spawn tile leaves the kite), so the head is on the diamond at the very instant the fill starts and leaves it at the very instant the drain starts. The fill grows from the INNER tip (the end the beam comes in through) toward the outer tip. (VIS-033: the drain runs the same motion backwards, so the colour leaves from the OUTER tip first and the last of it exits at the INNER tip, toward where the beam shoots out; this document first shipped the opposite.) A one pixel bright front line rides the cut.

The ring now holds still until the last beam is absorbed: the outro orbit starts at `OUTRO_RING_ORBIT_START_MS` = 600 ms (was 400) and still ends with the outro, so no total duration moved (the orbit is 200 ms shorter and slightly faster).

### Beam look (`src/render/edgeBeamArt.ts`)

A comet in the player colour (`PLAYER_COLOR` and mixes of it toward white, nothing else): a soft bloom (two wide low-alpha gradients, 9 px and 5 px), a body 1 to 2 px wide whose alpha ramps up toward the head (14 nested spans, so no seams and no per-segment overdraw), a one-device-pixel hot lead over the last third, a pulsing head with a halo, and one thin ripple ring on the contact point that grows and fades over the 200 ms fill or drain window. Line ends snap to the centre of a device pixel and widths to whole device pixels (`snapToDevice`, `snapWidthToDevice`). The beams still draw into the existing `spawnLaserGraphics` layer and the markers into `edgeMarkerGraphics`; no new layer, no board redraw: the markers already redrew every frame while a lifecycle was active.

### Reduced Motion

No travelling beam, no pulse, no orbit (unchanged). The diamonds crossfade over `MOTION_REDUCED_MS.crossfade` (200 ms): empty to full during the deconstruct, full to empty during the build (a cold start stays empty), as an alpha ramp on the whole interior, with the same end states as full motion. The border colour keeps following the trail colour (owner rule: reduced motion stops movement and pulsing, never colour).

### Guide

The Wrap row now reads "Some mazes wrap around open edges. Trail-coloured edge diamonds fill as beams hit." (82 characters, under the 90 limit); its icon is the same `drawEdgeMarker`, now drawn 60 % filled.

## Cost

Headless Chromium on a busy shared machine (other workers were running), so the numbers are indicative, not a phone. Micro-benchmark of the real modules on the real Phaser scene: build all 8 beams in flight plus the 8 markers into a Graphics, then replay that command buffer onto the canvas (Phaser's own Graphics canvas render); 400 builds and 100 replays averaged, Chrome DevTools CPU throttle 1x and 4x. "Before" is main 9eaa079c on a second port.

| Viewport | CPU | Build beams (ms) | Build markers (ms) | Canvas replay (ms) | Graphics commands |
| --- | --- | --- | --- | --- | --- |
| 390x844 @2.625 before | 1x | 0.007 | 0.007 | 0.026 | 592 |
| 390x844 @2.625 after | 1x | 0.054 | 0.013 | 0.139 | 3487 |
| 390x844 @2.625 before | 4x | 0.029 | 0.046 | 0.283 | 592 |
| 390x844 @2.625 after | 4x | 0.410 | 0.096 | 1.248 | 3487 |
| 1280x720 @2 before | 1x | 0.009 | 0.010 | 0.036 | 592 |
| 1280x720 @2 after | 1x | 0.070 | 0.020 | 0.146 | 3487 |
| 1280x720 @2 before | 4x | 0.034 | 0.060 | 0.288 | 592 |
| 1280x720 @2 after | 4x | 0.355 | 0.111 | 1.330 | 3487 |

So a beam-active frame costs about 1.7 to 1.8 ms at 4x CPU (was about 0.35 ms) and about 0.2 ms at 1x (was about 0.03 ms): roughly five times the old beam cost, a small share of a 16.7 ms frame, and paid only inside the two windows per level change in which beams exist (about 0.6 s each); outside them there is no lifecycle and no redraw. The live-scene sample of `drawLegacyEdgeLasers` (phone, 1x, wrapped with `performance.now()`, beam-active frames only) agrees: mean 0.089 ms before (37 frames, p95 0.2) vs 0.165 ms after (57 frames, p95 0.3, max 0.5); the 4x live sample was only 3 / 5 frames (the throttled page ran at about 9 fps), too few to quote. There is no new full-board redraw and no new layer: the beams draw into the existing `spawnLaserGraphics`, the diamonds into the existing `edgeMarkerGraphics`, which already redrew every frame while a lifecycle was active. The cost lever if a real phone shows hitching is `BEAM_BODY_LAYERS` / `BEAM_BLOOM_LAYERS` in `edgeBeamArt.ts` (14 / 8 now; the commands scale with them).

## Evidence (headless Chromium, `?previewLevel=1&runtimeDiagnostics=1`, real game, a real solver walk to the goal; not a real phone)

`docs/ui/evidence/2026-11-12-edge-beams/phone-390x844-reduced-motion-crossfade.png`: Reduce Motion on (`reducedMotion: 'reduce'`), the right-middle diamond over the 200 ms outro crossfade (fill 0.08 to 1.00, no beam, no sweep, ring spin 0 on every frame) and the 200 ms build crossfade (0.99 to 0.24 and on to empty); the border still follows the trail colour.

`docs/ui/evidence/2026-11-12-edge-beams/phone-390x844-before-after.png` (DPR 2.625) and `desktop-1280x720-before-after.png` (DPR 2): per viewport, four rows of 8 frames, 100 css px crops: the right-middle diamond receiving the player beam (before, then after: contact, about 25 / 50 / 75 / 100 % fill) and the left-middle diamond sending its beam out (before, then after: full, release, about 75 / 50 / 25 / 0 % drain). The frame times are the master laser clock read from the scene on every frame; the capture is one canvas read per animation frame, so neighbouring frames can repeat.

## Permanent browser verification

`scripts/analysis/verify-gameplay-teleport-transfer.mjs` (real built game, manual 16 ms clock) was updated to the new contract: the ring contract is now "full through the build, each diamond drains from its own beam's release and is dark once the beam has fully left; empty until the player beam touches it, full once absorbed, held to the end of the deconstruct"; a pulse is 31 `lineBetween` calls and is matched to its station by draw order plus geometry (along station to focus, within the kite's reach, pointing the right way); the beam windows allow the 200 ms tail past the heads; the input unlock check still pins the head landing (build end + 400 ms); reduced motion still asserts no beam, no spin and no border brightening (the interior only crossfades).

## Wave ownership

`MenuScene.ts` (Wave 5C): a small local edit (the ring lifecycle shape, two beam inputs, the spawn-burst clock, the Guide icon fill). New files `edgeBeamTimeline.ts`, `edgeBeamArt.ts`; edited `edgeMarkers.ts`, `introTimeline.ts`, `legacyGuideContent.ts`. No Wave 4D-A, 4D-B, 1B or 5B path changed (no `package.json`, no registry, no `exports/**`, no `docs/current-truth.md`).

## Not checked

A real phone (touch device, real GPU, real DPR); a real-time review of the animation by the owner (only frame strips and tests); Safari / WebKit; 120 Hz displays.
