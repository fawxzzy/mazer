# Mazer Legacy Menu Draw Stage Cadence Packet - 2026-07-01

## Scope

Owner-repo packet for the legacy 1:1 lane.

Touched module:

- generation lifecycle exactness
- menu stage-6 draw visibility

Owner chain:

- `src/legacy-runtime/legacyGenerationLifecycle.ts`
- `src/scenes/MenuScene.ts#armLegacyMenuStaticDrawStage()`
- `src/scenes/MenuScene.ts#advanceLegacyMenuStaticDrawStage(time)`
- `tests/reset/legacy-reset.test.ts`

## Change

The stage-6 menu static-board row reveal now advances behind a menu-only row cadence gate instead of advancing one row on every browser update frame.

This preserves:

- stage `6` as row-slice draw truth
- batch size `1`
- row-unit diagnostics
- browser-native topology builder boundaries

It changes the visible front-door generation proof from frame-rate-fast row advancement to a paced reveal that stays inspectable on the maintained localhost preview.

## Proof

Local proof run:

- `npm run test -- tests/reset/legacy-reset.test.ts tests/reset/legacy-generation-lifecycle.test.ts tests/reset/legacy-generation-diagnostics.test.ts tests/scenes/menu-runtime-diagnostics.test.ts`
- `npm run build`

Side-browser proof on the single maintained `4173` preview:

- URL: `http://127.0.0.1:4173/?runtimeDiagnostics=1`
- observed diagnostics: `draw rows 0/25`, then `13/25`, then `25/25`
- AI diagnostics remained present: wrong branch, backtrack, and recovery counters stayed visible

## Marker reevaluation

Current repo-wide 1:1 marker:

- `70%`

Touched weighted segment:

- Generation lifecycle exactness

Point change:

- none

Reason:

- this packet improves a real runtime timing/readability seam, but the exact Unreal generation timing remains unrecovered
- the browser builder still resolves maze topology before the row reveal, so this does not close the line-for-line `CreateGrid` / `MapPath` / `CreatePath` / `CreateShortCuts` gap

## Boundaries

Preserved:

- no topology rewrite
- no deploy
- no Supabase or Vercel surface
- no duplicate app identity
- no root marker ratchet

Next honest seam:

- continue modular legacy review with either final screenshot-grade board/material review or active-play HUD exactness
