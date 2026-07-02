# Mazer Legacy Demo AiTilePathCheck Packet

Date: 2026-06-30
Repo: `fawxzzy/mazer`
Branch: `codex/mazer-pass2-menu-parity`
Mode: owner-repo parity packet

## Packet

`legacy menu-demo route/backtrack AiTilePathCheck candidate admission`

## Legacy source

Restored Unreal owner:

- `Source/Mazer/Private/Player/MazerPlayer.cpp`

Legacy behavior:

- `AiPlayerLogic()` only admits a neighboring AI move when the tile is unvisited and `AiTilePathCheck(Neighbor, 0)` passes.
- `AiTilePathCheck()` always admits the end tile.
- For non-end candidates, `AiTilePathCheck()` requires at least one valid neighboring path tile that is not the current AI tile and is not visited.
- `AiBackTrack()` resets AI position only after the AI path stack is exhausted.

## Change

The browser demo walker now applies a legacy-style candidate gate before selecting an off-canonical wrong-turn branch:

- end tile candidates still pass
- non-end branch candidates must expose at least one unvisited onward floor tile besides the current tile
- one-tile spurs that would be rejected by restored Unreal `AiTilePathCheck(Neighbor, 0)` are no longer committed as wrong turns

Changed owner:

- `src/domain/ai/demoWalker.ts`

Proof owner:

- `tests/ai/demo-walker.test.ts`

## Test fixture

A handcrafted corridor fixture now covers the exact edge:

- canonical path is a short straight corridor
- one selectable side spur is a single floor tile
- mistake-enabled demo mode must not count that spur as a wrong branch
- backtrack telemetry must stay at zero for that spur
- the trail must not step onto the rejected spur tile

## Marker impact

The repo-wide Mazer legacy 1:1 marker moves from `96%` to `97%`.

Reason:

- this is a bounded runtime behavior change
- the edit is in the correct owner chain
- the proof surface is repo-owned
- the parity matrix and current-truth docs are synchronized

The marker remains held below `100%` because:

- final screenshot-grade board/material parity is still open
- final play HUD/goal-arrow parity is still open
- topology-internal audit remains a later lane if visual/HUD closure exposes a gameplay blocker

## Verification

Focused proof completed:

```bash
npm run test -- tests/ai/demo-walker.test.ts tests/reset/legacy-menu-demo-lifecycle.test.ts
```

Result:

- passing

