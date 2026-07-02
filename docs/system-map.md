# System Map

This is the practical edit map for the current Mazer repo.

Use it when you want to change behavior without losing track of the whole application.

## Truth order

When sources disagree, read in this order:

1. `legacy/old-project.zip`
2. `legacy/screenshots/menu-01.png` .. `menu-04.png`
3. `docs/legacy/*`
4. `docs/current-truth.md`
5. `docs/research/MAZER_LEGACY_ONE_TO_ONE_COMPLETION_MARKER.md`
6. current runtime code and tests

## Runtime boot graph

The active app entry path is:

1. `src/boot/main.ts`
2. `src/boot/phaserConfig.ts`
3. `src/scenes/BootScene.ts`
4. `src/scenes/MenuScene.ts`

Meaning:

- `main.ts` owns localhost service-worker/cache cleanup and boot-status milestones
- `phaserConfig.ts` owns the scene list and Phaser boot config
- `BootScene.ts` is only a handoff
- `MenuScene.ts` is the real application surface for the reset lane

## Full runtime directory map

Use this before large edits so you know the whole app, not just the current screen:

| Area | Ownership |
| --- | --- |
| `src/boot/*` | browser boot, localhost cleanup, Phaser startup, live boot diagnostics |
| `src/scenes/*` | runtime shell, front door, overlays, play loop, HUD, live presentation |
| `src/legacy-runtime/*` | legacy-owned defaults, menu layout, menu snapshot, maze conversion, play HUD geometry, option field parsing, overlay field-commit contracts, overlay toggle contracts, overlay routing contracts, pause command contracts |
| `src/domain/ai/*` | deterministic demo walker stepping and attract behavior |
| `src/domain/maze/*` | generated maze/runtime domain logic used by live menu and play generation |
| `tests/reset/*` | legacy reset-lane contracts and guardrails |
| `tests/scenes/*` | scene composition, presentation, and live-shell proof guards |
| `legacy/*` | restored source truth inputs and screenshot truth |
| `docs/current-truth.md` + `docs/research/*` | lane contract, parity gaps, port sequencing |

Rule:

- if a tweak touches more than one row, map that dependency chain before editing

## Whole-application owner map

Use this as the top-level "where does this actually live?" map before editing:

| Surface | Current owner | Supporting truth/proof |
| --- | --- | --- |
| boot + localhost cleanup | `src/boot/main.ts` | `tests/reset/legacy-reset.test.ts` |
| boot diagnostics readback | `src/boot/bootStatus.ts`, `src/boot/main.ts` | `tests/boot/boot-status.test.ts` |
| Phaser scene wiring | `src/boot/phaserConfig.ts` | `npm run build` |
| active front door and play shell | `src/scenes/MenuScene.ts` | in-app browser, `npm run verify`; play board rendering owns connected corridor material for generated mazes |
| active-play keyboard, focus-loss, and mobile pointer movement | `src/legacy-runtime/legacyPlayStep.ts`, `src/scenes/MenuScene.ts` | `tests/reset/legacy-play-step.test.ts`, `tests/reset/legacy-reset.test.ts`, `tests/scenes/menu-runtime-diagnostics.test.ts`, localhost mobile/play proof; accepted movement keys are consumed at the scene boundary, browser focus loss clears held movement flags and pending movement timers, and pointer/touch swipes plus short taps resolve into the same one-step vector and axis-gated collision path as keyboard input, with pointer starts bounded to the active board rectangle |
| live runtime diagnostics bridge | `src/scenes/menuRuntimeDiagnostics.ts`, `src/scenes/MenuScene.ts` | `tests/scenes/menu-runtime-diagnostics.test.ts`, `tests/reset/legacy-reset.test.ts`, `tests/visual/edge-live-check.test.ts`, localhost; diagnostics are data-only and do not draw a visible proof/debug panel over the game, and `generation.maze` exposes source/build family plus compact maze quality stats for maintained-browser proof |
| active-play HUD timer and goal arrow | `src/legacy-runtime/legacyPlayHud.ts`, `src/scenes/MenuScene.ts#drawHud()` | `tests/reset/legacy-play-hud.test.ts`, `tests/reset/legacy-reset.test.ts`, desktop/mobile play-route screenshots, `window.__MAZER_VISUAL_DIAGNOSTICS__` with bare `timerText`, `arrowAngleRadians`, and `arrowAngleDegrees`; source-shaped minimal Timer/EndArrow chrome |
| fixed menu maze shape | `src/legacy-runtime/legacyMenuSnapshot.ts` | `tests/reset/legacy-reset.test.ts`, screenshots |
| generated play maze | `src/legacy-runtime/legacyMaze.ts` | `tests/reset/legacy-reset.test.ts`; includes source-shaped checkpoint pathing, shortcut bridges, disconnected-floor pruning, and weak-goal rebasing for playable browser topology |
| menu title/board/button layout math | `src/legacy-runtime/legacyMenuLayout.ts`, `src/legacy-runtime/legacyMenuTitle.ts` | `tests/reset/legacy-menu-layout.test.ts`, `tests/reset/legacy-menu-title.test.ts`; `menu-generated` uses a tighter ultra-narrow title cap than fixed screenshot snapshots so dense procedural boards stay legible in the maintained side browser |
| menu demo behavior | `src/legacy-runtime/legacyMenuDemoLifecycle.ts`, `src/legacy-runtime/legacyDemoWalker.ts`, `src/domain/ai/demoWalker.ts` | `tests/ai/demo-walker.test.ts`, `tests/reset/legacy-menu-demo-lifecycle.test.ts`, live menu preview; humanized wrong-branch recovery must reconnect through adjacent floor movement, not a non-adjacent canonical splice, representative first-mistake routes must stay bounded instead of continuing exploratory construction after cue evidence exists, and cue labels must not reintroduce independent AI timers |
| options field parsing | `src/legacy-runtime/legacyOptionFields.ts` | `tests/reset/legacy-option-fields.test.ts` |
| options + pause field commit roles | `src/legacy-runtime/legacyOverlayFieldCommit.ts`, `src/scenes/MenuScene.ts` | `tests/reset/legacy-overlay-field-commit.test.ts`, `tests/reset/legacy-reset.test.ts` |
| features + game-modes toggle routing | `src/legacy-runtime/legacyOverlayToggleFields.ts`, `src/scenes/MenuScene.ts` | `tests/reset/legacy-overlay-toggle-fields.test.ts`, `tests/reset/legacy-reset.test.ts` |
| nested overlay return routing | `src/legacy-runtime/legacyOverlayRouting.ts`, `src/scenes/MenuScene.ts` | `tests/reset/legacy-overlay-routing.test.ts`, `tests/reset/legacy-reset.test.ts` |
| pause command routing | `src/legacy-runtime/legacyPauseLifecycle.ts`, `src/scenes/MenuScene.ts` | `tests/reset/legacy-pause-lifecycle.test.ts`, `tests/reset/legacy-reset.test.ts` |
| legacy defaults/colors/button labels | `src/legacy-runtime/legacyDefaults.ts` | `tests/reset/legacy-reset.test.ts` |
| archived visual truth | `legacy/screenshots/menu-01.png` .. `menu-04.png` | direct visual comparison |
| archived behavior truth | `legacy/old-project.zip`, `docs/legacy/*` | `npm run legacy:extract` |
| parity contract / open gaps | `docs/current-truth.md`, `docs/research/MAZER_LEGACY_WEB_PARITY_MATRIX.md`, `docs/research/MAZER_LEGACY_ONE_TO_ONE_COMPLETION_MARKER.md` | latest packet + repo proof |

Rule:

- if you cannot name the owner surface and proof surface for a change, the change is not ready to make

## Reset-lane state map

This is the active state contract for the current app front door.

| State family | Values | Owner | Notes |
| --- | --- | --- | --- |
| runtime mode | `menu` / `play` | `src/scenes/MenuScene.ts` | decides whether menu-generated or play-generated runtime behavior is active |
| active overlay | `none` / `options` / `features` / `gameModes` / `pause` | `src/scenes/MenuScene.ts` | exactly one overlay at a time |
| settings | `LegacySettings` | `src/legacy-runtime/legacyDefaults.ts`, `src/legacy-runtime/legacyOptionFields.ts`, `src/scenes/MenuScene.ts` | menu and pause fields mutate this contract |
| current maze snapshot | `LegacyMazeSnapshot` | `src/legacy-runtime/legacyMaze.ts` | menu mode uses `createLegacyGeneratedMenuMaze()`, play mode uses `createLegacyMaze()`, and `createLegacyMenuMaze()` remains a fixed screenshot fixture |
| menu demo episode/config/state | `MazeEpisode`, `DemoWalkerConfig`, `DemoWalkerState` | `src/legacy-runtime/legacyDemoWalker.ts`, `src/domain/ai/demoWalker.ts`, `src/scenes/MenuScene.ts` | menu-only attract route and preroll truth |
| player/trail/goal live state | `player`, `trail`, `goal` | `src/scenes/MenuScene.ts` | trail presentation differs between menu and play, but ownership stays local to the scene |
| visual diagnostics | `window.__MAZER_VISUAL_DIAGNOSTICS__` | `src/scenes/MenuScene.ts` | visual proof scripts treat this as route-aware readback, not gameplay truth |
| runtime diagnostics | `window.__MAZER_RUNTIME_DIAGNOSTICS__`, `data-mazer-runtime-diagnostics` | `src/scenes/menuRuntimeDiagnostics.ts`, `src/scenes/MenuScene.ts` | runtime proof now publishes from the actual scene loop when `runtimeDiagnostics=1`; browser automation still may not see the `window` globals directly, but the DOM attribute is the repo-owned fallback surface and now exposes active menu-demo cue, route shape, mistake-enabled lane state, AI wrong-branch/backtrack/recovery counters, generation stage cursor, stage-6 draw progress, and compact maze source/build/quality readback without drawing visible debug text |

## End-to-end flow map

Use this when you need to understand the app as a system instead of a file list.

1. Boot:
   `src/boot/main.ts` clears localhost service-worker/cache drift, then starts Phaser through `src/boot/phaserConfig.ts`.
2. Scene handoff:
   `src/scenes/BootScene.ts` hands off immediately to `src/scenes/MenuScene.ts`.
3. Front door build:
   `MenuScene` resolves layout, builds the live procedural menu maze through `createLegacyGeneratedMenuMaze()`, and publishes diagnostics.
4. Menu attract motion:
   `createLegacyDemoWalkerEpisode()` + `createLegacyMenuSnapshotDemoWalkerConfig()` + `createLegacyMenuDemoBootstrap()` + `advanceDemoWalker()` drive the menu-only trail/player motion.
5. User entry:
   `Start` calls `startPlayMode()`, which swaps the runtime over to `createLegacyMaze()` and hides the title lockup.
6. Overlay mutation:
   `Options`, `Features`, `Game Modes`, and `Pause` all route through the single `overlay` state in `MenuScene`.
7. Field commits:
   `applyLegacyOptionField()` normalizes draft values, `legacyOverlayFieldCommit.ts` classifies them into deferred reload-on-back vs immediate camera-flag roles, and `MenuScene` applies the resulting rebuild/layout effects.
8. Active play:
   movement, win/reset return, pause routing, and generated-board rendering stay inside `MenuScene`; source-exact timer HUD formatting and goal-arrow radians/degrees geometry route through `legacyPlayHud.ts` before `MenuScene.drawHud()` renders them through a minimal Timer/EndArrow visual lane.
9. Proof readback:
   visual scripts and live checks read `window.__MAZER_VISUAL_DIAGNOSTICS__`; reset-lane tests assert the stable contracts under `tests/reset/*`.

### Generation / reset owner chain

Use this before changing how mazes are built or how play/menu returns regenerate state.

- `docs/legacy/gameplay-spec.md`
  - legacy truth for staged `_ProcessCount` generation and process `8` reset behavior
- `src/legacy-runtime/legacyMaze.ts`
  - current one-shot maze builders:
  - `createLegacyGeneratedMenuMaze()` for live procedural menu mazes
  - `createLegacyMaze()` for generated play mazes
  - `createLegacyMenuMaze()` for the fixed front-door screenshot fixture
  - active reset-lane play topology through a source-shaped checkpoint path-builder instead of the previous DFS perfect-maze owner
  - `CreateGrid` equivalent: square floor grid with non-floor borders
  - `MapPath` / `Backtrack` equivalent: checkpoint selection, mixed next-tile choice, local path-neighbor validation, longest-path end selection, and source-shaped resume from the next tile selected by backtracking
  - `CreatePath` equivalent: path-neighbor wall-array collection with duplicate/stale candidate preservation
  - `CreateShortCuts` equivalent: explicit legacy shortcut budget, restored opposite-corridor wall-neighbor rule, and random `_WallArray` removal loop
  - playable-topology normalization: after shortcut creation, generated play mazes prune disconnected floor components and rebase trivially weak goals to the farthest reachable floor; this is a browser-port quality guard, while exact Unreal RNG/time seeding remains open
- `src/domain/maze/core.ts`
  - browser-native Wilson/topology builder for domain/proof maze families outside the active reset-lane play snapshot owner
  - family-aware shortcut braiding profiles for classic, braided, sparse, dense, framed, and split-flow
  - bounded route-aware braided bypass pass after endpoint selection, requiring separated canonical-route reconnection and recording accepted openings as braid-phase generation trace steps
  - route-aware bypass scoring balances legacy path-bridge candidates against off-path alternatives before rasterization
- `src/domain/maze/generator.ts`
  - rasterizes core topology into the playable tile board
  - applies the additive legacy `CreateShortCuts` opposite-corridor bridge rule using `TILE_FLOOR` walkability semantics instead of the browser-only canonical `TILE_PATH` flag
  - appends accepted raster bridge openings as braid-phase generation trace steps and includes them in shortcut/difficulty accounting
  - still not the active reset-lane `createLegacyMaze()` owner
- `src/legacy-runtime/legacyGenerationLifecycle.ts`
  - legacy process stage ids
  - menu-vs-play build routing
  - deterministic seed stepping for rebuild approximations
  - explicit checkpoint and shortcut budget formulas for the active runtime scale/mode
  - explicit delay-gated process-0 entry contract for queued generation
  - explicit level-building scheduler contract for start-time + delay-start flag ownership, with honest `durationMs = null` until the old `_LevelBuildingLogicDelayDuration` value is recovered
  - queued generation/reset request reasons and tick-consumption contract
  - explicit stage `0/3/4/5/6` execution cadence contract for menu-sliced versus play-continuous generation
  - explicit stage completion signals, next-stage transitions, and stage-5 skip-to-6 progression contract
  - shortcut-disabled plans now advance stage `4` directly to stage `6` when process `5` is not present
  - explicit stage-7 finalize state for spawn, title visibility, and play timer start
  - generation metadata attached to runtime-created mazes
  - queued generation requests now carry build, stage, budget, arm-time, delay-gate, and stage-cursor metadata before tick consumption
  - consumed runtime mazes now carry a stage-cursor projection for stage-7 finalization while the full staged generator remains open
  - `createLegacyMenuResetGenerationRequest()` owns the menu-demo process-8-to-process-0 handoff after reset consumption
- `src/legacy-runtime/legacyPlayLifecycle.ts`
  - explicit process-8 reset request contract for:
  - active-play return-to-menu hold
  - menu-demo regenerate-in-place branch
  - explicit initialized process-8 entry contract for reset consumption, including the branch-level delay bypass truth
- `src/scenes/MenuScene.ts`
  - `applyGenerationRequest()` rehydrates maze, player, trail, demo state, HUD, and layout from a named request
  - `queueGenerationRequest()` stages delayed menu/play rebuilds instead of collapsing every branch into immediate rebuild calls
  - `armLegacyMenuStaticDrawStage()` and `advanceLegacyMenuStaticDrawStage()` apply the menu stage-6 row-slice draw contract to static-board rendering, including the menu-only row cadence gate
  - runtime diagnostics bridge live maze provenance through `generation.maze`, including menu/play source, build kind, solution path length, shortcut stats, checkpoint path-builder stats, playable-topology stats, and route-quality classification
  - runtime diagnostics bridge live stage-6 draw progress through `resolveMenuSceneGenerationDrawStageProgress()`
  - `pendingResetRequest` now carries the explicit process-8 branch until the scene update consumes it
  - `consumeResetRequest()` now converts menu-demo process-8 reset into a pending process-0 generation request instead of regenerating inline
  - runtime diagnostics now publish generation budget metadata, process-entry gates, queue arm time, and full pending request contract state
  - `startPlayMode()` swaps from menu shell into active-play generation
  - `enterMenuMode()` returns active play back into menu flow after reset
  - `drawHud()` renders the compact bare timer and goal arrow from `resolveLegacyPlayHudFrame()` with minimal source-shaped widget chrome and publishes HUD proof bounds plus radians/degrees readback

Boundary:

- if the change is "what active play topology gets generated?", start in `src/legacy-runtime/legacyMaze.ts`; inspect `src/domain/maze/core.ts` only for non-reset-lane domain/proof families
- if the change is "how shortcut branches or alternate start-goal routes are carved?", start in `src/legacy-runtime/legacyMaze.ts` for active reset-lane checkpoint/backtrack and `_WallArray` shortcut selection, then inspect `src/domain/maze/core.ts` at `braidMaze()`, `resolveBraidShortcutProfile()`, `measureRouteReconnectionSpan()`, and `applyRouteAwareBypassPass()`, then inspect `src/domain/maze/generator.ts` at the raster legacy bridge pass
- if the change is "which builder, seed step, or process-stage contract applies?", start in `src/legacy-runtime/legacyGenerationLifecycle.ts`
- if the change is "what checkpoint/shortcut budget does the current runtime claim?", start in `src/legacy-runtime/legacyGenerationLifecycle.ts` and `window.__MAZER_VISUAL_DIAGNOSTICS__`
- if the change is "what legacy gate causes process 0 or process 8 to enter?", start in `src/legacy-runtime/legacyGenerationLifecycle.ts` and `src/legacy-runtime/legacyPlayLifecycle.ts`
- if the change is "what exactly owns the level-building delay gate or reset bypass semantics?", start in `docs/legacy/gameplay-spec.md`, `src/legacy-runtime/legacyGenerationLifecycle.ts`, and `src/legacy-runtime/legacyPlayLifecycle.ts`
- if the change is "which stage advances where, which stage can skip ahead, or which stage cursor diagnostics should publish?", start in `docs/legacy/gameplay-spec.md` and `src/legacy-runtime/legacyGenerationLifecycle.ts`
- if the change is "why does small-maze generation skip process `5`?", start in `resolveLegacyGenerationBudgetContract()` and `resolveLegacyGenerationExecutionPlan()`
- if the change is "why does the menu board reveal by rows after generation?", start in `MenuScene.armLegacyMenuStaticDrawStage()`, `MenuScene.advanceLegacyMenuStaticDrawStage(time)`, `resolveMenuSceneGenerationDrawStageProgress()`, and the stage-6 execution plan
- if the change is "what is the menu AI currently doing?", start in `docs/research/MAZER_MENU_GENERATION_AI_LOOP_MAP.md`, then inspect `src/domain/ai/demoWalker.ts` and `menuDemoState.telemetry` in `MenuScene.publishRuntimeDiagnostics()`
- if the change is "when does the runtime rebuild or return to menu?", start in `src/scenes/MenuScene.ts`
- if the change is "what should the active-play timer text, minute wrap, goal-arrow angle, or HUD proof bounds be?", start in `src/legacy-runtime/legacyPlayHud.ts`, then inspect `MenuScene.drawHud()`
- if the change is "how do we port the old staged process `0/3/4/5/6/7/8` lifecycle exactly?", start from `docs/legacy/gameplay-spec.md` and open a dedicated port packet before rewriting runtime code

## Input-to-owner routing

This is the fastest way to answer "if I click or press this, what actually owns it?"

| Trigger | First owner | Downstream owner chain |
| --- | --- | --- |
| `Enter` on menu / `Start` click | `MenuScene.startPlayMode()` | `createLegacyMaze()` -> play-mode player/trail/HUD |
| `Options` click | `MenuScene.openOverlay('options')` | `legacyOptionFields.ts` -> settings/layout/maze rebuild |
| `Features` click | `MenuScene.openNestedOverlay('features', ...)` | `legacyOverlayToggleFields.ts` -> menu or pause overlay toggle state |
| `Game Modes` click | `MenuScene.openNestedOverlay('gameModes', ...)` | `legacyOverlayToggleFields.ts` -> dark-mode flag -> backdrop/static-board redraw |
| `Escape` | `MenuScene.handleBackAction()` | close overlay, open pause, or return to menu depending on current state |
| `Back` / `Reset` / `Main Menu` inside pause | `MenuScene.applyLegacyPauseCommand()` | `legacyPauseLifecycle.ts` -> overlay close, player reset, or menu return |
| movement keys / arrows | `MenuScene.handleLegacyPlayMovementKeyDown()` | `legacyPlayStep.ts` input buffer -> `MenuScene.tryMovePlayer()` -> `legacyMaze.ts` walkability gate -> trail/win reset |
| menu screenshot parity tweak | `legacyMenuSnapshot.ts`, `legacyMenuLayout.ts`, `MenuScene.ts` | geometry -> composition -> presentation |

## Active reset-lane subsystems

### Front door + play shell

- `src/scenes/MenuScene.ts`
  - runtime mode switch: `menu` vs `play`
  - overlay switch: `none | options | features | gameModes | pause`
  - front-door button behavior
  - title lockup opacity, scale, and vertical placement
  - board slab/frame presentation and menu-only chrome
  - active-play movement
  - HUD timer and goal arrow rendering from `src/legacy-runtime/legacyPlayHud.ts`
  - menu demo stepping
  - reset return path
  - visual diagnostics published for visual proof

- `src/legacy-runtime/legacyPlayLifecycle.ts`
  - active-play goal-reset hold duration
  - explicit reset-request action/due-time contract
  - pending-reset gate for input and movement
  - due-reset return timing contract for active play and menu demo goal branches
  - single active-play process-8 reset-return authority through `LegacyResetRequest`

- `src/legacy-runtime/legacyPlayStep.ts`
  - restored simultaneous-key input buffer contract
  - held direction flag vector resolution
  - mobile pointer board-bounds admission
  - one-tile cardinal movement
  - axis-gated wall-collision resolution
  - simultaneous blocked-axis slide and diagonal corner-block behavior
  - trail append and trim behavior
  - goal-step detection

- `src/legacy-runtime/legacyMenuDemoLifecycle.ts`
  - menu demo bootstrap and preroll
  - menu demo trail/player projection
  - per-frame demo advance projection
  - immediate menu goal-reset process-8 request after reset-hold
  - AI-only reset replay contract without menu-maze regeneration

- `src/legacy-runtime/legacyOverlayFieldCommit.ts`
  - explicit `scale-change` / `material-change` / `camera-flag` commit classes
  - deferred reload-on-back for scale/material fields
  - immediate camera-flag semantics for `camScale`

- `src/legacy-runtime/legacyOverlayToggleFields.ts`
  - explicit features and game-modes toggle ownership
  - inverted `On/Off` copy only for legacy features toggles
  - dark-mode field effects and legacy light-intensity role

- `src/legacy-runtime/legacyOverlayRouting.ts`
  - explicit nested overlay open/return routing
  - parent return semantics for `Features` and `Game Modes`
  - `Escape` / `Back` behavior split for play, top-level overlays, and nested overlays

- `src/legacy-runtime/legacyPauseLifecycle.ts`
  - explicit `resume` / `reset-player` / `return-menu` pause command contract
  - legacy-shaped distinction between overlay close, player reset, and menu return

Boundary:

- if the question is "when should play stop accepting input after hitting goal?", start in `src/legacy-runtime/legacyPlayLifecycle.ts`
- if the question is "what exactly changes after one movement key press or held key repeat?", start in `src/legacy-runtime/legacyPlayStep.ts` and `MenuScene.handleLegacyPlayMovementKeyDown()`
- if the question is "how does the front-door demo bootstrap, advance, replay AI-only reset, or hand off after goal reset-hold?", start in `src/legacy-runtime/legacyMenuDemoLifecycle.ts`
- if the question is "what exactly should options/pause field commits mean?", start in `src/legacy-runtime/legacyOverlayFieldCommit.ts`
- if the question is "what exactly should features or game-modes toggles mutate and label?", start in `src/legacy-runtime/legacyOverlayToggleFields.ts`
- if the question is "how should nested overlays return to `options` or `pause`?", start in `src/legacy-runtime/legacyOverlayRouting.ts`
- if the question is "what exactly should Back, Reset, or Main Menu do from pause?", start in `src/legacy-runtime/legacyPauseLifecycle.ts`
- if the question is "what should happen after the reset hold finishes?", start in `src/scenes/MenuScene.ts`

### Menu scene render/update order

Use this before touching presentation code inside `MenuScene.ts` so you know whether a miss belongs to state, layout, or drawing order.

1. `create()`
   - allocates graphics/text layers
   - rebuilds the active maze
   - resolves layout
   - installs keyboard input
2. `update()`
   - advances starfield
   - advances menu demo when `mode=menu` and `overlay=none`
   - redraws backdrop if `backdropDirty`
   - redraws static board shell if `boardStaticDirty`
   - redraws dynamic board + HUD if `boardDynamicDirty`
   - rebuilds UI controls if `uiDirty`
   - republishes `window.__MAZER_VISUAL_DIAGNOSTICS__`
   - republishes `window.__MAZER_RUNTIME_DIAGNOSTICS__` when the runtime-diagnostics contract is enabled
3. static menu composition owners
   - `refreshLayout()` -> board/title/button coordinates
   - `drawStaticBoard()` -> slab shell, board frame, tile grid, grayscale maze body
   - `createButton()` -> menu button outline, alpha, typography treatment
4. live motion owners
   - `updateMenuDemo()` -> attract stepping cadence
   - `drawDynamicBoard()` -> trail, player, goal, camera-follow offset
   - `drawHud()` -> active-play timer + goal arrow only, using `legacyPlayHud.ts` for timer/arrow geometry

Boundary:

- if the board is in the wrong place, start in `legacyMenuLayout.ts`
- if the board is in the right place but looks wrong, start in `MenuScene.ts`
- if the trail or attract route is wrong, start in `legacyDemoWalker.ts` / `demoWalker.ts`

### Menu board visual render roles

Use this before changing how the front door looks without changing the actual maze snapshot truth.

| Concern | Owner |
| --- | --- |
| menu board geometry and button/title placement | `src/legacy-runtime/legacyMenuLayout.ts` |
| fixed legacy snapshot shape | `src/legacy-runtime/legacyMenuSnapshot.ts` |
| menu trench width / connection-aware core continuity / segment-based static strokes / connected light-core material / static edge alpha / path-relief shadow / material contrast / core-vs-grid read | `src/legacy-runtime/legacyMenuRender.ts` + `src/scenes/MenuScene.ts` |
| slab/frame colors and backdrop haze | `src/legacy-runtime/legacyMenuBackdrop.ts` -> `src/scenes/MenuScene.ts#drawBackdrop()` plus `LEGACY_MENU_*` board constants |
| title opacity / shadow / wordmark presence | `src/legacy-runtime/legacyMenuTitle.ts` -> `src/scenes/MenuScene.ts#refreshLayout()` + scene title text setup; `MenuScene` passes `procedural` only when the live maze source is `menu-generated` |
| front-door button box strength / plate proportions / label presence / dark pane fill | `src/legacy-runtime/legacyMenuLayout.ts` -> `src/legacy-runtime/legacyMenuButtonChrome.ts` -> `src/scenes/MenuScene.ts#createButton()` |
| menu attract trail/player colors and corridor footprint | `src/scenes/MenuScene.ts#fillLegacyMenuDynamicPathTile()` + `src/scenes/MenuScene.ts#fillMenuDynamicMarkerTile()` |

Boundary:

- if the board silhouette is wrong, edit `legacyMenuSnapshot.ts`
- if the silhouette is right but the maze reads too chunky or too modern, edit `src/legacy-runtime/legacyMenuRender.ts` and the menu-only board draw path in `MenuScene.ts`

### Modular parity lock sequence

Use this to avoid broad “fix the whole menu” passes. Lock one module at a time, prove it, then move on.

| Module | Owner chain | Proof surface |
| --- | --- | --- |
| title lockup | `src/legacy-runtime/legacyMenuLayout.ts` -> `src/legacy-runtime/legacyMenuTitle.ts` -> `src/scenes/MenuScene.ts` | `tests/reset/legacy-menu-layout.test.ts`, `tests/reset/legacy-menu-title.test.ts`, screenshot comparison |
| button chrome | `src/legacy-runtime/legacyMenuLayout.ts` -> `src/legacy-runtime/legacyMenuButtonChrome.ts` -> `src/scenes/MenuScene.ts#createButton()` | `tests/reset/legacy-menu-layout.test.ts`, `tests/reset/legacy-menu-button-chrome.test.ts`, screenshot comparison |
| board silhouette | `src/legacy-runtime/legacyMenuSnapshot.ts` -> `src/legacy-runtime/legacyMaze.ts` -> `src/scenes/MenuScene.ts` | `tests/reset/legacy-reset.test.ts`, screenshot comparison |
| board material / tile read | `src/legacy-runtime/legacyMenuRender.ts` -> `src/scenes/MenuScene.ts#drawStaticBoard()` | `tests/scenes/menu-render-frame.test.ts`, screenshot comparison |
| backdrop field | `src/legacy-runtime/legacyMenuBackdrop.ts` -> `src/scenes/MenuScene.ts#drawBackdrop()` | `tests/reset/legacy-menu-backdrop.test.ts`, screenshot comparison |
| demo route / pacing | `src/legacy-runtime/legacyDemoWalker.ts` -> `src/domain/ai/demoWalker.ts` -> `src/scenes/MenuScene.ts` | `tests/ai/demo-walker.test.ts`, `tests/reset/legacy-menu-demo-lifecycle.test.ts`, live preview |

Rule:

- do not modify more than one module family in a single parity packet unless one owner chain is unusable without the other
- if a miss can be described as one row in this table, keep the packet at that row
- move the repo-wide 1:1 percent only when one of these module families or a larger weighted segment in the completion marker has proof-backed state change

### Legacy settings + menu shell helpers

- `src/legacy-runtime/legacyDefaults.ts`
  - canonical legacy defaults
  - `Exit / Start / Options`
- `src/legacy-runtime/legacyMenuLayout.ts`
  - title, board, and button frame math
  - spacing contract between board edge and `Exit / Start / Options`
- `src/legacy-runtime/legacyOptionFields.ts`
  - text-field draft parsing and settings mutation
  - maze-affecting option edits now defer runtime rebuild until overlay close, matching the legacy menu/pause contract more closely

### Menu-board ownership

- `src/legacy-runtime/legacyMenuSnapshot.ts`
  - fixed screenshot-shaped front-door board blueprint
  - named branch groups for silhouette tweaking
  - projects the named 25-space branch blueprint into a 49-cell browser grid for screenshot-facing menu density
  - safest place to edit menu-only maze geometry

- `src/legacy-runtime/legacyMaze.ts`
  - generated maze builder for play mode
  - adapter that converts the fixed menu snapshot blueprint into a `LegacyMazeSnapshot`
  - tags snapshots with `source: 'menu-generated'`, `source: 'play-generated'`, or `source: 'menu-snapshot'` so demo policy does not infer identity from grid size

Boundary:

- If the change is menu screenshot parity only, start in `legacyMenuSnapshot.ts`
- If the change is active-play maze truth, start in `legacyMaze.ts`

### Fixed menu snapshot branch map

Use this before editing `legacyMenuSnapshot.ts` so you know which named branch is changing which part of the board.

| Branch id | Current role |
| --- | --- |
| `upper-ridge` | top-left to upper-mid ridge mass above the title trench |
| `top-spine` | highest top run that keeps the upper plate from reading too open |
| `upper-left-pocket` | small left interior inset that keeps the upper-left from flattening out and now climbs back toward the title plate |
| `upper-left-lattice` | nested upper-left trench family that restores the carved corner density beside the wordmark |
| `upper-right-lattice` | nested upper-right/title-adjacent trench family that reduces the coarse right-side title plate |
| `left-frame` | tall left outer frame and lower-left anchor, now extending slightly higher to strengthen the upper-left edge |
| `center-band` | center horizontal trench with the mid-board rightward turn |
| `center-pocket` | center-right pocket that feeds the diagonal/lower transition |
| `title-trench` | dark top-center trench behind and around the wordmark |
| `title-underlay-band` | upper-mid trench run below the wordmark that keeps the title plate from reading hollow |
| `left-interior-drop` | mid-left vertical drop that keeps the left interior from reading hollow |
| `mid-left-shelf` | left-middle shelf that thickens the interior mass before the diagonal drop |
| `lower-left-shelves` | lower-left nested shelf family that reduces the oversized empty block below the mid-left shelf |
| `diagonal-upper` | upper diagonal staircase family crossing toward the center |
| `diagonal-lower` | lower diagonal staircase family that leads toward the goal-side mass |
| `lower-band` | long lower trench across the lower-left and lower-middle plate |
| `lower-floor-trench` | bottom floor trench that thickens the late lower-right approach |
| `lower-center-loop` | lower-center loop/pocket just above the bottom trench |
| `right-pocket` | tall right-side outer pocket that shapes the goal-side silhouette |
| `right-spine` | right-side inner spine and lower-right return |
| `right-lower-notch` | small lower-right notch that keeps the outer goal lane stepped |
| `right-inner-pocket` | inner-right pocket that thickens the mid-right trench family |

Rule:

- add or move snapshot density by editing the named branch that matches the visible miss
- only change the `solutionPath` when the actual attract-route truth is wrong, not just the screenshot mass

### Menu-board render chain

- `src/legacy-runtime/legacyMenuSnapshot.ts`
  - owns the fixed menu blueprint polylines and named silhouette branches
- `src/legacy-runtime/legacyMaze.ts`
  - converts that blueprint into the boolean walkable grid used by the runtime
- `src/scenes/MenuScene.ts`
  - renders the board shell, maze tiles, trail, player, goal, and title lockup onto the front door
- `src/legacy-runtime/legacyMenuRender.ts`
  - owns menu-only trench edge/core frame math, including connection-aware light-core continuity and segment-based connected strokes for the static front-door board
- `src/scenes/MenuScene.ts`
  - owns static board material role colors and currently renders dark edge segments, connected light-gray cores, and a dark offset relief shadow for the menu board
  - owns menu dynamic trail/start/goal/player overlay footprint ratios through `LEGACY_MENU_DYNAMIC_*` constants
- `tests/reset/legacy-reset.test.ts`
  - holds the direct tile assertions that keep screenshot-only branch additions from drifting silently

### Menu demo / attract behavior

- `src/legacy-runtime/legacyDemoWalker.ts`
  - adapts legacy maze snapshots into demo-walker episodes/config
  - fixed-snapshot menu-only demo policy and deterministic preroll
- `src/domain/ai/demoWalker.ts`
  - deterministic demo stepping, backtracking, goal hold, reset hold
  - source-shaped menu AI route planning from live neighbor scans, idempotent potential-tile targeting, path-stack rewind, first-recovery AI reset seam, connected floor-path reacquire, bounded first-mistake route construction, and canonical replay after reset
  - cue overrides for branch commit, dead-end, backtrack, and reacquire beats, with one movement cadence matching the extracted `_PlayerAiDelayDuration` timer shape
  - legacy `AiTilePathCheck`-style wrong-turn candidate admission: a non-end branch candidate must expose at least one unvisited onward floor tile besides the current tile

Boundary:

- route shape lives in the legacy snapshot/generator
- route behavior over time lives in the demo walker
- if a future demo-route miss is about selecting, rejecting, backtracking branch candidates, or reconnecting recovery to canonical replay, start in `src/domain/ai/demoWalker.ts` and prove it with `tests/ai/demo-walker.test.ts`

## Legacy document ownership

- `docs/legacy/art-direction.md`
  - screenshot-derived visual rules
- `docs/legacy/ui-spec.md`
  - overlay and button behavior truth
- `docs/legacy/gameplay-spec.md`
  - process-count generation and reset behavior truth
- `docs/legacy/file-map.md`
  - original Unreal owner map

## Proof and validation surfaces

### Closure spine

- `npm run legacy:extract`
- `npm run verify`
- `docs/research/MAZER_LEGACY_ONE_TO_ONE_COMPLETION_MARKER.md`

### Localhost proof operation

- keep one maintained preview server on `http://127.0.0.1:4173/`
- use the in-app browser as the default live proof surface for the current branch
- after code changes, reload the existing `4173` tab before judging the UI
- only branch into extra localhost ports or alternate proof surfaces when a packet explicitly requires it
- when legacy desktop screenshot parity is the actual question, widen that same tab temporarily instead of spawning more browser windows, then reset the viewport after proof

What `verify` currently means:

- reset tests
- demo walker tests
- production build

### Visual comparison surfaces

- `npm run visual:matrix -- --preset core --skip-build true`
  - layout artifact pack under `tmp/captures/mazer-layout-matrix/*`
- `npm run edge:live`
  - live route/console proof
- in-app browser on localhost
  - fastest human truth check for the active surface
- `window.__MAZER_VISUAL_DIAGNOSTICS__`
  - board bounds plus live reset-lane runtime pointers:
  - mode / overlay
  - maze size, player, goal
  - HUD bare timer text, arrow radians/degrees, timer/arrow/bounds rectangles, and the minimal source-shaped active HUD visual lane
  - trail tail
  - menu-demo phase / cue / path cursor / preroll / wrong-turn policy
- `window.__MAZER_RUNTIME_DIAGNOSTICS__`
  - runtime-diagnostics readback for frame-window, low-power, and publish-cadence truth when enabled
  - current caveat: browser automation still may not surface the `window.__MAZER_*` globals directly even while the localhost canvas renders
- `data-mazer-runtime-diagnostics`
  - serialized DOM fallback for repo tooling and browser automation readback
  - contains `generation.maze.source` / `generation.maze.buildKind` so the maintained browser can prove `menu-generated` versus `play-generated` without depending on hidden window globals
- visible diagnostics DOM node
  - removed from the current runtime; `runtimeDiagnostics=1` is data-only and must not append visible proof text to the game surface

### Repo-owned tests most relevant to this lane

- `tests/reset/legacy-reset.test.ts`
  - front door, menu snapshot, HUD/minimal play shell, localhost boot cleanup
- `tests/reset/legacy-play-hud.test.ts`
  - active-play bare timer formatting, `% 10` minute wrap, goal-arrow radians/degrees math, minimal widget chrome, and HUD bounds proof
- `tests/reset/legacy-menu-layout.test.ts`
  - board/button/title layout contract
- `tests/reset/legacy-option-fields.test.ts`
  - options input behavior
- `tests/ai/demo-walker.test.ts`
  - demo AI/reset-flow proof

## Parked/support surfaces

These are part of the repo map, but not the current shipping/reset truth:

- `src/future-runtime/**`
  - future Phaser and planet/3D experiments
- `src/visual-proof/**`
  - proof-only rendering/runtime lane
- `src/mazer-core/**`
  - bounded core/runtime research lane
- `src/topology-proof/**`
  - topology proof surfaces
- `src/watch-pass-*`
  - separate watch-pass explorations
- `src/projections/**`
  - native/export projection experiments

Rule:

- do not pull these lanes into reset-lane claims unless a packet explicitly reopens them

## Practical edit map

If you want to change one thing, start here:

- menu board silhouette:
  - `src/legacy-runtime/legacyMenuSnapshot.ts`
  - `tests/reset/legacy-reset.test.ts`
- menu board frame, title, button placement:
  - `src/legacy-runtime/legacyMenuLayout.ts`
  - `src/scenes/MenuScene.ts`
- menu-only slab/frame/title/button parity:
  - `src/scenes/MenuScene.ts`
  - `docs/legacy/art-direction.md`
  - `legacy/screenshots/menu-01.png` .. `menu-04.png`
- menu demo timing or route progression:
  - `src/legacy-runtime/legacyMenuDemoLifecycle.ts`
  - `src/legacy-runtime/legacyDemoWalker.ts`
  - `src/domain/ai/demoWalker.ts`
  - `src/scenes/MenuScene.ts`
- play reset timing / return gate:
  - `src/legacy-runtime/legacyPlayLifecycle.ts`
  - `src/scenes/MenuScene.ts`
  - `tests/reset/legacy-play-lifecycle.test.ts`
- play movement / trail mutation:
  - `src/legacy-runtime/legacyPlayStep.ts`
  - `src/scenes/MenuScene.ts`
  - `tests/reset/legacy-play-step.test.ts`
- play movement or win/reset loop:
  - `src/scenes/MenuScene.ts`
  - `docs/legacy/gameplay-spec.md`
- generation / reset lifecycle:
  - `docs/legacy/gameplay-spec.md`
  - `src/legacy-runtime/legacyGenerationLifecycle.ts`
  - `src/legacy-runtime/legacyMaze.ts`
  - `src/scenes/MenuScene.ts`
  - `tests/reset/legacy-reset.test.ts`
  - `tests/reset/legacy-generation-diagnostics.test.ts`
- options/features/game modes/pause fields:
  - `src/legacy-runtime/legacyOptionFields.ts`
  - `src/scenes/MenuScene.ts`
- HUD timer / goal arrow:
  - `src/legacy-runtime/legacyPlayHud.ts`
  - `src/scenes/MenuScene.ts`
  - `tests/reset/legacy-play-hud.test.ts`
- localhost boot weirdness:
  - `src/boot/main.ts`
- live boot diagnostics:
  - `src/boot/bootStatus.ts`
  - `src/boot/main.ts`
  - `tests/boot/boot-status.test.ts`
- scene wiring or startup:
  - `src/boot/phaserConfig.ts`
  - `src/scenes/BootScene.ts`

## Fast visual parity workflow

For menu-screen 1:1 work, use this sequence every time:

1. `legacy/screenshots/menu-01.png` .. `menu-04.png`
2. `src/legacy-runtime/legacyMenuSnapshot.ts` for maze-shape mass
3. `src/legacy-runtime/legacyMenuLayout.ts` for board/title/button placement
4. `src/scenes/MenuScene.ts` for slab colors, tile rendering, title opacity, and button treatment
5. `tests/reset/legacy-reset.test.ts`
6. `tests/reset/legacy-menu-layout.test.ts`
7. live localhost in the in-app browser

This keeps visual passes bounded:

- geometry in the snapshot
- composition in the layout contract
- presentation in the scene

## Legacy menu parity hotspots

When the page still feels wrong but the board route is already close, use this quick owner map instead of guessing:

| Visible miss | First owner |
| --- | --- |
| title too low / too high | `src/legacy-runtime/legacyMenuLayout.ts` |
| board too small / too large | `src/legacy-runtime/legacyMenuLayout.ts` |
| board shell too flat / too clean | `src/scenes/MenuScene.ts` -> `drawStaticBoard()` |
| button boxes too loud / too weak | `src/scenes/MenuScene.ts` -> `createButton()` |
| maze silhouette still reads empty | `src/legacy-runtime/legacyMenuSnapshot.ts` |
| trail route or pacing feels wrong | `src/legacy-runtime/legacyDemoWalker.ts`, `src/domain/ai/demoWalker.ts` |
| live page loads but differs from capture | rerun `npm run visual:matrix` and compare with localhost before editing again |

## Invariants to preserve

- gameplay truth comes from the restored Unreal project
- visual truth comes from `legacy/screenshots/*`
- the repo-wide 1:1 percent lives in `docs/research/MAZER_LEGACY_ONE_TO_ONE_COMPLETION_MARKER.md`
- menu mode and play mode stay split
- one active overlay at a time
- menu screenshot work must not silently rewrite play behavior
- do not claim 1:1 until the parity gaps are actually closed
