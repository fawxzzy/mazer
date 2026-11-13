# Eased Start, overlay and splash transitions (MAZER-MOTION-002)

Status: headless Chromium and unit tests only. Not checked on a real phone.

## What changed

Before this change a tap on Start removed the title, icons and corridor in one frame, every overlay opened and closed in one frame, and the static HTML splash hard-cut to the game. Now each of those is a short crossfade from a snapshot of the outgoing screen to the live scene.

| Transition | Full motion | Reduce Motion |
| --- | --- | --- |
| Overlay open | 200 ms fade (`MOTION_DURATION_MS.base`) | 200 ms crossfade (`MOTION_REDUCED_MS.crossfade`) |
| Overlay close | 120 ms fade (`MOTION_DURATION_MS.fast`) | 200 ms crossfade |
| Start | 300 ms fade (`MOTION_DURATION_MS.slow`) with a 3% outward drift of the old menu | 200 ms crossfade, no drift |
| Boot splash | 300 ms fade, then removed | 200 ms fade (device `prefers-reduced-motion` only) |
| Loader pulse (splash dot, in-game "Signing you in" diamond) | one 1200 ms beat (`MOTION_LOOP_MS.beat`) | held lit |

Reduce Motion follows the owner rule of 2026-11-12: movement and pulsing stop, colours keep shifting. The one crossfade length is `MOTION_REDUCED_MS.crossfade`.

## How it stays safe

- The live scene changes state on the tap, exactly as before. The snapshot is a non-interactive image drawn on top and faded out, so it never delays a tap, never moves a hit target, never forces a board redraw and never shifts layout. The OAuth and account hand-off is unchanged.
- The snapshot is one `drawImage` of the finished canvas, at a pixel budget of 1 million pixels (a DPR 3 phone canvas is copied at about 0.58 scale), into a texture that is reused between transitions.
- Frame budget gate: when the scene's average frame is over 33.4 ms (below 30 fps) the cover is skipped and the change is instant, as before. A slower device never gets a hitchier transition than no transition.
- QA entry points (`window.__MAZER_QA__.openSettingsOverlay` and the others that change state) skip the cover so scripted captures stay deterministic. After a real pointer tap, capture scripts wait it out with `window.__MAZER_QA__.isUiTransitionActive()` (`waitOutUiTransition` in `scripts/analysis/capture-ui-surfaces.mjs`, called by `clickPoint`).
- Edge beams and diamonds, the completion-time line and the backdrop stars are not touched.

## Code map

- `src/render/uiTransition.ts`: pure plan, frame, snapshot-size, frame-budget and loader-pulse functions.
- `src/render/uiTransitionGhost.ts`: the thin Phaser snapshot image.
- `src/boot/bootSplash.ts` (`fadeOutMazerBootSplash`), `src/boot/bootStatus.ts`, `index.html`: the splash fade and the shared loader period.
- `src/scenes/MenuScene.ts`: `beginUiTransition` called from `openOverlay`, `closeOverlay` and `startPlayMode`; `update()` advances the fade.

## Owner-visible changes

- The in-game "Signing you in" diamond pulse period goes from about 2640 ms to 1200 ms, and the splash dot from 1.4 s to 1.2 s, so both loaders share one period.
- The splash now fades out instead of disappearing at once.

## Not done (follow-ups)

- Panel rise and staggered rows: the menu and overlay objects are not reachable as one group, and a stagger step needs its own motion-scale entry (a separate stacked change).
- Eased hover, press and toggle states on controls, and putting the toast fades (160 / 320 ms) on the duration ladder.

## Evidence

Frame strips (real pointer taps, headless Chromium, 8 frames over about 520 ms, `before-*` is the same build with the cover switched off) are in `docs/ui/evidence/2026-11-13-motion-002/`: `before-*`, `after-*-full` and `after-*-reduced` for start, open and close at 390x844 and 1280x720. Downscaled to keep the folder small. `transition-cost.json` is the A/B of rAF intervals in the 600 ms after a tap, cover off vs on, at DPR 3 and DPR 1, at 1x and 4x CPU throttle.
