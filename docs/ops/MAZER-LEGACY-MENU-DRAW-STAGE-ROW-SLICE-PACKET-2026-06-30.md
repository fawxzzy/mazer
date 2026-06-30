# Mazer Legacy Menu Draw Stage Row-Slice Packet

Date: 2026-06-30
Repo: `fawxzzy/mazer`
Branch: `codex/mazer-pass2-menu-parity`
Mode: owner-repo only

## Packet

Segment:

- `Generation lifecycle exactness`

Owner chain:

- `docs/legacy/gameplay-spec.md`
- `src/legacy-runtime/legacyGenerationLifecycle.ts`
- `src/scenes/MenuScene.ts`
- `tests/reset/legacy-generation-lifecycle.test.ts`
- `tests/reset/legacy-generation-diagnostics.test.ts`
- `tests/reset/legacy-reset.test.ts`

## Change

Menu static-board drawing now applies the stage-6 row-slice contract.

The lifecycle plan already marked menu stage `6` (`Draw`) as:

- `executionKind: 'row-slice'`
- `batchSize: 1`
- `batchUnit: 'rows'`

Before this packet, `MenuScene.drawStaticBoard()` still rendered every static maze row in one completed pass after generation application.

After this packet, menu generation arms a row cursor through `armLegacyMenuStaticDrawStage()`, advances it through `advanceLegacyMenuStaticDrawStage()`, and limits static-board tile drawing by the active row cursor until the menu board is fully revealed.

Play mode remains full-stage because the play generation execution plan still marks the draw stage as `full-stage`.

## Boundary

This does not claim a line-for-line Unreal topology generator port.

The browser builder still resolves maze topology before the stage-6 row reveal. The completed change is narrower: the menu scene now observes the already-owned stage-6 draw cadence instead of flattening that visual stage into a single completed static pass.

## Marker

Marker ratchets:

- from `91%`
- to `92%`

Reason:

- this packet changes runtime-visible behavior, not only diagnostics or prose
- menu stage `6` now advances by row batches from the lifecycle execution plan
- visual diagnostics expose the active draw-stage cursor
- generation lifecycle ownership is now aligned; remaining 1:1 gaps are active play movement/reset, demo backtracking/reset, screenshot-grade menu material, and HUD parity

## Validation

Focused validation:

```bash
npm run test -- tests/scenes/menu-runtime-diagnostics.test.ts tests/reset/legacy-reset.test.ts tests/reset/legacy-generation-lifecycle.test.ts tests/reset/legacy-generation-diagnostics.test.ts
```

Result:

- passed
- 18 test files passed
- 89 tests passed

Full repo validation:

```bash
npm run lint
npm run build
npm run verify
```

Result:

- passed
- `npm run verify` passed with 17 test files and 82 tests, then a clean production build

Browser proof:

```text
http://127.0.0.1:4173/?runtimeDiagnostics=1
```

Result:

- one canvas
- no warning/error console logs
- runtime diagnostics panel includes `draw rows 25 batch 1 rows staged yes`

## Next honest slice

Move to `Active play movement and win/reset loop` or `Demo route, backtracking, and pacing`.

Do not keep ratcheting generation lifecycle unless a new truth-backed regression appears.
