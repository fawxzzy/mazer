# Mazer Menu AI Visited-Undo Positive-Proof Packet

Date: 2026-07-02

## Scope

This packet closes the proof gap for the legacy `_AiBackTrackUndoVisitedFlag` branch in the menu AI route model.

The previous packet made the seam observable through `visitedUndoCount`, but the representative split-flow route still reported `visitedUndoCount: 0`. That meant wrong-branch/backtrack/reacquire behavior was covered, while the rarer visited-undo side effect still lacked a deterministic positive proof.

## Landed Change

- Added `createVisitedUndoEpisode()` as a test-only fixture in `tests/ai/demo-walker.test.ts`.
- Added a focused test proving the route diagnostics can produce `visitedUndoCount: 1` while preserving wrong-branch, backtrack, recovery, route-length, and AI-reset cursor bounds.

## Marker Decision

The legacy 1:1 marker remains at `93%`.

This packet improves proof coverage for an existing behavior branch, but it does not change runtime behavior or recover the exact Unreal material/timer side effects for visited tiles.

## Boundaries

- No deploy.
- No live resource mutation.
- No Supabase or Vercel app-resource mutation.
- No duplicate Mazer identity.
- No key rotation.
