# MAZER-VIS-035: some backdrop stars keep a slow rainbow hue

Owner request, 2026-11-13, verbatim: "can we make some of the stars in the background still rainbow-y colour".

## Decided direction kept

- Dark neon look, tile style B "Chip", board size and zoom: untouched.
- Every backdrop star is still a round point of light (never a cross or glyph; `src/render/backdropStars.ts`). The coloured four-point sparkles stay retired (2026-11-10).
- Star placement, count and drift (`advanceLegacyMenuBackdropStars`, radial warp) are unchanged. `src/legacy-runtime/legacyMenuBackdrop.ts` (Wave 4E) is not touched.
- The earlier owner preference for a stable per-star colour over rapid cycling through unrelated hues (Wave 4E note in `docs/contracts/mazer-ui-rework-decision-registry.v1.json`) is respected: the hue is one slow lap, not a fast cycle, and which stars are coloured never changes during a star's life.

## What changed

New pure module `src/render/backdropStarHue.ts` (no wave owns it), plus a small local edit to `MenuScene.drawBackdrop` / `updateStars` (Wave 5C; the backdrop star loop lives there, same as polish pass 2).

| Rule | Value |
| --- | --- |
| Which stars | about 20 % (`BACKDROP_RAINBOW_STAR_SHARE = 0.2`), chosen by a hash of the star's persisted `seed`. Stable for the star's whole life, identical on every load (the initial field is seeded), never derived from position or time. A star reborn at the warp origin gets a new seed, so it may join or leave the subset, exactly like its twinkle period does. |
| Hue | one lap of the spectrum per 24 s (`BACKDROP_RAINBOW_HUE_PERIOD_MS`), each star at its own phase offset (a second hash of the same seed), so they are never in lockstep. |
| Dim | HSV saturation 0.5, value 0.92, alpha capped at 0.6 (white stars reach about 0.74), so a rainbow star never outshines a white one and the maze, trail and diamonds stay the focus. |
| Reduced motion / Animated Background "Still" | drift and twinkle stop as before; the hue still shifts (owner rule 2026-11-12: reduced motion stops movement and pulsing, never colour). The hue reads the scene clock in every motion mode. With the drift redraw off, a colour-only backdrop redraw runs through `stepBackdropColourRedraw` (the same shape as `stepTrailColourRedraw`) every 250 ms: 4 a second, a fifth of the reduced-motion trail redraw rate, and at most 8 channel units of colour change per redraw (the trail colour bound). With full motion the existing star-drift redraw already carries the colour, so there is no extra redraw. |
| Colour source | HSV maths from the named constants above; no colour literals, so the off-theme colour ratchet (MAZER-UI-013) has nothing to count. |

No new full-board redraw, no per-frame allocation (numbers only), no new Graphics objects.

## Evidence

Headless Chromium 1x, `?previewLevel=300&runtimeDiagnostics=1`, from the dev server. Nothing was checked on a real phone.

- `evidence/2026-11-13-vis035/star-zoom-reduced-motion-4s-apart.png`: one rainbow star at 390x844 DPR 2 under reduced motion, four frames 4 s apart (star at the same position, centre pixel red, yellow, green, teal).
- `evidence/2026-11-13-vis035/strip-390x844-reduced-motion-6s-apart.png` and `strip-1280x720-full-motion-6s-apart.png`: four frames 6 s apart. The stars are faint by design; the maze reads exactly as before.
- Reduced motion, 390x844: 48 of 240 stars are rainbow (20 %); the five measured stars did not move and their centre pixel changed colour in step with the expected hue every frame.
- Frame cost (`scripts/analysis/profile-level-frame-cost.mjs --levels=1,300 --throttle=1|4 --idle-ms=6000 --walk-ms=4000`, raw output in `evidence/2026-11-13-vis035/before-t*.json`, `after-t*.json`): the idle requestAnimationFrame means on this shared workstation vary by more than 2x between identical runs at 4x CPU (L300 390x844: 199 ms before, 405 ms after; L1 1280x720: 187 ms before, 102 ms after), so those totals are noise, not a signal. At 1x on the desktop viewport the frame was 16.67 / 16.71 ms before and 17.09 / 16.76 ms after, `drawBackdrop` 0.085 / 0.124 ms before and 0.116 / 0.116 ms after. A direct in-page measurement of the added per-star work (240 stars, 400 runs) is 0.021 ms at 1x and 0.086 ms at 4x CPU, against a full `drawBackdrop` of 0.047 ms (1x) and 0.364 ms (4x): about 0.1 % of a 16.7 ms frame at 1x.

## Tests

`tests/render/backdropStarHue.test.ts` (new, in the Wave 4E required list `scripts/verify/world-identity-required-tests.mjs`): subset share and stability, hue periodicity and phase spread, per-redraw colour step bound, saturation/brightness/alpha caps at every hue, reduced-motion equivalence (the hue has no motion input), redraw gate rate. `tests/architecture/world-identity-star-render-contract.test.ts` pins the call sites.

The Guide never mentions backdrop stars (its "star" is the goal marker), so no Guide copy changed.
