# Edge diamonds: one fill, drain toward the laser, and the "missing" bottom diamonds (MAZER-VIS-033)

Status: implemented 2026-11-13 on branch `claude/mazer-vis-033-20261113`, on top of MAZER-VIS-030 (`docs/ui/MAZER-EDGE-BEAMS-DIAMOND-FILL-2026-11-12.md`). Source, unit, pixel and headless-Chromium evidence only; NOT checked on a real phone.

Amended 2026-11-13 by MAZER-VIS-038 (`docs/ui/MAZER-EDGE-INNER-TIP-SIZE-CYCLE-2026-11-13.md`): the diamonds are 50% of their size while the maze runs (scaled about the inner tip) and the corner-clipping candidate in section 3 is therefore smaller by half; the layout itself is unchanged and the device check is still open.

Owner requests, one PR:

1. "I see two different fills on the diamonds when my beams shoot out to them. Remove the old instant green fill that does not touch the diamond borders; keep the new fill that grows as the laser enters and touches the border."
2. "The fill grows from the inner tip toward the outer tip. The drain must go the opposite way from today: the green leaves from the outer tip first and the last of it exits at the inner tip, toward where the laser shoots out."
3. "In the played game the two bottom diamonds (bottom-left, bottom-right) seem to be missing, only 6 of 8 show."

## 1. Two fills: root cause and fix

Root cause (source, then frame strips): MAZER-VIS-030 added the beam-contact fill (`drawDiamondFill`) but left the older lighting cue in `drawEdgeMarker`: when a marker was `energized` (a live wrap end: `MenuScene.drawLegacyEdgeMarkers` adds `resolveLegacyWrapEndStationIds()` while the player transfer is armed, i.e. from the moment the player reaches the goal, and again through the intro until it is done) or `flash > 0` (wrap flash), `drawEdgeMarker` painted a second, smaller kite (the outline at 0.5 scale) in the player colour at alpha `0.7 * energy`. That core is instant: it switches on with the cue, long before any beam arrives, and it never touches the border. So on every wrap-end diamond the owner saw the instant core AND the growing beam fill, and on arrival a leftover core survived the drain (frame strips: "BEFORE" rows, small kite in the middle of d7/d3/d5 at c = 100 to 300 ms and again after the drain). Diamonds that are not wrap ends never had the core, which is why a level-1 corridor (no wrap) looked fine.

Fix: the half-size core is deleted (`edgeMarkers.ts`, `drawEdgeMarker`). It is not hidden behind a flag. The cues that fed it (wrap end, wrap flash) still brighten the BORDER (`state.alpha`, `EDGE_MARKER_ENERGIZED_ALPHA`), which is a border, not a fill; nothing else paints inside a diamond. The only colour inside a diamond is now the beam fill.

Checked for other drawers: `drawEdgeMarker` is the only diamond drawer (the scene's marker layer and the Guide legend icon both call it; the Teleport conduit/shell art is retired and not drawn). The Guide icon is drawn with `fill: 0.6` and no cues, unchanged.

A second tone that is NOT a fill: in the strips a full diamond near a screen edge can look two-toned (darker toward the board). That is the translucent board panel (drawn above the diamonds) dimming the part of the diamond under it, also present before this change; it is one fill under a veil. Noted, not changed (the board layout is frozen).

## 2. Direction

The fill colour is now always anchored at the INNER tip (the end the beams touch and leave through). `resolveDiamondFillShape(vertices, center, inwardAngle, halfHeight, fill)` has one direction: the region is `[inner tip .. inner tip - fill * length]`.

- Departure (incoming beam): fill rises 0 to 1, so the colour grows from the inner tip toward the outer tip (unchanged).
- Arrival (outgoing beam): fill falls 1 to 0 along the same function, so the colour leaves from the OUTER tip first and the last of it exits at the INNER tip, toward where the beam shoots out. Before, the drain mode kept the outer tip and emptied the inner tip first (the opposite).

The mode switch is gone with it: `DiamondFillMode`, the `mode` argument, `EdgeMarkerState.fillMode`, `EdgeMarkerStateInput.fillMode`, `EdgeBeamPulse.fillMode` and the scene's `fillMode:` line are removed (one direction, so a diamond cannot show two shapes). Timing is untouched: `edgeBeamTimeline.ts` still gives `fill = (c - contactMs) / 200` and `drain = (c - launchMs) / 200` (monotonic, continuous, exactly 0 and 1 at the instants the tests pin); the head flight, landing, input unlock (build end + 400 ms) and every duration are unchanged. The bright 1 px front line still rides the cut.

Reduced Motion: unchanged. No travelling motion; the diamonds crossfade over 200 ms (empty to full on departure, full to empty on arrival, whole interior by alpha); the border colour keeps following the trail colour. Frame strip: `phone-390x844-reduced-motion-crossfade.png` (right-middle diamond, interior alpha 0.17 to 1.00 and back to 0.24, no beam, no core, border colour shifting).

## 3. "Missing" bottom diamonds

Result: NOT reproduced headlessly. Root cause UNCONFIRMED; the strongest candidate is below and needs one device check. Nothing in the layout was changed for it.

What was run (real game, `?runtimeDiagnostics=1&previewLevel=N`, mode `play`, overlay `none`, headless Chromium; levels 1, 50, 120, 250; the outline of each of the 8 kites sampled from a real screenshot, share of outline samples brighter than the background):

| Viewport | DPR | Board | Result |
| --- | --- | --- | --- |
| 390x844 | 2.625 | 25x51 | all 8 drawn (outline coverage 0.88 to 1.00) |
| 393x852 | 3 | 25x51 | all 8, 1.00 |
| 412x915 | 2.625 | 25x51 | all 8 (0.75 to 1.00; the bottom samples at the backing-store edge are rounding, not clipping) |
| 360x740 | 3 | 25x49 | all 8, 1.00 |
| 1280x720 | 2 | 47x25 | all 8 (0.94 to 1.00) |
| 1920x1080 | 1 | 47x25 | all 8 (0.57 to 0.80 at DPR 1: thin antialiased line under the brightness threshold, all present in the PNG) |

Also checked: after a real goal-reach transfer (the stations at rest, the orbit, the arrival): every one of the 8 is drawn again at its rest station at the end (bottom corners included). `edgeMarkerGraphics` is visible (depth 0 in `boardZoomContainer`, scale 1), nothing hides a station (`hiddenIds` is never passed by the scene), the board rectangle ends above the bottom row on phone and desktop (the new test pins it), and the canvas is the full visual viewport. Bounds, culling, depth, board overlap, HUD and dock: none explains it. (Headless viewport sizes are as listed; the shipped sizes are 25x51 phone and 45x27 desktop; the scene reported 47x25 on 1280x720 in the diagnostic, the test uses the shipped 45x27.)

Strongest candidate, which headless Chromium cannot show: the eight kites are full-bleed (outer tip flush with the screen edge, corner kites 12 px in from the corner). A physical phone display has rounded corners. With a corner radius R css px, the visible share of a corner kite (computed exactly from the kite polygon against a rounded rectangle, 390x844):

| Display corner radius | Visible share of each corner kite |
| --- | --- |
| 28 | 73 % |
| 40 | 30 % |
| 47 (iPhone 13/14 class) | 11 % |
| 55 and up (iPhone 15 Pro / 16 class) | 0 % |

The app declares `apple-mobile-web-app-status-bar-style: default`, so a home-screen web app starts BELOW the status bar: its top corners are square (top diamonds fully visible) while its bottom corners are the rounded display corners (bottom-left and bottom-right nearly or entirely cut off). That is exactly "6 of 8 show, the two bottom corners are missing", and the bottom middle one (away from the corner) stays visible. This is an inference from geometry and from what the owner reports, NOT observed on a device. A real home-indicator overlay or a browser toolbar over the bottom edge would hide all three bottom kites instead, which does not match the report.

The fix this implies (pull the four corner kites in along the diagonal until they clear the rounded corner, and re-route the orbit through them) changes a pinned layout contract (the station layout, the orbit continuity tests and the teleport anchor poses are all defined against the flush corner), and the clearance radius is a per-phone number. It was therefore NOT built here without knowing the phone; see the follow-up card in the PR.

Regression test (`tests/render/edgeMarkerVisibility.test.ts`): for the shipped board sizes (25x51 phone at 390x844 @2.625 and @3, 393x852 @3, 412x915 @2.625; 45x27 desktop at 1280x720 @2 and 1440x900 @2) it resolves the real play layout and asserts that the 8 diamonds are 8 distinct stations (three on the bottom edge, two of them corners), every diamond rect (outline plus half a stroke) lies inside the canvas in css and in device px, the top and bottom ones do not intersect the board rectangle, the real `drawEdgeMarkers` paints 8 outlines with every point on the canvas (none hidden or culled), and a whole ring step lands back on all 8.

## Evidence (headless Chromium, the real game, a real goal-reach transfer; not a real phone)

`docs/ui/evidence/2026-11-13-edge-diamond-one-fill/`:

- `phone-390x844-before-after.png` (DPR 2.625) and `desktop-1280x720-before-after.png` (DPR 2): four blocks of three diamonds (left-middle, right-middle, bottom-middle; all three are wrap ends in the captured level) at seven laser-clock instants: BEFORE departure (main `fe1e9da1`: the instant core is in the diamond at c = 100 and 300 ms, before any beam arrives, next to the growing fill), AFTER departure (empty until contact, one fill growing from the inner tip), BEFORE arrival (the opposite drain, core left behind) and AFTER arrival (drain from the outer tip, the last sliver exits at the inner tip). Each crop is read from the game canvas on every animation frame, so the clock labels are the nearest captured frame.
- `phone-390x844-reduced-motion-crossfade.png`: Reduce Motion crossfade.

## Verification

`npx tsc --noEmit`; `tests/render/edgeBeamPixels.test.ts` (per DPR 1 / 2 / 2.625 / 3: the lit share follows the fill fraction, nothing outside the outline, the colour is anchored at the inner tip and a falling fill leaves the outer tip first and the inner tip last, nested regions, and one fill only: with every cue on an empty diamond has no interior paint and a full one has exactly the fill alpha); `tests/render/edgeMarkers.test.ts` (one `fillPath` per diamond with every cue on, no half-size kite in the source, cues still brighten the border); `tests/render/edgeBeamTimeline.test.ts` (monotonic, continuous, exact rest values: unchanged and green); `tests/render/edgeMarkerVisibility.test.ts` (item 3).

## Not checked

A real phone (touch device, real GPU, real corner radius, home-screen or browser mode); which phone and mode the owner uses; Safari / WebKit; 120 Hz displays; a real-time review of the animation by the owner (only frame strips and tests).
