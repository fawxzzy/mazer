# Mazer Legacy Menu Composition Parity Packet

Date: 2026-06-29
Lane: legacy Unreal truth -> web app reset/port
Status: landed

## Scope

Bounded front-door parity pass only:

- tighten legacy menu composition math
- deepen slab/frame treatment
- reduce front-door button chrome toward the legacy screenshots
- expand the repo-local system map for future 1:1 passes

## Files touched

- `src/legacy-runtime/legacyMenuLayout.ts`
- `src/scenes/MenuScene.ts`
- `tests/reset/legacy-menu-layout.test.ts`
- `docs/system-map.md`

## What changed

1. Board/title/button composition was tightened in `legacyMenuLayout.ts`.
   - board scale nudged up on landscape
   - board top moved slightly higher
   - title anchor moved higher inside the board
   - front-door button widths/heights narrowed so the labels read closer to the screenshots
2. Menu presentation was tightened in `MenuScene.ts`.
   - title lockup opacity and shadow placement were reduced toward the legacy translucency
   - slab shell side/bottom framing was made heavier and less flat
   - grid overlay was softened
   - `Exit / Start / Options` buttons were made more outline-led and less oversized
3. The practical owner map in `docs/system-map.md` now includes:
   - menu-scene render/update order
   - parity hotspot routing for common visible misses

## Proof intent

This packet does not claim final 1:1 closure.

It is a composition/presentation correction pass that keeps:

- legacy gameplay truth preserved
- fixed menu snapshot ownership preserved
- one-overlay rule preserved
- shipping/runtime rewrite out of scope

## Expected validation spine

- `npm run test -- tests/reset/legacy-menu-layout.test.ts tests/reset/legacy-reset.test.ts`
- `npm run lint`
- `npm run visual:matrix -- --preset core --skip-build true`
- `npm run edge:live -- --skip-build true --headless true --run core-only-watch`
- `npm run verify`
