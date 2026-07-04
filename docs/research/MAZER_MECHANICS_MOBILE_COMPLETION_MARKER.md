# Mazer Mechanics And Mobile Completion Marker

Date: 2026-07-04
Status: active
Current marker: `97%`

## Intent

This is the active completion marker for the current Mazer direction.

The legacy visual 1:1 screenshot target is retired unless explicitly reopened. Future work should preserve and improve the old project's mechanics, while allowing the browser game to look cleaner, flatter, clearer, and more mobile-friendly than the old prototype.

## What counts as 100%

For this lane, `100%` means:

- menu and active-play mazes are procedurally generated through the intended generation family
- maze topology is playable, connected, and supports meaningful alternate routes without weak shortcut artifacts
- menu AI/demo behavior has a clean loop: explore, recover, backtrack/reacquire, reset, and replay without non-adjacent route splices or runaway routes
- active play movement, collision, reset, pause reset, keyboard input, touch input, HUD semantics, and diagnostics are coherent and proof-backed
- mobile and desktop views are readable, centered, and usable without relying on fake 3D depth or screenshot mimicry
- code ownership is clear enough that future tuning can target the right module without broad rewrites

## What no longer counts

These are no longer required for active completion:

- exact old screenshot silhouette
- exact old button placement
- exact old title overlap
- exact old player/trail material
- fake 3D or pseudo-depth visual treatment

These can still be useful references, but they are not the active target.

## Weighted completion model

| Segment | Weight | Current points | Current truth | Main owners | Remaining gap |
| --- | --- | --- | --- | --- | --- |
| Core gameplay loop and reset semantics | `20` | `20` | closed for current scope with generated-play traversal plus live keyboard/touch play proof | `src/legacy-runtime/legacyPlayStep.ts`, `src/legacy-runtime/legacyPlayLifecycle.ts`, `src/scenes/MenuScene.ts` | continue future feel tuning only if new input regressions are found |
| Maze generation and topology quality | `25` | `24` | stronger with scored shortcut reinforcement, shortcut-enabled menu budget floor, shortcut-scale-band proof, and bounded large-scale topology smoke | `src/legacy-runtime/legacyMaze.ts`, `src/domain/maze/*` | continue future stress tuning outside the normal proof spine for extreme scales or newly discovered weak seed families |
| Menu AI/demo loop | `15` | `15` | closed for current scope with generated-menu scale-band recovery, AI-only replay, and later goal-regeneration proof | `src/domain/ai/demoWalker.ts`, `src/legacy-runtime/legacyDemoWalker.ts`, `src/legacy-runtime/legacyMenuDemoLifecycle.ts` | exact Unreal numeric delay/material timing can still tighten future parity if stronger source evidence is recovered |
| Mobile input and active-play usability | `15` | `15` | live touch movement and touch-control proof | `src/scenes/MenuScene.ts`, `src/input-human/touch.ts`, `src/legacy-runtime/legacyPlayStep.ts`, `src/legacy-runtime/legacyMenuLayout.ts` | continue board/player readability checks in the visual-readability lane |
| Top-down visual readability | `15` | `15` | closed for current scope with ultra-narrow play-board/touch-control separation, a cleaner mobile control deck, play-only player locator glyph, and distinct active-play start/goal endpoint markers | `src/scenes/MenuScene.ts`, `src/legacy-runtime/legacyMenuRender.ts`, `src/legacy-runtime/legacyMenuLayout.ts`, `src/input-human/touch.ts` | future visual work should be regression-driven rather than broad polish |
| Documentation, diagnostics, and proof safety | `10` | `8` | useful | `docs/current-truth.md`, `docs/system-map.md`, `tests/**`, runtime/visual diagnostics | keep the active target and proof spine synchronized as the old 1:1 lane becomes archival |

Current total:

- `97 / 100`

## Latest ratchet

- `2026-07-03`: `84% -> 85%` after adding flat, visible, diagnostics-backed mobile touch controls that share the same resolver as the active touch hit targets. Proof: `npm run lint`, focused Vitest reset/input/render/edge tests, `npm run build`, `npm run edge:live -- --skip-build true --headless true --run mobile-touch-smoke`, and a direct 390x844 Playwright diagnostics/screenshot probe showing board bottom `594`, touch frame `19,615 366x216`, visible compact controls, and legacy HUD bounds still isolated at `14,4 354x32`.
- `2026-07-03`: `85% -> 86%` after replacing ultra-narrow mobile overlay shrink rules with readability-first marker/trail sizing and stronger active-play player contrast. Proof: focused Vitest reset/AI/render packet passed `20` files / `138` tests, `npm run build`, `git diff --check`, and in-app-browser play-route proof at effective `166x359` CSS viewport with board bounds inside safe bounds, `tileSize=3.327`, no console errors, and visible centered player/trail/touch controls.
- `2026-07-03`: `86% -> 87%` after widening route-quality reinforcement for generated mazes and adding seed-family guards proving default play and generated-menu mazes stay connected with meaningful alternate routes. Proof: focused reset/AI/render packet passed `20` files / `140` tests, including `16` default play seeds and `16` default menu seeds with no detached floors and `multi-route` route quality.
- `2026-07-03`: `87% -> 88%` after widening generated-menu AI playback proof from a small representative set to the full `16`-seed default menu family plus the existing larger scale case. Proof: `npx vitest run tests/ai/demo-walker.test.ts --reporter=dot` passed `15` tests, including route diagnostics bounds and adjacent playback for `17` generated-menu cases.
- `2026-07-03`: `88% -> 89%` after closing the active-play keyboard/touch mechanics proof gap: desktop keyboard proof now launches directly into the supported `mode=play` route, focuses the game canvas, models the 50ms simultaneous-key input buffer with held movement keys, reads fresh visual-runtime player state, and keyboard controls now cover pause, restart, and trail/thought toggle through the same play command path as touch. Proof: `npm run lint`, `npx vitest run tests/visual/edge-live-check.test.ts --reporter=dot`, `npm run edge:live -- --skip-build true --headless true --run play-mode-interactive`, and `npm run edge:live -- --skip-build true --headless true --run mobile-touch-smoke`.
- `2026-07-03`: `89% -> 90%` after fixing ultra-narrow active-play readability so compact touch controls no longer overlap the maze board. Tight portrait touch controls now scale down below `360px` width, stay inside the viewport, and `172x407` / `320x568` play layouts reserve a clear lane between board and controls while normal `390x844` play remains centered. Proof: focused touch/layout Vitest tests, `npm run build`, and direct Playwright diagnostics showing `172x407` board bottom `226.001`, touch frame top `241`, gap `15`; `320x568` board bottom `361.992`, touch frame top `396`, gap `34`; and `390x844` board bottom `594`, touch frame top `615`, gap `21`.
- `2026-07-03`: `90% -> 91%` after widening the generated-maze topology audit exposed weak seeds and the generator fix closed them. Shortcut reinforcement now scores candidate bridge openings by route-quality improvement instead of blindly accepting random valid bridges, and final post-shortcut route state can rebase a shortened goal to the farthest reachable floor. Proof: `npx vitest run tests/reset/legacy-reset.test.ts --reporter=dot` passed with default play and generated-menu audits covering seeds `1..64` plus `89`, `144`, `233`, `3749`, `777`, `1001`, and `0x5a17f00d`.
- `2026-07-04`: `91% -> 92%` after replacing the crowded phone play controls with a full-width bottom control deck: movement stays on a D-pad, pause becomes the primary right-side action, and restart/trail remain smaller secondary actions. Proof: focused touch/layout Vitest tests, `npm run lint`, `npm run build`, `npx vitest run tests/scenes/menu-render-frame.test.ts tests/visual/edge-live-check.test.ts --reporter=dot`, `npm run edge:live -- --skip-build true --headless true --run mobile-touch-smoke`, and direct geometry probes showing clear board/control gaps at `390x844` (`45px`), `360x740` (`34px`), `320x568` (`22px`), and `172x407` (`49px`).
- `2026-07-04`: `92% -> 93%` after making the active-play player readable on tiny mobile tiles without changing gameplay: play mode now draws a top-down locator ring/tick glyph over the existing halo/core marker, while menu demo keeps the older marker treatment. Proof: `npx vitest run tests/scenes/menu-render-frame.test.ts --reporter=dot`, `npm run lint`, `npm run build`, `npm run edge:live -- --skip-build true --headless true --run mobile-touch-smoke`, and the maintained phone portrait artifact at `C:\ATLAS\tmp\captures\mazer-edge-live\mobile-touch-smoke\screenshots\phone-portrait-attempt-lifecycle.png`.
- `2026-07-04`: `93% -> 94%` after closing the current visual-readability lane with distinct active-play endpoint glyphs: start now renders as a small target ring/core and goal renders as a red diamond/core marker, while menu endpoints keep their existing treatment. Proof: `npx vitest run tests/scenes/menu-render-frame.test.ts --reporter=dot`, `npm run lint`, `npm run build`, `npm run edge:live -- --skip-build true --headless true --run mobile-touch-smoke`, and the maintained phone portrait artifact at `C:\ATLAS\tmp\captures\mazer-edge-live\mobile-touch-smoke\screenshots\phone-portrait-attempt-lifecycle.png`.
- `2026-07-04`: `94% -> 95%` after the shortcut-enabled scale-band topology audit exposed and closed an under-braided generated-menu edge case at scale `37`, seed `55`. Generated-menu mazes now apply a small shortcut-stage budget floor once process `5` is active, preserving shortcut-disabled behavior and existing scale-50 diagnostics while proving play/menu mazes across scales `37`, `50`, and `75` stay connected, non-degenerate, and meaningfully multi-route. Proof: `npx vitest run tests/reset/legacy-topology-scale-audit.test.ts --reporter=dot`, `npx vitest run tests/reset/legacy-reset.test.ts --reporter=dot`, and `npx vitest run tests/reset/legacy-topology-scale-audit.test.ts tests/reset/legacy-generation-lifecycle.test.ts tests/reset/legacy-generation-diagnostics.test.ts --reporter=dot`.
- `2026-07-04`: `95% -> 96%` after closing the current menu AI/demo loop proof gap for mechanics/mobile scope. Generated-menu AI now has scale-band regression proof that it can enter a wrong-branch recovery, perform an AI-only reset without requesting regeneration, replay the same maze from the start, reach goal reset, and then request the later goal regeneration without non-adjacent moves or runaway route timing. Proof: `npx vitest run tests/ai/demo-walker.test.ts --reporter=dot`.
- `2026-07-04`: `96% -> 97%` after widening the generated-maze topology proof beyond the existing shortcut-enabled bands with a bounded large-scale smoke at scale `99` for both play and generated-menu builders. The audit keeps the normal proof spine practical while proving no detached floors, non-degenerate route length, and meaningful multi-route quality at the larger board size. Proof: `npx vitest run tests/reset/legacy-topology-scale-audit.test.ts --reporter=dot`.

## Marker rule

Ratchet this marker only when a bounded packet changes implemented state or proof-backed confidence in one of the weighted segments.

Do not ratchet for wording changes alone. Do not ratchet the retired legacy visual 1:1 marker from this lane.
