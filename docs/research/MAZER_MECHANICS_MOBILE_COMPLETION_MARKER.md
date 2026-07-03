# Mazer Mechanics And Mobile Completion Marker

Date: 2026-07-03
Status: active
Current marker: `86%`

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
| Core gameplay loop and reset semantics | `20` | `19` | strong with generated-play traversal proof | `src/legacy-runtime/legacyPlayStep.ts`, `src/legacy-runtime/legacyPlayLifecycle.ts`, `src/scenes/MenuScene.ts` | final touch-first/live play-feel proof across keyboard and pointer input after visual/layout tuning |
| Maze generation and topology quality | `25` | `20` | strong with weak-route guard | `src/legacy-runtime/legacyMaze.ts`, `src/domain/maze/*` | continue tuning shortcut/alternate-route quality across wider seed families without disconnected floors, shallow loops, or degenerate goals |
| Menu AI/demo loop | `15` | `13` | source-shaped with generated-menu seed proof | `src/domain/ai/demoWalker.ts`, `src/legacy-runtime/legacyDemoWalker.ts`, `src/legacy-runtime/legacyMenuDemoLifecycle.ts` | continue proving clean recovery/replay behavior across wider generated menu seed families |
| Mobile input and active-play usability | `15` | `15` | live touch movement and touch-control proof | `src/scenes/MenuScene.ts`, `src/input-human/touch.ts`, `src/legacy-runtime/legacyPlayStep.ts`, `src/legacy-runtime/legacyMenuLayout.ts` | continue board/player readability checks in the visual-readability lane |
| Top-down visual readability | `15` | `11` | improved with ultra-narrow player/trail/start/goal readability proof | `src/scenes/MenuScene.ts`, `src/legacy-runtime/legacyMenuRender.ts`, `src/legacy-runtime/legacyMenuLayout.ts` | continue tuning board, floors, walls, player, trail, start, and goal crispness across wider mobile and desktop surfaces |
| Documentation, diagnostics, and proof safety | `10` | `8` | useful | `docs/current-truth.md`, `docs/system-map.md`, `tests/**`, runtime/visual diagnostics | keep the active target and proof spine synchronized as the old 1:1 lane becomes archival |

Current total:

- `86 / 100`

## Latest ratchet

- `2026-07-03`: `84% -> 85%` after adding flat, visible, diagnostics-backed mobile touch controls that share the same resolver as the active touch hit targets. Proof: `npm run lint`, focused Vitest reset/input/render/edge tests, `npm run build`, `npm run edge:live -- --skip-build true --headless true --run mobile-touch-smoke`, and a direct 390x844 Playwright diagnostics/screenshot probe showing board bottom `594`, touch frame `19,615 366x216`, visible compact controls, and legacy HUD bounds still isolated at `14,4 354x32`.
- `2026-07-03`: `85% -> 86%` after replacing ultra-narrow mobile overlay shrink rules with readability-first marker/trail sizing and stronger active-play player contrast. Proof: focused Vitest reset/AI/render packet passed `20` files / `138` tests, `npm run build`, `git diff --check`, and in-app-browser play-route proof at effective `166x359` CSS viewport with board bounds inside safe bounds, `tileSize=3.327`, no console errors, and visible centered player/trail/touch controls.

## Marker rule

Ratchet this marker only when a bounded packet changes implemented state or proof-backed confidence in one of the weighted segments.

Do not ratchet for wording changes alone. Do not ratchet the retired legacy visual 1:1 marker from this lane.
