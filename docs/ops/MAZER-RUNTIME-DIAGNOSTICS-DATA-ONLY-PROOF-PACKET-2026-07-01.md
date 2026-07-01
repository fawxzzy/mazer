# Mazer Runtime Diagnostics Data-Only Proof Packet

Date: 2026-07-01
Status: landed
Mode: owner-repo only

## Why

The maintained in-chat browser was opened with `runtimeDiagnostics=1`, which intentionally enabled the repo-owned runtime proof lane. That lane was still creating a visible `<pre>` diagnostics panel in the game viewport.

That panel was useful proof scaffolding, but it was not part of legacy Mazer UI. In mobile play it read as a stray text box at the bottom of the game, and in earlier desktop play it had already interfered with HUD inspection.

## Changed

- Removed visible runtime diagnostics DOM-panel creation from `src/scenes/menuRuntimeDiagnostics.ts`.
- Preserved machine-readable diagnostics through:
  - `window.__MAZER_RUNTIME_DIAGNOSTICS__`
  - `data-mazer-runtime-diagnostics`
- Updated runtime diagnostics tests so publishing diagnostics fails if it attempts to append visible DOM children.
- Updated current truth, system map, parity matrix, and the 1:1 marker language to treat diagnostics as data-only proof.

## Marker decision

The Mazer legacy 1:1 marker remains `87%`.

Reason: this removes a non-legacy proof artifact from the visible game and prevents future visual pollution, but it does not close a new weighted behavior or screenshot segment beyond the HUD segment that was already maxed.

## Boundaries

- No gameplay behavior changed.
- No maze topology changed.
- No deploy was attempted.
- No Supabase, Vercel, or app-resource mutation was performed.
- No duplicate Mazer identity was created.

## Verification

```bash
npm exec vitest -- run tests/scenes/menu-runtime-diagnostics.test.ts tests/scenes/menu-render-frame.test.ts tests/reset/legacy-marker.test.ts --reporter=dot
npm run lint
```

Additional browser proof should use the maintained preview route with `runtimeDiagnostics=1` and confirm:

- no `#mazer-runtime-diagnostics` element exists
- `data-mazer-runtime-diagnostics` still exists
- the active play HUD remains visible
