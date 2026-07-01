# Mazer Legacy Maze Shortcut Route-Span Packet - 2026-07-01

## Scope

Owner repo only: `repos/mazer`.

This packet tightens the active browser-native maze shortcut pass without claiming a literal Unreal generator port.

Touched owner chain:

- `src/domain/maze/core.ts`
- `tests/maze/maze-domain.test.ts`
- `docs/current-truth.md`
- `docs/research/MAZER_LEGACY_WEB_PARITY_MATRIX.md`
- `docs/research/MAZER_LEGACY_ONE_TO_ONE_COMPLETION_MARKER.md`
- `docs/system-map.md`

## Change

The braided route-aware bypass pass now rejects shortcut candidates unless the closed neighbor can reconnect to the canonical route at a separated route position.

This means an accepted shortcut must prove a route span before opening the wall, instead of merely proving a local loop distance.

The focused maze-domain test now verifies:

- route-affecting bypasses remain present
- more than one canonical path edge can be bypassed
- bypassable edges span at least two route bands

## Marker Review

The legacy 1:1 completion marker remains held at `70%`.

Reason:

- this is a meaningful shortcut-topology hardening pass
- it improves the "more than one way to the end" behavior
- it is still an improved browser-native equivalent, not a recovered line-for-line Unreal `CreateShortCuts` implementation

## Boundaries

No deploy.

No live resource mutation.

No Supabase, Vercel, or GitHub app-resource creation.

No duplicate Mazer identity.

No menu visual module mutation in this packet.
