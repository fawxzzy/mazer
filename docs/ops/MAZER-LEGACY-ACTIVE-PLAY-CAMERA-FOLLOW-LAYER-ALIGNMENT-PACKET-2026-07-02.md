# Mazer Legacy Active-Play Camera-Follow Layer Alignment Packet

Date: 2026-07-02
Mode: owner-repo active-play correctness and visual alignment fix
Branch: `codex/mazer-pass2-menu-parity`

## Scope

This packet closes one active-play camera-follow layer mismatch.

Touched owner chain:

- `src/scenes/MenuScene.ts`
- `src/legacy-runtime/legacyOverlayToggleFields.ts`
- `tests/scenes/menu-render-frame.test.ts`
- `tests/reset/legacy-overlay-toggle-fields.test.ts`
- `docs/current-truth.md`
- `docs/research/MAZER_LEGACY_ONE_TO_ONE_COMPLETION_MARKER.md`
- `docs/research/MAZER_LEGACY_WEB_PARITY_MATRIX.md`

## Problem

`resolveBoardOffset()` was already used by active-play dynamic overlays, HUD positioning, and pointer-bound admission, but `drawStaticBoard()` still rendered the static maze at the unshifted layout origin.

When camera follow was enabled, that could separate the player/trail layer from the maze layer.

## Runtime Change

`drawStaticBoard()` now applies the same camera-follow board offset as the dynamic board layer.

`tryMovePlayer()` marks the static board dirty when camera follow is active, because a player move changes the offset and therefore the static maze origin.

`applyLegacyOverlayToggleField('toggleCameraFollow')` now reports `affectsBoardStatic: true` so toggle-driven refresh scope matches runtime truth.

## Proof Contract

Focused tests prove:

- camera-follow toggle affects the static and dynamic board lanes
- static board drawing resolves the shared camera-follow offset
- active movement marks static board dirty when camera follow is enabled
- active play render-frame guards still pass

## Marker Decision

The repo-wide legacy 1:1 marker remains held at `93%`.

Reason:

This closes a real active-play layer alignment bug, but final active-play feel, final generated play-board material parity, and exact camera behavior remain open.

## Validation

Passed:

```bash
npm exec vitest -- run tests\scenes\menu-render-frame.test.ts tests\reset\legacy-overlay-toggle-fields.test.ts tests\reset\legacy-reset.test.ts --reporter=dot
git diff --check
```

## Boundaries

- No deploy.
- No live resource mutation.
- No Supabase or Vercel app-resource mutation.
- No duplicate Mazer identity.
- No key rotation.
