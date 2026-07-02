# Mazer Legacy Menu Dynamic Overlay Corridor-Frame Packet

Date: 2026-07-01
Lane: legacy Unreal truth -> web app reset/port
Module: menu board dynamic overlay material

## Purpose

The desktop screenshot comparison still showed one obvious board/material mismatch after the narrow trench-inset pass:

- the current menu trail/player/goal overlays rendered as full square cells
- the restored legacy screenshots read as thinner cyan/player marks inside the maze corridor space

This packet keeps the scope bounded to menu-mode dynamic overlays. It does not change play-mode movement, maze topology, demo AI state, or static board geometry.

## Changed Surfaces

- `src/scenes/MenuScene.ts`
  - menu-mode trail rendering now uses `resolveLegacyMenuPathRenderFrames(...)`
  - menu-mode trail segments draw a darker edge pass plus a narrower cyan core pass
  - menu-mode start, goal, and player markers now draw with an inset instead of full-tile square fill
  - play-mode dynamic rendering still uses the existing full-cell tile path
- `tests/scenes/menu-render-frame.test.ts`
  - guards that menu dynamic overlays stay in the corridor-frame rendering lane
- `docs/current-truth.md`
- `docs/research/MAZER_LEGACY_WEB_PARITY_MATRIX.md`
- `docs/research/MAZER_LEGACY_ONE_TO_ONE_COMPLETION_MARKER.md`

## Marker Re-Evaluation

Touched weighted segment:

- `Menu screenshot composition and board presentation`

Result:

- marker remains held at `70%`

Reason:

This reduces one real visible mismatch: the full-square cyan/player marker read. It does not close the full screenshot-grade legacy board target because the current web board still differs in dense corridor geometry, slab material, and exact legacy trail/player sprite treatment.

## Boundaries

- no production deploy
- no Supabase or Vercel resource mutation
- no duplicate app identity
- no play-mode behavior change
- no topology rewrite
- no marker ratchet

## Proof

Expected local proof after this packet:

```bash
npm run test -- tests/scenes/menu-render-frame.test.ts tests/reset/legacy-marker.test.ts
npm run verify
```

Expected browser proof:

```text
http://127.0.0.1:4173/?runtimeDiagnostics=1
dynamic cyan/menu markers no longer occupy the full tile square in menu mode
runtime diagnostics still report trail, AI counters, and stage-6 draw progress
```
