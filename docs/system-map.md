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
| `src/legacy-runtime/*` | legacy-owned defaults, menu layout, menu snapshot, maze conversion, option field parsing, overlay field-commit contracts, overlay toggle contracts, overlay routing contracts, pause command contracts |
| `src/domain/ai/*` | deterministic demo walker stepping and attract behavior |
| `src/domain/maze/*` | generated maze/runtime domain logic used outside the fixed menu snapshot |
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
| active front door and play shell | `src/scenes/MenuScene.ts` | in-app browser, `npm run verify` |
| live runtime diagnostics bridge | `src/scenes/menuRuntimeDiagnostics.ts`, `src/scenes/MenuScene.ts` | `tests/scenes/menu-runtime-diagnostics.test.ts`, `tests/reset/legacy-reset.test.ts`, `tests/visual/edge-live-check.test.ts`, localhost |
| fixed menu maze shape | `src/legacy-runtime/legacyMenuSnapshot.ts` | `tests/reset/legacy-reset.test.ts`, screenshots |
| generated play maze | `src/legacy-runtime/legacyMaze.ts` | `tests/reset/legacy-reset.test.ts` |
| menu title/board/button layout math | `src/legacy-runtime/legacyMenuLayout.ts` | `tests/reset/legacy-menu-layout.test.ts` |
| menu demo behavior | `src/legacy-runtime/legacyDemoWalker.ts`, `src/domain/ai/demoWalker.ts` | demo-walker tests, live menu preview |
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
| runtime mode | `menu` / `play` | `src/scenes/MenuScene.ts` | decides whether the fixed menu snapshot or generated play maze is active |
| active overlay | `none` / `options` / `features` / `gameModes` / `pause` / `message` | `src/scenes/MenuScene.ts` | exactly one overlay at a time |
| settings | `LegacySettings` | `src/legacy-runtime/legacyDefaults.ts`, `src/legacy-runtime/legacyOptionFields.ts`, `src/scenes/MenuScene.ts` | menu and pause fields mutate this contract |
| current maze snapshot | `LegacyMazeSnapshot` | `src/legacy-runtime/legacyMaze.ts` | menu mode uses `createLegacyMenuMaze()`, play mode uses `createLegacyMaze()` |
| menu demo episode/config/state | `MazeEpisode`, `DemoWalkerConfig`, `DemoWalkerState` | `src/legacy-runtime/legacyDemoWalker.ts`, `src/domain/ai/demoWalker.ts`, `src/scenes/MenuScene.ts` | menu-only attract route and preroll truth |
| player/trail/goal live state | `player`, `trail`, `goal` | `src/scenes/MenuScene.ts` | trail presentation differs between menu and play, but ownership stays local to the scene |
| visual diagnostics | `window.__MAZER_VISUAL_DIAGNOSTICS__` | `src/scenes/MenuScene.ts` | visual proof scripts treat this as route-aware readback, not gameplay truth |
| runtime diagnostics | `window.__MAZER_RUNTIME_DIAGNOSTICS__`, `data-mazer-runtime-diagnostics`, `#mazer-runtime-diagnostics` | `src/scenes/menuRuntimeDiagnostics.ts`, `src/scenes/MenuScene.ts` | runtime proof now publishes from the actual scene loop when `runtimeDiagnostics=1`; browser automation still may not see the `window` globals directly, but the DOM attribute and visible panel are repo-owned fallback surfaces |

## End-to-end flow map

Use this when you need to understand the app as a system instead of a file list.

1. Boot:
   `src/boot/main.ts` clears localhost service-worker/cache drift, then starts Phaser through `src/boot/phaserConfig.ts`.
2. Scene handoff:
   `src/scenes/BootScene.ts` hands off immediately to `src/scenes/MenuScene.ts`.
3. Front door build:
   `MenuScene` resolves layout, builds the fixed menu snapshot through `createLegacyMenuMaze()`, and publishes diagnostics.
4. Menu attract motion:
   `createLegacyDemoWalkerEpisode()` + `createLegacyMenuSnapshotDemoWalkerConfig()` + `advanceDemoWalker()` drive the menu-only trail/player motion.
5. User entry:
   `Start` calls `startPlayMode()`, which swaps the runtime over to `createLegacyMaze()` and hides the title lockup.
6. Overlay mutation:
   `Options`, `Features`, `Game Modes`, `Pause`, and `Message` all route through the single `overlay` state in `MenuScene`.
7. Field commits:
   `applyLegacyOptionField()` normalizes draft values, `legacyOverlayFieldCommit.ts` classifies them into deferred reload-on-back vs immediate camera-flag roles, and `MenuScene` applies the resulting rebuild/layout effects.
8. Active play:
   movement, timer HUD, goal arrow, win/reset return, and pause routing all stay inside `MenuScene`.
9. Proof readback:
   visual scripts and live checks read `window.__MAZER_VISUAL_DIAGNOSTICS__`; reset-lane tests assert the stable contracts under `tests/reset/*`.

### Generation / reset owner chain

Use this before changing how mazes are built or how play/menu returns regenerate state.

- `docs/legacy/gameplay-spec.md`
  - legacy truth for staged `_ProcessCount` generation and process `8` reset behavior
- `src/legacy-runtime/legacyMaze.ts`
  - current one-shot maze builders:
  - `createLegacyMenuMaze()` for the fixed front-door snapshot
  - `createLegacyMaze()` for generated play mazes
- `src/legacy-runtime/legacyGenerationLifecycle.ts`
  - legacy process stage ids
  - menu-vs-play build routing
  - deterministic seed stepping for rebuild approximations
  - explicit checkpoint and shortcut budget formulas for the active runtime scale/mode
  - explicit delay-gated process-0 entry contract for queued generation
  - queued generation/reset request reasons and tick-consumption contract
  - explicit stage `0/3/4/5/6` execution cadence contract for menu-sliced versus play-continuous generation
  - explicit stage-7 finalize state for spawn, title visibility, and play timer start
  - generation metadata attached to runtime-created mazes
  - queued generation requests now carry build, stage, and budget metadata before tick consumption
- `src/legacy-runtime/legacyPlayLifecycle.ts`
  - explicit process-8 reset request contract for:
  - active-play return-to-menu hold
  - menu-demo regenerate-in-place branch
  - explicit initialized process-8 entry contract for reset consumption
- `src/scenes/MenuScene.ts`
  - `applyGenerationRequest()` rehydrates maze, player, trail, demo state, HUD, and layout from a named request
  - `queueGenerationRequest()` stages delayed menu/play rebuilds instead of collapsing every branch into immediate rebuild calls
  - `pendingResetRequest` now carries the explicit process-8 branch until the scene update consumes it
  - runtime diagnostics now publish generation budget metadata, process-entry gates, and full pending request contract state
  - `startPlayMode()` swaps from menu shell into active-play generation
  - `enterMenuMode()` returns active play back into menu flow after reset
  - `drawHud()` owns the compact timer chip, goal arrow, and published HUD proof bounds

Boundary:

- if the change is "what topology gets generated?", start in `src/legacy-runtime/legacyMaze.ts`
- if the change is "which builder, seed step, or process-stage contract applies?", start in `src/legacy-runtime/legacyGenerationLifecycle.ts`
- if the change is "what checkpoint/shortcut budget does the current runtime claim?", start in `src/legacy-runtime/legacyGenerationLifecycle.ts` and `window.__MAZER_VISUAL_DIAGNOSTICS__`
- if the change is "what legacy gate causes process 0 or process 8 to enter?", start in `src/legacy-runtime/legacyGenerationLifecycle.ts` and `src/legacy-runtime/legacyPlayLifecycle.ts`
- if the change is "when does the runtime rebuild or return to menu?", start in `src/scenes/MenuScene.ts`
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
| movement keys / arrows | `MenuScene.tryMovePlayer()` | `legacyMaze.ts` walkability gate -> trail/win reset |
| menu screenshot parity tweak | `legacyMenuSnapshot.ts`, `legacyMenuLayout.ts`, `MenuScene.ts` | geometry -> composition -> presentation |

## Active reset-lane subsystems

### Front door + play shell

- `src/scenes/MenuScene.ts`
  - runtime mode switch: `menu` vs `play`
  - overlay switch: `none | options | features | gameModes | pause | message`
  - front-door button behavior
  - title lockup opacity, scale, and vertical placement
  - board slab/frame presentation and menu-only chrome
  - active-play movement
  - HUD timer and goal arrow
  - menu demo stepping
  - reset return path
  - visual diagnostics published for visual proof

- `src/legacy-runtime/legacyPlayLifecycle.ts`
  - active-play goal-reset hold duration
  - explicit reset-request action/due-time contract
  - pending-reset gate for input and movement
  - due-reset return timing contract for active play and menu demo goal branches

- `src/legacy-runtime/legacyPlayStep.ts`
  - one-tile cardinal movement
  - wall-collision gate
  - trail append and trim behavior
  - goal-step detection

- `src/legacy-runtime/legacyMenuDemoLifecycle.ts`
  - menu demo bootstrap and preroll
  - menu demo trail/player projection
  - per-frame demo advance projection

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
- if the question is "what exactly changes after one movement key press?", start in `src/legacy-runtime/legacyPlayStep.ts`
- if the question is "how does the front-door demo bootstrap or advance?", start in `src/legacy-runtime/legacyMenuDemoLifecycle.ts`
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
   - expires message overlay state
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
   - `drawHud()` -> active-play timer + goal arrow only

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
| menu trench width / connection continuity | `src/legacy-runtime/legacyMenuRender.ts` + `src/scenes/MenuScene.ts` |
| slab/frame colors and backdrop haze | `src/scenes/MenuScene.ts` constants near `LEGACY_MENU_*` + `drawBackdrop()` |
| title opacity / shadow / wordmark presence | `src/scenes/MenuScene.ts` -> `refreshLayout()` + scene title text setup |
| front-door button box strength / label presence | `src/scenes/MenuScene.ts` -> `createButton()` |
| menu attract trail/player colors | `src/scenes/MenuScene.ts` dynamic board draw path |

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
| backdrop field | `src/scenes/MenuScene.ts#drawBackdrop()` | screenshot comparison |
| demo route / pacing | `src/legacy-runtime/legacyDemoWalker.ts` -> `src/domain/ai/demoWalker.ts` -> `src/scenes/MenuScene.ts` | `tests/ai/demo-walker.test.ts`, live preview |

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
  - safest place to edit menu-only maze geometry

- `src/legacy-runtime/legacyMaze.ts`
  - generated maze builder for play mode
  - adapter that converts the fixed menu snapshot blueprint into a `LegacyMazeSnapshot`

Boundary:

- If the change is menu screenshot parity only, start in `legacyMenuSnapshot.ts`
- If the change is active-play maze truth, start in `legacyMaze.ts`

### Fixed menu snapshot branch map

Use this before editing `legacyMenuSnapshot.ts` so you know which named branch is changing which part of the board.

| Branch id | Current role |
| --- | --- |
| `upper-ridge` | top-left to upper-mid ridge mass above the title trench |
| `top-spine` | highest top run that keeps the upper plate from reading too open |
| `upper-left-pocket` | small left interior inset that keeps the upper-left from flattening out |
| `upper-left-lattice` | nested upper-left trench family that restores the carved corner density |
| `left-frame` | tall left outer frame and lower-left anchor |
| `center-band` | center horizontal trench with the mid-board rightward turn |
| `center-pocket` | center-right pocket that feeds the diagonal/lower transition |
| `title-trench` | dark top-center trench behind and around the wordmark |
| `title-underlay-band` | upper-mid trench run below the wordmark that keeps the title plate from reading hollow |
| `left-interior-drop` | mid-left vertical drop that keeps the left interior from reading hollow |
| `mid-left-shelf` | left-middle shelf that thickens the interior mass before the diagonal drop |
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
- `tests/reset/legacy-reset.test.ts`
  - holds the direct tile assertions that keep screenshot-only branch additions from drifting silently

### Menu demo / attract behavior

- `src/legacy-runtime/legacyDemoWalker.ts`
  - adapts legacy maze snapshots into demo-walker episodes/config
  - fixed-snapshot menu-only demo policy and deterministic preroll
- `src/domain/ai/demoWalker.ts`
  - deterministic demo stepping, backtracking, goal hold, reset hold
  - cue overrides and cue-specific pacing for branch commit, dead-end, backtrack, and reacquire beats

Boundary:

- route shape lives in the legacy snapshot/generator
- route behavior over time lives in the demo walker

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
  - trail tail
  - menu-demo phase / cue / path cursor / preroll / wrong-turn policy
- `window.__MAZER_RUNTIME_DIAGNOSTICS__`
  - runtime-diagnostics readback for frame-window, low-power, and publish-cadence truth when enabled
  - current caveat: browser automation still may not surface the `window.__MAZER_*` globals directly even while the localhost canvas renders
- `data-mazer-runtime-diagnostics`
  - serialized DOM fallback for repo tooling and browser automation readback
- `#mazer-runtime-diagnostics`
  - visible proof-only panel for the in-app browser when `runtimeDiagnostics=1`

### Repo-owned tests most relevant to this lane

- `tests/reset/legacy-reset.test.ts`
  - front door, menu snapshot, HUD/minimal play shell, localhost boot cleanup
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
  - `src/scenes/MenuScene.ts`
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
