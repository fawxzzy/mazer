# Mazer Legacy Generation Stage Cursor Diagnostics Packet

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
- `src/legacy-runtime/legacyMaze.ts`
- `src/scenes/MenuScene.ts`
- `tests/reset/legacy-generation-lifecycle.test.ts`
- `tests/reset/legacy-generation-diagnostics.test.ts`
- `tests/reset/legacy-reset.test.ts`

## Change

Queued generation requests now carry an explicit stage-cursor projection for legacy process-0 entry.

Consumed runtime mazes now carry an explicit stage-cursor projection for stage-7 finalization.

Runtime visual diagnostics now publish both the live maze stage cursor and the pending generation request stage cursor so automated localhost proof can inspect the staged lifecycle posture without depending on prose.

The DOM-backed runtime diagnostics attribute and visible side-browser panel now also publish the live generation stage cursor so the maintained `4173` browser can show the cursor without depending on hidden `window.__MAZER_*` globals.

## Boundary

This does not claim a full staged Unreal generator port.

The current runtime still consumes generation requests through the existing one-shot menu/play maze builders. The cursor is a proof and ownership surface that makes the remaining staged lifecycle gap narrower and more explicit.

## Marker

Marker remains held:

- `89%`

Reason:

- this packet improves runtime proof and owner clarity
- it does not yet replace one-shot request consumption with the full legacy staged process pipeline

## Validation

Focused validation:

```bash
npm run test -- tests/scenes/menu-runtime-diagnostics.test.ts tests/reset/legacy-generation-lifecycle.test.ts tests/reset/legacy-generation-diagnostics.test.ts tests/reset/legacy-reset.test.ts
npm run lint
npm run build
npm run verify
```

Result:

- passed
- reset lane and demo walker suite passed as part of the configured test target
- TypeScript no-emit lint passed
- build passed
- repo verify passed, including the serialized reset/demo test lane and production build
- live browser on `http://127.0.0.1:4173/?runtimeDiagnostics=1` loaded with one canvas and no warn/error console logs
- DOM-backed runtime diagnostics exposed `consumed-finalized:7` with `player-finalized`
- visible panel showed `gen stage consumed-finalized:7 signal player-finalized complete yes`

## Next honest slice

Continue in `Generation lifecycle exactness` only if the next packet ports real staged behavior rather than adding descriptive metadata.

Otherwise, use the marker's modular lock order and pick the next bounded visible or behavioral miss.
