# Mazer Menu AI Visited-Undo Diagnostics Packet

Date: 2026-07-02

## Scope

This packet tightens the menu AI parity proof around the legacy `_AiBackTrackUndoVisitedFlag` seam.

The extracted Unreal C++ shows that `AMazerPlayer::AiBackTrack()` may mark a backtracked tile as unvisited while the AI is searching for a potential target:

```cpp
if (MazerGameInstance->_AiBackTrackUndoVisitedFlag)
{
    NextTile->Visited = false;
}
```

The web rebuild already carries a matching visited-delete branch in `buildLegacyAiRunnerPlan()`, but the branch was not directly observable through route diagnostics.

## Landed Change

- Added `visitedUndoCount` to `DemoRunnerTelemetry`.
- Incremented `visitedUndoCount` when the legacy-style backtrack undo branch deletes a tile from the visited set.
- Updated the representative menu AI diagnostics test to record the current proof truth: the split-flow seed covers wrong-branch, dead-end, backtrack, and reacquire behavior, but does not positively exercise the rarer visited-undo side effect.

## Marker Decision

The legacy 1:1 marker remains at `93%`.

This packet does not earn a point because it improves observability rather than closing the behavior:

- the current deterministic proof route still reports `visitedUndoCount: 0`
- exact Unreal visited-color/material timer behavior remains open
- exact Blueprint timing defaults remain unrecovered

## Boundaries

- No deploy.
- No live resource mutation.
- No Supabase or Vercel app-resource mutation.
- No duplicate Mazer identity.
- No key rotation.
