# Mazer Legacy Menu Plate + Edge-Live Realignment Packet

## Scope

- move the menu front door closer to the legacy screenshots without reopening play-mode generation work
- restore the repo-owned edge-live proof lane so it understands the current reset-lane diagnostics shape
- strengthen the durable system map so future 1:1 tweaks stay tied to the real owner surfaces

## Why

After the earlier menu parity passes, the biggest remaining visible menu miss was no longer just placement.

The board was still reading with the wrong role hierarchy:

- too much black-field / tunnel-negative-space read
- not enough gray plate mass
- attract-trail focus still showed too much upper-left route instead of the lower-right legacy emphasis

At the same time, the `edge:live` proof lane had drifted behind the current reset-lane runtime contract:

- it still expected the older richer hosted diagnostics shape
- the reset-lane menu now publishes the leaner `__MAZER_VISUAL_DIAGNOSTICS__` front-door shape
- result: live route proof timed out even though the actual menu route was loading

## Landed

- `src/scenes/MenuScene.ts`
  - flipped the menu-only board role hierarchy toward a gray plate with darker carved routes
  - softened the title lockup opacity so it reads closer to the translucent legacy overlay
  - added a subtle inner wall texture for menu-only board mass without changing play-mode semantics

- `src/legacy-runtime/legacyDemoWalker.ts`
  - pushed the fixed menu-snapshot preroll later so the visible attract trail biases more toward the lower-right legacy composition

- `scripts/visual/edge-live-check.mjs`
  - now accepts reset-lane visual diagnostics as a valid ready state
  - treats missing hosted HUD bounds as acceptable for the reset-lane menu surface
  - skips hosted end-window capture when the route is using reset-lane diagnostics instead of the older attempt/arrival packet

- `tests/visual/edge-live-check.test.ts`
  - added direct proof for reset-lane diagnostics readiness and fallback verdict behavior

- `docs/system-map.md`
  - added reset-lane state ownership
  - added end-to-end flow mapping
  - added trigger-to-owner routing

## Boundaries Preserved

- the fixed menu snapshot remains menu-only truth
- generated play mazes remain separate from screenshot parity work
- shipping gameplay/runtime claims were not widened by this packet
- no duplicate app identity or infra work happened
- no ATLAS-root governance packet was opened from this owner-repo pass

## Validation

- `npm run test -- tests/reset/legacy-menu-layout.test.ts tests/reset/legacy-reset.test.ts`
- `npm run test -- tests/visual/edge-live-check.test.ts`
- `npm run lint`
- `npm run build`
- `npm run verify`
- `npm run visual:matrix -- --preset core --skip-build true`
- `npm run edge:live -- --skip-build true --headless true --run core-only-watch`

Latest visual proof artifacts:

- layout matrix:
  - `tmp/captures/mazer-layout-matrix/2026-06-29T08-53-29-789Z`
- edge live:
  - `tmp/captures/mazer-edge-live/core-only-watch`

## Current Truth After This Pass

- the menu front door reads materially closer to the legacy plate/trench composition
- the attract-trail focus is better aligned to the lower-right legacy screenshot emphasis
- the repo-owned live proof lane works again against the current reset-lane diagnostics contract
- the repo now has a stronger whole-app map for future 1:1 tweaks

## Still Open

- exact fixed-snapshot geometry still does not fully match `legacy/screenshots/menu-03.png` and `menu-04.png`
- exact title overlap and board silhouette balance still need another screenshot-directed pass
- full legacy-exact demo/path semantics remain separate work from this presentation/proof realignment

## Next Honest Slice

- if the next miss is still board silhouette, return to `src/legacy-runtime/legacyMenuSnapshot.ts`
- if the next miss is title/button/shell balance, stay in `src/legacy-runtime/legacyMenuLayout.ts` and `src/scenes/MenuScene.ts`
- if the next miss is attract-route behavior rather than composition, continue in `src/legacy-runtime/legacyDemoWalker.ts` and `src/domain/ai/demoWalker.ts`
