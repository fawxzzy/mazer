# Mazer Level, Rank, Complexity, And AI Progression Contract

Last updated: 2026-07-09

Status: planning contract / implementation target.

This document defines how Mazer should connect player performance, AI-runner performance, maze complexity, rank, level, and future Atlas/playbook learning. It is intentionally narrow: no enemies, traps, obstacles, items, Stripe licensing, or diagonal graph work are included in this contract yet.

## Current Implemented Truth

- Mazer already stores two separate progression tracks: `player` and `ai-runner`.
- The active surface chooses the track:
  - `play` cycles update the `player` track.
  - menu-demo cycles update the `ai-runner` track.
- Each track owns:
  - `targetComplexity`
  - `level`
  - `rank`
  - `completedCycles`
  - `cleanCycles`
  - `struggleCycles`
  - `peakComplexity`
  - `lastSignal`
  - `recentSignals`
  - `lastMazeSeed`
- Level is derived from target complexity, not stored as a separate source of truth.
- Rank is derived from target complexity:
  - `E`: below 28
  - `D`: 28-45
  - `C`: 46-69
  - `B`: 70-95
  - `A`: 96-124
  - `S`: 125+
- The current complexity score is already based on:
  - maze size
  - solution path length
  - walkable floor ratio
  - route quality
  - meaningful bypass route bands
  - meaningful bypass solution edges
  - shortcut count
  - accepted checkpoint count
- The AI-runner baseline is versioned. Older local AI-runner state is reset to level 1/rank E once, while player progression is preserved.
- The current performance signal is driven by a numeric run-quality score with these terms:
  - timer pace versus expected route/complexity time
  - route efficiency versus the known shortest viable path
  - wrong-turn pressure
  - backtrack pressure
  - reset penalty
  - render/frame stability
- The resulting signal is:
  - `challenge`: clean/fast completion, few wrong turns, few backtracks
  - `ease`: reset used, many wrong turns, or many backtracks
  - `hold`: high frame cost or middle performance
- Route waste can force an `ease` signal even when the actor eventually reaches the end, because a path far longer than the shortest viable route means the maze/player combination was not cleanly solved.
- Unsafe frame timing forces `hold` instead of `ease`, because lag/readability problems should cap difficulty without punishing the player.
- Current target-complexity adjustment is bounded by a compact recent-signal window:
  - `challenge`: increase by 1 baseline, with a +1 measured-pressure bonus when the completed maze was at least 8 complexity above target.
  - `challenge` earns a +1 consistency bonus when recent receipts contain at least two challenge signals.
  - `challenge` also earns a +1 clean-streak bonus every third clean cycle.
  - `challenge` is capped to a maximum +3 target-complexity step.
  - `ease`: decrease by 1 baseline, or by 2 when measured pressure was far above target, repeated struggle is already recorded, or recent receipts contain at least two ease signals.
  - `hold`: no direct adjustment
- Measured maze complexity updates `peakComplexity`, but it no longer hard-jumps `targetComplexity`. This keeps level progression paced instead of letting one high-complexity menu demo jump the AI several ranks.
- This also means AI completed cycles can increase while visible level/rank do not move yet. The public menu badge stays focused on skill readability: AI Skill level/rank, run count, current time, and score. Target-complexity pressure and challenge/hold/ease signals remain available in runtime diagnostics and Atlas/playbook receipts instead of the player-facing badge.
- Remote progression summaries preserve `recentSignals`, so local pacing context can flow into account-scoped AI/player state and Atlas/playbook reports.
- Cycle receipts now include `shortestViablePathLength`, `routeOverrunSteps`, `routeOverrunRatio`, and `routeEfficiencyPressureScore`, which compare actual actor path length against the known shortest solution length.
- Cycle receipts now include `renderSafetyPenaltyScore`, which turns unsafe average frame timing into a difficulty-safety pressure signal.
- Atlas-safe reports now have a first validator-gated consumer receipt, `mazer.cycle-learning.consumer.v1`, that blocks malformed reports, rejects raw path leakage, and selects a bounded tuning focus without applying automatic tuning.
- Current maze scale is blended from base scale and target complexity, then capped by viewport/tile-size safety so mobile rendering stays readable.
- Play-mode maze seeds are fresh per player run. An explicit `mazeSeed`/`seed` URL can pin the initial proof route, but play start and play goal-reset cycles must generate a new procedural seed mixed from runtime entropy plus the player track's target complexity, completed cycles, level, and score. The seed must not be treated as the difficulty source; it chooses the procedural layout inside the current player-skill/complexity envelope.
- The menu AI already uses a `human-local-memory` model with visited memory, dead-end memory, split records, goal-distance scoring, deterministic hesitation/noise, and shortest-known route recovery to the best split when possible.
- AI distance currently uses wrapped-axis distance, so off-border/wrapped paths can be considered in heuristic distance.

## Desired Source Of Truth

`targetComplexity` remains the only numeric source of truth for level and rank.

The next maze should be generated from the active progression track:

- In play mode, the player track determines the next player maze.
- In the main menu, the AI-runner track determines the next demo maze.
- Every new player maze should receive a fresh procedural seed, then apply scale, shortcut budget, fill/topology pressure, and future tuning from the player track's target complexity. Sequential `seed + 1` stepping is acceptable for deterministic menu/demo proof lanes, but not as the only player-run freshness rule.
- Player and AI progression are separate. The AI can learn and rank up without changing the player's rank, and the player can rank up without overwriting the AI track.
- If the app later has accounts, remote sync should store both tracks per user.

The game should not directly set `level`, `rank`, or color tier from UI state. It should set or adjust only `targetComplexity`, then derive all presentation from that.

## Player Progression Rule

For every completed player cycle:

1. Record a compact cycle receipt.
2. Score actual maze complexity.
3. Score player performance against that complexity.
4. Convert performance into a stability-adjusted signal.
5. Update `targetComplexity`.
6. Derive level, rank, color tier, and next-maze generation scale from the updated track.

Performance should increase maze level when the player is outperforming the current target:

- Fast completion versus expected time.
- Low wrong-turn count.
- Low backtrack count.
- No reset.
- Stable frame timing.
- Good route efficiency relative to known shortest path.

Performance should decrease or hold maze level when the player is struggling:

- Reset used.
- Slow completion relative to expected time.
- Repeated wrong turns.
- Repeated backtracking.
- Completion route much longer than shortest known route.
- High frame cost, because performance lag should cap difficulty instead of punishing the player.

Implemented first-pass adjustment formula:

```text
performanceScore =
  timeScore
  + routeEfficiencyScore
  + wrongTurnScore
  + backtrackScore
  + resetScore
  + stabilityScore

targetComplexityDelta =
  +3 when performanceScore is excellent for two recent cycles
  +2 when performanceScore is clean
  +1 when performanceScore is improving but not dominant
   0 when performanceScore is stable or frame cost is high
  -1 when performanceScore shows mild struggle
  -2 when performanceScore shows repeated struggle
```

The implemented first smoothing window records the last six signals and applies bounded consistency bonuses or penalties. The numeric performance score now selects the signal before that smoothing window runs. The next version should calibrate the term weights against longer real player and AI sample bands while preserving the same anti-jump principle.

Current cycle-level performance pressure terms:

- `routeEfficiencyPressureScore`: `0` means the actor stayed close to the known shortest route; higher scores mean the actor path wasted more distance and the maze/control combination should be treated as harder.
- `routeOverrunRatio`: `0` means actor path length matched the generated shortest viable path; `1` means the actor traveled about twice the shortest route length.
- `routeOverrunSteps`: absolute extra steps beyond the generated shortest viable path.
- `renderSafetyPenaltyScore`: `0` means frame timing was safe; higher scores mean runtime performance may be distorting input, completion time, or readability and should cap difficulty increases.

## AI-Runner Progression Rule

The AI-runner should have its own track and should act as the maze tuning test dummy.

AI-runner performance acts as the tuning test dummy for complexity formulas before those formulas are trusted for player-facing adaptive difficulty.

The AI should not be a perfect solver. It should model a human with local memory:

- It knows its current position.
- It has a compass-like direction toward the goal.
- It estimates distance to the goal.
- It sees valid neighboring path options.
- It remembers visited tiles.
- It remembers dead-end tiles and should not intentionally re-enter proven dead-end branches.
- It records split points and which choices have already been tried.
- When blocked, it should route through the shortest known path to the best remaining split, not blindly replay every tile it walked before.
- It must treat wrapped/off-border path continuity as valid distance and pathing information.

The AI should rank up when it handles its current target cleanly:

- Low wrong-branch count.
- Low recovery count.
- Low backtrack distance.
- Low optional-retarget pressure. A retarget is valid human-like reasoning, but a high rate means the maze is creating repeated uncertainty.
- Fast completion versus expected AI cadence.
- Good route efficiency compared with shortest path.

The AI should hold or rank down when the generated maze exposes poor decision quality:

- Many wrong branches.
- Long dead-end recovery.
- Repeatedly choosing branches that increase wrapped distance to goal.
- Falling back to canonical solver too often.
- Route length approaching the bounded route cap.

Current compact AI receipt scoring:

```text
routeNoiseScore =
  ((wrongBranchCount * 3)
  + (optionalRetargetCount * 1.5)
  + (visitedUndoCount * 4))
  / max(1, decisionCount)

recoveryPressureScore =
  ((backtrackCount * 1.2)
  + (recoveryCount * 3))
  / max(1, decisionCount)

retargetPressureScore =
  optionalRetargetCount / max(1, decisionCount)

pressureScore =
  routeNoiseScore * 0.45
  + recoveryPressureScore * 0.45
  + retargetPressureScore * 0.1

reliabilityScore = 100 - pressureScore
```

Signal bands:

- `clean`: pressure below 25.
- `searching`: pressure from 25 through 59.999.
- `chaotic`: pressure 60 or higher.

The retarget term is intentionally lighter than a wrong branch or visited-undo. It should reward the AI for reconsidering a better remembered split while still exposing mazes that force frequent second-guessing.

AI progression should become an internal calibration tool:

- If AI performance is too clean for several cycles, increase AI target complexity.
- If AI performance is chaotic, reduce or hold AI target complexity and inspect which maze terms caused the chaos.
- If player and AI disagree sharply on difficulty, mark the maze as suspicious for tuning rather than immediately using it as a level-up signal.

## Maze Complexity Formula Contract

Maze complexity should be additive, explainable, and receipt-backed.

### Current Terms

- `sizeScore`: larger generated bounds allow more path possibilities.
- `solutionScore`: longer shortest solution paths are harder.
- `floorScore`: more walkable fill creates more possible decisions.
- `routeScore`: meaningful alternate routes add navigation pressure.
- `shortcutScore`: shortcuts increase ambiguity only when they produce meaningful route choices.
- `checkpointScore`: accepted generation checkpoints approximate path-building density.
- `edgeWrapScore`: counts vertical and horizontal off-border continuities that actually connect to opposite-side paths.
- `edgeWrapReliefScore`: subtracts pressure when wrapped paths make the shortest route unusually short for the maze size.
- `splitScore`: counts branch points and extra local choices, including wrapped neighbors.
- `deadEndPressureScore`: counts dead-end pressure as a first-pass proxy for plausible wrong branches.
- `weightedSplitPressureScore`: weights branch points by wrapped goal distance and number of locally plausible choices.
- `weightedDeadEndPressureScore`: weights dead ends by how plausible they look from local wrapped-distance heuristics.
- `fillQualityScore`: rewards clean interior fill while penalizing isolated sparse gaps.

### Required Next Terms

- `routeEfficiencyCalibration`: calibrates route-efficiency pressure against real player and AI cycles.
- `renderSafetyViewportPenalty`: extends render-safety pressure beyond average frame time to include viewport tile size/readability.

### Deferred Terms

These should be reserved in receipts but not activated until the features exist:

- `dangerScore`
- `enemyPressureScore`
- `trapPressureScore`
- `itemValueScore`
- `urgencyScore`

## Maze Level From Player Level

The displayed player level is derived from the player track. The generated player maze should use that same player track as its target.

Recommended contract:

```text
playerTargetComplexity -> playerLevel/playerRank -> nextPlayerMazeTarget
```

The maze itself can report an actual measured complexity that differs from the target. That difference is useful:

- actual complexity below target: generator under-delivered; retry or add generation pressure later.
- actual complexity close to target: accepted.
- actual complexity above target: accepted only if performance/framerate safety allows it.

The UI should distinguish:

- `Player Level`: player progression state.
- `Maze Complexity`: measured complexity of the current maze.
- `AI Level`: AI-runner progression state, visible in menu when the demo AI is the active runner.

The main menu can show the AI runner's level because the main menu runner is the active performer there. Play mode should show the player level.

## Complexity Change Meaning

Every small level increase should correspond to a limited set of measurable generation changes.

Recommended progression bands:

- Levels 1-8: small maze bounds, low branch count, minimal edge-wrap, few dead ends, no rooms.
- Levels 9-18: more fill, more branch points, at least one useful vertical or horizontal edge-wrap path.
- Levels 19-34: both vertical and horizontal edge-wrap candidates become common, route bands and shortcuts matter more.
- Levels 35-55: higher fill density, longer solution path, more plausible wrong branches, stronger shortcut ambiguity.
- Levels 56+: performance-gated; only increase if frame timing and route readability stay safe.

Rooms remain off for now. Without enemies, obstacles, items, or traps, rooms add visual noise and unclear purpose.

## Atlas And Playbook Contract

Each completed cycle should produce a compact receipt that can become an Atlas-safe report.

Minimum receipt:

```ts
{
  actorTrack: 'player' | 'ai-runner',
  mazeSeed,
  mazeSize,
  targetComplexity,
  measuredComplexity,
  level,
  rank,
  routeQuality,
  edgeWrapCount,
  splitCount,
  deadEndCount,
  shortestPathLength,
  actorPathLength,
  routeOverrunSteps,
  routeOverrunRatio,
  wrongTurns,
  backtracks,
  recoveryCount,
  optionalRetargetCount,
  aiDecisionPressureScore,
  aiDecisionReliabilityScore,
  resetUsed,
  completionTimeMs,
  averageFrameMs,
  signal,
  completedAt
}
```

Atlas/playbook should consume reports for decision support first, not silent auto-tuning. Automatic tuning should only happen once reports are stable and verified.

Current repo-local consumer contract:

- `validateMazeCycleTelemetryAtlasReport(report)` requires schema `mazer.cycle-learning.report.v1`, app/source identity, a valid learning signal, Atlas-safe data policy, raw path exclusion, and AI/complexity/performance/progression review blocks.
- Validation fails if `latestReceipt.playerPath` or any `recentReceipts[].playerPath` raw path array reaches the report.
- `canConsumeForTuning` is true only when validation passes and the report has at least three samples.
- `createMazeCycleTelemetryAtlasConsumerReceipt(report)` emits schema `mazer.cycle-learning.consumer.v1`.
- Consumer focus can be `collect-more-cycles`, `render-safety`, `route-efficiency`, `ai-chaos`, `increase-complexity`, `reduce-complexity`, `hold-and-observe`, or `blocked-validation`.
- The consumer always carries `noAutoTuningWithoutValidator = true`; it is a decision-support receipt, not an automatic maze mutator.
- `scripts/analysis/maze-cycle-telemetry-report.mjs` can write consumer receipts with `--consumer-output <file>` and timestamped/latest Atlas consumer receipts with `--atlas-consumer-root <dir>`.

## Implementation Phases

1. Formalize receipts.
   - Add AI decision receipts.
   - Add complexity breakdown receipts.
   - Add edge-wrap, split, dead-end, and fill-quality terms.
2. Stabilize level contracts.
   - Keep level/rank derived from target complexity.
   - Smooth target changes across recent receipts. First-pass recent-signal smoothing and weighted run-quality scoring are implemented; longer-sample calibration is next.
   - Keep player and AI tracks separate locally and remotely.
3. Use AI as test dummy.
   - Run AI across deterministic seed bands.
   - Compare predicted complexity with AI actual difficulty.
   - Flag mismatches for formula tuning.
4. Feed Atlas/playbook.
   - Validate `mazer.cycle-learning.report.v1`. First repo-local validator is implemented.
   - Add a report consumer that summarizes trend, rank pressure, and suspicious mazes. First bounded repo-local consumer receipt is implemented; Atlas-side process wiring is next.
5. Only then expand graph features.
   - Diagonal tiles, rooms, enemies, traps, and obstacles require one shared graph contract across generation, movement, AI distance, compass, trail, telemetry, and rendering.

## Verification Requirements

- Unit tests must prove level/rank are derived from target complexity.
- Unit tests must prove player and AI tracks update independently.
- Unit tests must prove maze generation scale is capped by viewport/readability.
- Unit tests must prove complexity breakdown includes route, shortcut, floor, solution, size, and checkpoint terms.
- AI tests must prove local-memory routes stay adjacent, bounded, and edge-wrap-aware.
- Atlas report tests must prove receipts omit full raw path history unless explicitly exported for local debug.
- Atlas consumer tests must prove invalid raw path reports are blocked before tuning and valid three-sample reports produce bounded consumer decisions.
- Browser QA must prove the visible level badge reflects the active surface: AI in menu, player in play, with no debug shorthand bleeding into the public skill box.

## Open Decisions

- Calibration weights for the first numeric performance-score formula after longer real player and AI sample bands.
- Exact formula weights for edge wrap, split pressure, dead-end pressure, and fill quality.
- Exact Atlas-side process that consumes `mazer.cycle-learning.consumer.v1` receipts and ratchets level/complexity markers without silent auto-tuning.
- Whether rank should use only target complexity or a blend of target complexity and consistency.
- Whether the main menu should display AI level only, or AI level plus player level after login.
- Whether player color/trail color should reflect level bands, rank bands, or both.
