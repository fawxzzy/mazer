# Mazer Legacy Active-Play Dynamic Corridor Overlay Packet

Date: 2026-07-02
Mode: owner-repo visual/runtime material tightening
Branch: `codex/mazer-pass2-menu-parity`

## Scope

This packet tightens one active-play visual regression in the generated play surface.

Touched owner chain:

- `src/scenes/MenuScene.ts`
- `tests/scenes/menu-render-frame.test.ts`
- `docs/current-truth.md`
- `docs/research/MAZER_LEGACY_ONE_TO_ONE_COMPLETION_MARKER.md`
- `docs/research/MAZER_LEGACY_WEB_PARITY_MATRIX.md`

## Problem

The active-play static maze path had already moved away from square debug-cell fills toward connected corridor rendering, but the active dynamic overlays still rendered through the generic `fillTile()` path:

- played trail cells
- start marker
- goal marker
- player marker

That meant play mode could still read as a blocky square overlay layer even after the board underneath was improved.

## Runtime Change

Active play now has a play-specific dynamic corridor overlay lane:

- trail overlays use connected neighbor-aware edge/core strokes
- play marker overlays use inset marker tiles instead of full square fills
- menu dynamic overlay behavior remains in its existing menu-specific lane
- topology, movement, collision, reset behavior, and maze generation are unchanged

## Proof Contract

Focused tests prove:

- active play still uses connected static corridors
- active play dynamic trail overlays use the play corridor helper
- active play marker overlays use the inset helper
- the prior square trail/player fill calls are not present

## Marker Decision

The repo-wide legacy 1:1 marker remains held at `93%`.

Reason:

This closes a visible active-play overlay regression and improves mobile/desktop play readability, but it does not close final play-board material parity, exact legacy player sprite treatment, or complete active-play feel parity.

## Validation

Passed:

```bash
npm exec vitest -- run tests\scenes\menu-render-frame.test.ts tests\reset\legacy-reset.test.ts tests\reset\legacy-play-step.test.ts --reporter=dot
git diff --check
```

Browser check:

- localhost tab reloaded at `http://127.0.0.1:4173/?runtimeDiagnostics=1&v=1782925533705-route-quality-bound`
- page title: `Mazer`
- console errors/warnings: none captured
- visual diagnostics were not present immediately after reload, so visual proof remains code/test/build-backed for this packet until the maintained server is rebuilt or restarted

## Boundaries

- No deploy.
- No live resource mutation.
- No Supabase or Vercel app-resource mutation.
- No duplicate Mazer identity.
- No key rotation.
