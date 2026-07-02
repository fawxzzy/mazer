# Mazer Menu Trail Fade Tail Proof Packet

Date: 2026-07-02

## Scope

This packet tightens the browser-equivalent proof for the old tile material-revert lane in the menu demo loop.

The extracted Unreal source shows `AGridSquare::StartDelay()` clearing and setting a timer that later calls `SetOriginal()` using `TileColorRevertDelay`. The exact Blueprint `_TileColorRevertDelay` value remains unrecovered, so the web runtime cannot honestly claim line-for-line material timer parity.

The current web equivalent is a visible trail-tail contract:

- `toggleTrailFade: true` bounds the visible trail to the configured tail.
- `toggleTrailFade: false` keeps the persistent projected trail.
- active play already had a focused fade-tail test.
- menu demo bootstrap/advance did not have direct small-tail proof before this packet.

## Landed Change

- Added focused tests in `tests/reset/legacy-menu-demo-lifecycle.test.ts` proving:
  - `createLegacyMenuDemoBootstrap()` bounds trail output when trail fade is enabled.
  - `advanceLegacyMenuDemoFrame()` bounds trail output when trail fade is enabled.
  - persistent trail mode keeps more than the supplied small tail.
  - the visible trail head still matches the current player.

## Marker Decision

The legacy 1:1 marker remains at `93%`.

This packet improves proof coverage for the browser-safe trail-tail equivalent but does not recover the exact Unreal `_TileColorRevertDelay` numeric value or material transition timing.

## Boundaries

- No deploy.
- No live resource mutation.
- No Supabase or Vercel app-resource mutation.
- No duplicate Mazer identity.
- No key rotation.
