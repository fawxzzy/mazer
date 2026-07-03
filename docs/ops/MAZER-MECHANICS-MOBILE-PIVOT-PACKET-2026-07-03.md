# Mazer Mechanics/Mobile Pivot Packet

Date: 2026-07-03
Branch: `codex/mazer-mechanics-mobile-pivot`

## Scope

Retire screenshot-grade visual 1:1 as the active target and move Mazer to a mechanics-first, mobile-clean direction.

## Completed

- Updated repo rules and current truth so old legacy screenshots are archival reference unless screenshot parity is explicitly reopened.
- Added `docs/research/MAZER_MECHANICS_MOBILE_COMPLETION_MARKER.md` as the active marker at `76%`.
- Marked the old legacy 1:1 marker as retired at `93%`.
- Updated system-map routing so future work targets mechanics, topology, mobile playability, and top-down readability.
- Reworked the play/menu board palette into a flatter, higher-contrast top-down lane.
- Made active-play trail and start/goal overlays more readable on small tiles.
- Enlarged and recolored the player marker for mobile visibility.
- Updated render-frame and marker tests to enforce the new active contract.

## Proof

- `npm exec vitest -- run tests\scenes\menu-render-frame.test.ts tests\reset\legacy-marker.test.ts --reporter=dot`
  - 2 files / 17 tests passed
- `npm run verify`
  - 20 files / 132 tests passed
  - production build passed
- `npm run edge:live -- --skip-build true --headless true --run core-only-play`
  - phone portrait board overflow: pass
  - phone portrait HUD overlap: pass
  - phone portrait HUD clip: pass
  - desktop board overflow: pass
  - desktop HUD overlap: pass
  - desktop HUD clip: pass

## Marker

Active mechanics/mobile marker:

- `76%`

Retired legacy visual 1:1 marker:

- `93%`

No future mechanics/mobile packet should ratchet the retired marker.

## Remaining Work

- Tune maze-generation shortcut quality for meaningful alternate routes without weak local loops.
- Continue menu AI generated-maze proof for clean explore/recover/backtrack/replay behavior.
- Tighten active play feel on touch-first mobile.
- Keep improving board sizing, player/trail readability, and HUD clarity without reintroducing fake 3D depth.
