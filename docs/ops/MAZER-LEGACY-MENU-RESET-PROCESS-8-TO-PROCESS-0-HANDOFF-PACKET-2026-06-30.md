# Mazer Legacy Menu Reset Process-8 To Process-0 Handoff Packet

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
- `src/legacy-runtime/legacyPlayLifecycle.ts`
- `src/scenes/MenuScene.ts`
- `tests/reset/legacy-generation-lifecycle.test.ts`
- `tests/reset/legacy-reset.test.ts`

## Change

Menu-demo goal reset no longer regenerates the maze inline from `consumeResetRequest()`.

Process-8 reset consumption now creates a pending process-0 menu generation request through `createLegacyMenuResetGenerationRequest()`. The next scene update consumes that generation request through the existing generation request path.

This preserves a real runtime handoff:

```text
goal reached -> process 8 reset request -> pending process 0 generation request -> generation consumption
```

## Boundary

This does not port the full Unreal staged generator.

The runtime still creates the actual maze through the current one-shot menu/play builders after the queued process-0 request is consumed. The completed change is narrower: it removes one inline regeneration collapse at the menu reset branch.

## Marker

Marker ratchets:

- from `89%`
- to `90%`

Reason:

- the packet changes real runtime behavior in the `Generation lifecycle exactness` segment
- the process-8 menu reset branch now hands off to a queued process-0 generation request instead of regenerating inline
- the full staged process pipeline remains open, so only one point is justified

## Validation

Focused validation:

```bash
npm run test -- tests/reset/legacy-generation-lifecycle.test.ts tests/reset/legacy-reset.test.ts tests/reset/legacy-play-lifecycle.test.ts
```

Result:

- passed
- reset lane and demo walker suite passed as part of the configured test target

## Next honest slice

Continue in `Generation lifecycle exactness` only by porting another real staged behavior, such as an incremental process-stage advancement or draw/build cadence seam.

Do not ratchet again for metadata-only stage descriptions.
