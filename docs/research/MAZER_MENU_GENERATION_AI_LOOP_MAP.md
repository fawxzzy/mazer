# Mazer Menu Generation And AI Loop Map

Date: 2026-07-02
Status: active owner map
Current 1:1 marker: `93%`

## Purpose

This map is the first stop before changing the menu maze reveal, menu-demo AI pathing, route cues, or generation diagnostics. It keeps future passes modular so a visual tweak does not accidentally rewrite topology, AI route ownership, or reset flow.

This started as a mapping packet. The follow-up route-quality bound ratcheted the 1:1 marker because it changed runtime AI route construction and added a regression guard.

## Runtime Loop

```mermaid
flowchart TD
  A["MenuScene.create()"] --> B["createLegacyGeneratedMenuMaze(scale, seed)"]
  B --> C["createLegacyDemoWalkerEpisode(maze)"]
  C --> D["createLegacyMenuDemoBootstrap(...)"]
  D --> E["createDemoWalkerState(episode, config)"]
  E --> F["resolveDemoRunnerPlan(...)"]
  F --> G["buildPreciseRunnerPlan or buildLegacyAiRunnerPlan"]
  G --> H["MenuScene.update(time)"]
  H --> I["advanceLegacyMenuStaticDrawStage(time)"]
  H --> J["advanceLegacyMenuDemoFrame(...)"]
  I --> K["drawBoard() row-sliced menu reveal"]
  J --> L["player/trail/cue state"]
  K --> M["publishMenuSceneRuntimeDiagnostics(...)"]
  L --> M
```

## Owner Surfaces

| Concern | First owner | Downstream surfaces | Proof |
| --- | --- | --- | --- |
| Menu generated maze shape | `src/legacy-runtime/legacyMaze.ts` | `createLegacyGeneratedMenuMaze()`, `createLegacyMaze()`, `legacyMenuRender.ts` | `tests/reset/legacy-reset.test.ts`, `tests/scenes/menu-render-frame.test.ts` |
| Fixed screenshot fixture shape | `src/legacy-runtime/legacyMenuSnapshot.ts` | `createLegacyMenuMaze()`, screenshot comparison fixtures | `tests/reset/legacy-reset.test.ts`, `tests/reset/legacy-menu-demo-lifecycle.test.ts` |
| Menu generation stage contract | `src/legacy-runtime/legacyGenerationLifecycle.ts` | process `0/3/4/5/6/7/8`, stage cursor, budget, draw-stage shape | `tests/reset/legacy-generation-lifecycle.test.ts`, `tests/reset/legacy-generation-diagnostics.test.ts` |
| Menu row reveal | `src/scenes/MenuScene.ts` | `armLegacyMenuStaticDrawStage()`, `advanceLegacyMenuStaticDrawStage(time)`, `resolveMenuSceneGenerationDrawStageProgress()` | `tests/reset/legacy-reset.test.ts`, localhost diagnostics |
| Menu AI bootstrap | `src/legacy-runtime/legacyMenuDemoLifecycle.ts` | `createLegacyDemoWalkerEpisode()`, fixed-snapshot preroll, visible stable bootstrap | `tests/reset/legacy-menu-demo-lifecycle.test.ts` |
| Menu AI route plan | `src/domain/ai/demoWalker.ts` | `resolveDemoRunnerPlan()`, `buildPreciseRunnerPlan()`, `buildLegacyAiRunnerPlan()` | `tests/ai/demo-walker.test.ts` |
| Menu AI cues and cadence | `src/domain/ai/demoWalker.ts` | `cueOverrides`, `segmentTrailModes`, `resolveSegmentCue()`, `resolveSegmentDelayMs()` | `tests/ai/demo-walker.test.ts`, runtime diagnostics |
| Menu AI route diagnostics | `src/domain/ai/demoWalker.ts` | `collectDemoWalkerRouteDiagnostics()`, `menuDemo.route` runtime diagnostics | `tests/ai/demo-walker.test.ts`, `tests/scenes/menu-runtime-diagnostics.test.ts`, maintained browser DOM diagnostics |
| AI reset and regeneration | `src/legacy-runtime/legacyMenuDemoLifecycle.ts` | `createLegacyMenuDemoGoalResetRequest()`, process-8 to process-0 handoff | `tests/reset/legacy-menu-demo-lifecycle.test.ts`, `tests/reset/legacy-reset.test.ts` |
| Menu trail fade / material-revert equivalent | `src/legacy-runtime/legacyMenuDemoLifecycle.ts` | `createLegacyMenuDemoBootstrap()`, `advanceLegacyMenuDemoFrame()`, `toggleTrailFade`, `trailFadeTail` | `tests/reset/legacy-menu-demo-lifecycle.test.ts` |
| Browser readback | `src/scenes/menuRuntimeDiagnostics.ts` | `data-mazer-runtime-diagnostics`, stage cursor, draw-stage progress, runner telemetry | `tests/scenes/menu-runtime-diagnostics.test.ts`, `tests/visual/edge-live-check.test.ts` |

## Current AI Shape

The web menu AI has two route modes:

- `buildPreciseRunnerPlan()` follows the canonical path exactly.
- `buildLegacyAiRunnerPlan()` is the restored menu-facing humanized lane.

The humanized lane owns:

- `visited`: restored "already seen" path gate.
- `potentialTiles`: restored queue of valid neighboring floor candidates.
- potential target admission is idempotent so duplicate shortcut candidates cannot inflate the menu loop.
- `pathStack`: restored backtrack spine.
- `passesLegacyAiTilePathCheck()`: rejects one-tile dead spurs that cannot continue toward the end.
- `resolveLegacyAiDirectMove()`: scans unvisited floor neighbors and picks the nearest valid candidate to the end.
- `resolveLegacyAiPotentialTarget()`: selects a target from the potential list when direct movement fails.
- `findFloorPath()`: reconnects wrong-branch recovery to canonical replay through adjacent floor movement.
- `collectDemoWalkerRouteDiagnostics()`: publishes the current route shape without changing route selection, including `visitedUndoCount` for the legacy `_AiBackTrackUndoVisitedFlag` side-effect seam.
- `createVisitedUndoEpisode()`: test-only fixture proving a deterministic route where `_AiBackTrackUndoVisitedFlag`-equivalent behavior increments `visitedUndoCount`.
- first-mistake route construction stops after emitted `dead-end`, `backtrack`, and `reacquire` cues are represented, then returns to canonical replay instead of continuing exploratory route construction.
- cue-specific labels remain presentation/readback state, but movement, backtrack, dead-end, branch, and reacquire beats now resolve through one `exploreStepMs` timer because extracted C++ reschedules `AiPlayerLogic()` with one `_PlayerAiDelayDuration`.

## Current Generation Shape

Menu generation shares the active play topology owner but uses a menu-specific budget/tuning wrapper:

- Menu mode uses `createLegacyGeneratedMenuMaze()`, which wraps the same checkpoint path-builder and shortcut reinforcement family as active play while preserving `source: 'menu-generated'`.
- Play mode uses `createLegacyMaze()` and preserves `source: 'play-generated'`.
- The fixed legacy menu snapshot remains available through `createLegacyMenuMaze()` only for screenshot comparison fixtures and fixed-snapshot demo tests.
- Menu stage `6` draw is row-sliced and cadence-gated so the board can reveal over time.
- Menu demo trail fade is represented as a bounded visible trail tail, which is the browser-safe equivalent for the old delayed material-revert lane.
- Play topology is currently resolved as a browser-safe build before visible draw.
- Default play and generated-menu seed-family guards now prove connected meaningful multi-route topology across representative seeds, including the prior weak generated-menu seed `3749`.
- Exact old engine per-tick process-yield timing is still open.

## Safe Edit Rules

- If changing the live generated menu maze shape, start in `legacyMaze.ts`; if changing only the fixed screenshot fixture, start in `legacyMenuSnapshot.ts`.
- If changing route behavior, start in `demoWalker.ts`, not `MenuScene.drawBoard()`.
- If changing row reveal timing, start in `MenuScene.advanceLegacyMenuStaticDrawStage(time)` and generation diagnostics.
- If changing menu reset/rebuild, start in `legacyMenuDemoLifecycle.ts` and `legacyGenerationLifecycle.ts`.
- If changing shortcut topology for active play, use `legacyMaze.ts`; do not route that work through the fixed menu snapshot.

## Known Open Gaps

- Exact numeric Blueprint `_PlayerAiDelayDuration` remains unrecovered, but extracted C++ proves the single-timer cadence shape now used by the rebuild.
- Exact visited-tile color-revert/material timer behavior remains unrecovered. A bounded scan of `GI_MazerGameInstance.uasset` found `_TileColorRevertDelay` and `FloatProperty` names, but not a trustworthy serialized default value; menu bootstrap and advance prove only the current browser-equivalent trail-tail behavior for `toggleTrailFade`.
- The positive `_AiBackTrackUndoVisitedFlag` / `visitedUndoCount` proof route is now covered by a deterministic fixture; remaining visited-color work is about material/timer behavior, not branch observability.
- Exact engine process-yield timing for generation remains approximated by browser-safe contracts.
- Final screenshot-grade menu material and sprite treatment remain visual work, not AI pathing work.

## Current Best Next Runtime Slices

1. Validate whether the current menu row reveal cadence should stay fixed at one row per gate or be tuned against recovered video/screenshot evidence.
2. Compare `buildLegacyAiRunnerPlan()` telemetry against longer menu soak captures and only then adjust wrong-branch frequency or route-quality thresholds.
3. Keep play shortcut/topology changes isolated in `legacyMaze.ts`; do not mix them into menu fixed-snapshot work.
