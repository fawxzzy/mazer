# Mazer Visual Diagnostics Board Offset Packet - 2026-07-02

## Scope

Owner-repo packet for active-play proof alignment.

Touched owner chain:

- `src/scenes/MenuScene.ts`
- `tests/scenes/menu-render-frame.test.ts`
- `docs/current-truth.md`
- `docs/research/MAZER_LEGACY_ONE_TO_ONE_COMPLETION_MARKER.md`
- `docs/research/MAZER_LEGACY_WEB_PARITY_MATRIX.md`
- `docs/system-map.md`

## Change

`publishVisualDiagnostics()` now applies `resolveBoardOffset()` when reporting board bounds.

This keeps visual diagnostics aligned with the active-play camera-follow board position already used by:

- static board rendering
- dynamic trail/player rendering
- HUD geometry
- pointer-bound admission

## Why

Camera-follow already moved the rendered play board, but visual diagnostics still described the unshifted layout rectangle.

That could make browser proof disagree with the actual drawn board, especially in the narrow in-chat preview where camera/centering issues are being actively reviewed.

## Marker Re-Evaluation

Current 1:1 marker: `93%`.

Touched segment:

- `Active play movement and win/reset loop`

Point change:

- none

Reason:

- This closes a proof/readback drift, not a gameplay behavior gap.
- Final active-play feel, exact camera behavior, and generated play-board material parity remain open.

## Validation

Focused:

```powershell
npm run test -- tests/scenes/menu-render-frame.test.ts
```

Result:

- `20` files passed
- `125` tests passed

Build:

```powershell
npm run build
```

Result:

- passed

Browser proof:

- maintained single in-app tab: `http://127.0.0.1:4173/?content=core-only&mode=play&theme=aurora&runtimeDiagnostics=1&v=active-input-buffer`
- production preview reloaded after build
- DOM runtime diagnostics reported mode `play`
- DOM runtime diagnostics reported play board bounds approximately:
  - left `2`
  - top `42`
  - right `171.001`
  - bottom `211.001`
  - tileSize `3.449`

Note:

- current browser automation still does not reliably expose `window.__MAZER_VISUAL_DIAGNOSTICS__`; this packet therefore guards the visual-diagnostics code path with a source-level render-frame test and keeps the broader visual-DOM fallback as a separate possible packet.
