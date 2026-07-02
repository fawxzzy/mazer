# Mazer Legacy Shortcut-Disabled Stage Transition Packet

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
- `tests/reset/legacy-generation-lifecycle.test.ts`
- `tests/reset/legacy-generation-diagnostics.test.ts`

## Change

Shortcut-disabled generation plans no longer publish an impossible stage transition.

When `scale <= 35`, process `5` (`CreateShortCuts`) is not part of the legacy generation plan. Stage `4` (`CreatePath`) now advances directly to stage `6` (`Draw`) for both menu and play plans.

Before this packet, stage `5` was omitted from the plan but stage `4` still advertised `advancesToStageId: 5`.

## Boundary

This does not port the full Unreal staged generator.

The runtime still builds the maze through the current browser builder after the queued generation request is consumed. The completed change is narrower: it fixes a real invalid stage edge in the runtime-owned execution plan and diagnostics metadata.

## Marker

Marker ratchets:

- from `90%`
- to `91%`

Reason:

- the packet changes the runtime execution-plan contract, not just prose
- small-maze stage `4` now advances to stage `6` when process `5` is absent
- runtime maze diagnostics now prove the shortcut-disabled plan has no process-`5` edge
- the full staged process pipeline remains open, so only one point is justified

## Validation

Focused validation:

```bash
npm run test -- tests/reset/legacy-generation-lifecycle.test.ts tests/reset/legacy-generation-diagnostics.test.ts tests/reset/legacy-reset.test.ts
```

Result:

- passed
- reset lane and demo walker suite passed as part of the configured test target

## Next honest slice

Continue in `Generation lifecycle exactness` only by porting another real staged behavior, ideally an incremental draw/build cadence seam.

Do not ratchet again for metadata-only stage descriptions.
