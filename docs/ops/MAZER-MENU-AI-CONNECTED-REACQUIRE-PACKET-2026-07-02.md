# Mazer Menu AI Connected Reacquire Packet

Date: 2026-07-02
Mode: owner-repo Mazer legacy 1:1 pass

## Scope

Module:

- menu demo route / pacing

Owner chain:

- `src/legacy-runtime/legacyMenuDemoLifecycle.ts`
- `src/legacy-runtime/legacyDemoWalker.ts`
- `src/domain/ai/demoWalker.ts`
- `tests/ai/demo-walker.test.ts`

## Problem

The restored humanized menu AI route could visually jump after wrong-branch recovery.

The failing proof case was:

- seed `902`
- continuous explore movement
- from tile `5388`
- to tile `229`
- cue `reacquire`

That was not a valid adjacent move. It came from splicing the wrong-branch route back to early canonical replay without a connected floor path.

## Change

`src/domain/ai/demoWalker.ts` now inserts a connected floor-path reacquire segment before canonical replay.

The route still preserves:

- source-shaped neighbor scan
- potential-tile queue
- `AiTilePathCheck`-style candidate admission
- path-stack backtracking
- `dead-end`, `backtrack`, and `reacquire` cues
- AI-only reset seam
- canonical solver truth

The route no longer allows a non-adjacent wrong-branch-to-canonical splice.

## Proof

Added `tests/ai/demo-walker.test.ts` coverage:

- humanized menu AI route stays on floor tiles
- continuous `explore -> explore` movement is adjacent
- representative generated mazes still surface wrong-branch or recovery telemetry

Focused proof:

```bash
npm exec vitest -- run tests\ai\demo-walker.test.ts --reporter=dot
```

Result:

- `1` file passed
- `12` tests passed

## Marker Decision

The repo-wide legacy 1:1 marker ratchets from `90%` to `91%`.

Reason:

- the touched segment is `Demo route, backtracking, and pacing`
- the segment moves from `9 / 12` to `10 / 12`
- this closes a real runtime route-quality bug, not only documentation or diagnostics

Remaining demo-route gaps:

- exact Unreal material color-revert timing
- blueprint AI cadence
- full visited-flag side effects

## Boundaries

No deploy.
No live resource mutation.
No Supabase or Vercel mutation.
No duplicate Mazer identity.
No production claim.
