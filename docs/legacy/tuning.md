# Legacy tuning defaults (Unreal -> rebuild)

This pass rechecked the rebuilt maze/domain code against the read-only Unreal source archived in `legacy/old-project.zip` (`Source/**` and `Config/**`) and tightens the rebuild where the earlier lane still differed.

## Source references used
- Legacy maze lifecycle: `Mazer/Source/Mazer/MazerGameModeBase.cpp`
- Legacy reset scheduler: `Mazer/Source/Mazer/Private/MazerGameState.cpp`
- Legacy menu/demo AI: `Mazer/Source/Mazer/Private/Player/MazerPlayer.cpp`
- Legacy shared defaults: `Mazer/Source/Mazer/Public/MazerGameInstance.h`
- Legacy Blueprint defaults recovery attempt: `Mazer/Content/Game/GI_MazerGameInstance.uasset`
- Rebuild tuning source: `src/config/tuning.ts`

## Exact-from-legacy behavior now reflected

### Maze generation
- Grid scale default remains `_Scale = 50` when unset.
- Checkpoint count remains `_Scale + (_Scale * _CheckPointModifier)`.
- Shortcut budget remains `_Scale * _ShortcutCountModifier`.
- Shortcut carving still only runs when `scale > 35`.
- Generated active-play snapshots now use a source-shaped checkpoint path-builder instead of the earlier DFS perfect-maze owner:
  - `CreateGrid` equivalent: floor grid plus non-floor border
  - `MapPath` equivalent: checkpoint selection, mixed next-tile choice, local path-neighbor validation, backtracking, and longest-path end selection
  - `CreatePath` equivalent: path-neighbor wall-array collection
- Generated active-play snapshots now apply the restored `CreateShortCuts` bridge condition:
  the selected tile must still be a wall, all four cardinal neighbors must exist, one axis must have opposite walkable path corridors, and the perpendicular axis must remain walled.
- The active reset-lane pass uses the explicit legacy shortcut budget (`_Scale * _ShortcutCountModifier`) and skips shortcut creation when scale disables process `5`.
- The active reset-lane shortcut pass now builds a duplicate-preserving `_WallArray`-style list from path-neighbor walls, removes one randomly selected entry per attempt, revalidates stale entries before opening them, and reports requested/attempted/created shortcut stats.
- Exact legacy roll-for-roll randomness is still not literal because the Unreal source mixes `std::random_device`, `std::rand`, and repeated `std::srand(time(0))`; the rebuild keeps deterministic seeded selection for browser testability.

### Reset / regenerate loop
- Legacy reset still has two distinct branches:
  - reaching the goal sets `_ResetGame`, then `GameState` drives process `8` and regenerates a new maze
  - exhausting the demo AI path stack calls `ResetAiPosition()` and resets only the AI position on the current maze
- The rebuild now distinguishes those branches in the demo walker:
  - goal completion requests a new maze
  - path-stack exhaustion performs an AI-only reset

### Menu demo AI walker
- Direct movement now matches the Unreal logic:
  - scan adjacent path tiles
  - discard visited tiles
  - keep only tiles that pass `AiTilePathCheck(...)`
  - choose the candidate with the smallest distance to the end
- Alternate branches are accumulated in a legacy-style potential-tile list and revisited through backtracking.
- Backtracking now follows the legacy path stack instead of the previous scored DFS trail rewind.
- `AiTilePathCheck(...)` semantics are now reflected:
  non-end candidates must expose at least one unvisited onward path besides the current tile.
- AI-only resets now preserve visited history the same way `ResetAiPosition()` does in legacy:
  only the current tile is cleared, the start tile is marked current again, and the rest of the visited set remains.
- The `_AiLogicSwitch` flip on AI-only reset is now preserved.
- The legacy `AiLogicSwitch` retarget bug is intentionally preserved:
  when that switch is active, the original C++ path retarget branch effectively drains the potential list without selecting a new target, and the rebuild now mirrors that behavior.

### Legacy defaults already retained
- Camera scale edit range remains `-50..50`.
- Camera buffer formula remains `(scale + (camScale * 2)) * preScalar`.
- Path linear RGB remains `(0.19099, 0.192708, 0.18769)`.
- Wall linear RGB remains `(0.067708, 0.067708, 0.067708)`.

## Approximated behavior that remains
- Maze randomness is still deterministic/seeded in the rebuild.
  Legacy C++ mixed `std::random_device`, `std::rand`, and `std::srand(time(0))`, so exact roll-for-roll output is not reproducible from source alone.
- The active checkpoint path-builder is source-shaped but not byte-for-byte identical to the old `MapPath()` / `Backtrack()` loop.
  It preserves the owner responsibilities and major selection gates while keeping browser builds deterministic and one-shot.
- Demo timer values remain approximated.
  `_PlayerAiDelayDuration` was blueprint-driven in the Unreal project; the extracted C++ proves the AI loop is a single timer rescheduled after every `AiPlayerLogic()` call, so the rebuild now uses one AI movement cadence while keeping cue labels for presentation/readback:
  `exploreStepMs: 104`, `backtrackStepMs: 104`, `decisionPauseMs: 104`, `anticipationStepMs: 104`, `branchCommitMs: 104`, `branchResumeMs: 104`, `goalHoldMs: 1180`, `resetHoldMs: 340`.
  The numeric Blueprint default is still unrecovered from the available source/assets.
- Demo maze regeneration uses deterministic seed stepping (`seed + 1` per completed goal maze) as a rebuild approximation for legacy's non-deterministic fresh generation.
- The menu trail rendering is still a rebuild interpretation of the legacy tile color-revert system rather than a literal material-timer port.
  `createLegacyMenuDemoBootstrap()` and `advanceLegacyMenuDemoFrame()` now have focused tests proving `toggleTrailFade` bounds the visible trail to the supplied tail while persistent trail mode keeps the full projected path.
  A follow-up scan of `Content/Game/GI_MazerGameInstance.uasset` found the `_TileColorRevertDelay` and `FloatProperty` names, but not a trustworthy serialized Blueprint default value; the exact numeric value and material timing remain unrecovered from the current source/assets.
- The rebuild now carries explicit presentation cues (`spawn`, `anticipate`, `explore`, `dead-end`, `backtrack`, `reacquire`, `goal`, `reset`) alongside the recovered AI logic so the menu scene can stage turn commits, dead ends, backtracking, and branch reacquisition more clearly without changing the underlying path choice.
- Demo walker route diagnostics now expose `visitedUndoCount` for the legacy `_AiBackTrackUndoVisitedFlag` seam.
  The representative split-flow proof route covers wrong-turn recovery without exercising that rarer branch; `createVisitedUndoEpisode()` now supplies a focused deterministic fixture where the branch increments `visitedUndoCount`.
- The attract-mode menu now prerolls a small deterministic number of demo steps before first paint so the board reads as active immediately instead of opening on a blank maze.
- The responsive shell is intentionally a rebuild adaptation, not a literal Unreal widget layout port.
  Exact legacy placement depended on a fixed desktop presentation with a visible Start button.
  The rebuild keeps the legacy board-first composition, title-over-board treatment, and side-action feel, but adapts spacing and button placement by breakpoint so the same shell works at `1366x900` and `390x844` without a separate mobile UI.
- Menu-time manual play access is intentionally productized away from the legacy front door.
  Legacy exposed a visible Start button; the rebuild keeps manual play behind the Options overlay and the hidden `M` shortcut so attract mode remains the public default.

## Verification coverage added
- Maze tests now assert the legacy wall-array duplicate quirk after shortcut creation.
- Demo walker tests now cover:
  - direct candidate choice
  - legacy branch backtracking
  - visited-preserving AI reset
  - the legacy `AiLogicSwitch` retarget bug
  - goal-driven maze regeneration requests
- Soak coverage now exercises the recovered demo walker reset/backtrack loop across generated mazes.
