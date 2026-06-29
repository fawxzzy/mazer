# System Map

This is the practical edit map for the current Mazer repo.

Use it when you want to change behavior without losing track of the whole application.

## Truth order

When sources disagree, read in this order:

1. `legacy/old-project.zip`
2. `legacy/screenshots/menu-01.png` .. `menu-04.png`
3. `docs/legacy/*`
4. `docs/current-truth.md`
5. current runtime code and tests

## Runtime boot graph

The active app entry path is:

1. `src/boot/main.ts`
2. `src/boot/phaserConfig.ts`
3. `src/scenes/BootScene.ts`
4. `src/scenes/MenuScene.ts`

Meaning:

- `main.ts` owns localhost service-worker/cache cleanup
- `phaserConfig.ts` owns the scene list and Phaser boot config
- `BootScene.ts` is only a handoff
- `MenuScene.ts` is the real application surface for the reset lane

## Full runtime directory map

Use this before large edits so you know the whole app, not just the current screen:

| Area | Ownership |
| --- | --- |
| `src/boot/*` | browser boot, localhost cleanup, Phaser startup |
| `src/scenes/*` | runtime shell, front door, overlays, play loop, HUD, live presentation |
| `src/legacy-runtime/*` | legacy-owned defaults, menu layout, menu snapshot, maze conversion, option field parsing |
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
| Phaser scene wiring | `src/boot/phaserConfig.ts` | `npm run build` |
| active front door and play shell | `src/scenes/MenuScene.ts` | in-app browser, `npm run verify` |
| fixed menu maze shape | `src/legacy-runtime/legacyMenuSnapshot.ts` | `tests/reset/legacy-reset.test.ts`, screenshots |
| generated play maze | `src/legacy-runtime/legacyMaze.ts` | `tests/reset/legacy-reset.test.ts` |
| menu title/board/button layout math | `src/legacy-runtime/legacyMenuLayout.ts` | `tests/reset/legacy-menu-layout.test.ts` |
| menu demo behavior | `src/legacy-runtime/legacyDemoWalker.ts`, `src/domain/ai/demoWalker.ts` | demo-walker tests, live menu preview |
| options field parsing | `src/legacy-runtime/legacyOptionFields.ts` | `tests/reset/legacy-option-fields.test.ts` |
| legacy defaults/colors/button labels | `src/legacy-runtime/legacyDefaults.ts` | `tests/reset/legacy-reset.test.ts` |
| archived visual truth | `legacy/screenshots/menu-01.png` .. `menu-04.png` | direct visual comparison |
| archived behavior truth | `legacy/old-project.zip`, `docs/legacy/*` | `npm run legacy:extract` |
| parity contract / open gaps | `docs/current-truth.md`, `docs/research/MAZER_LEGACY_WEB_PARITY_MATRIX.md` | latest packet + repo proof |

Rule:

- if you cannot name the owner surface and proof surface for a change, the change is not ready to make

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

### Legacy settings + menu shell helpers

- `src/legacy-runtime/legacyDefaults.ts`
  - canonical legacy defaults
  - `Exit / Start / Options`
- `src/legacy-runtime/legacyMenuLayout.ts`
  - title, board, and button frame math
  - spacing contract between board edge and `Exit / Start / Options`
- `src/legacy-runtime/legacyOptionFields.ts`
  - text-field draft parsing and settings mutation

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
  - `src/legacy-runtime/legacyDemoWalker.ts`
  - `src/domain/ai/demoWalker.ts`
  - `src/scenes/MenuScene.ts`
- play movement or win/reset loop:
  - `src/scenes/MenuScene.ts`
  - `docs/legacy/gameplay-spec.md`
- options/features/game modes/pause fields:
  - `src/legacy-runtime/legacyOptionFields.ts`
  - `src/scenes/MenuScene.ts`
- HUD timer / goal arrow:
  - `src/scenes/MenuScene.ts`
- localhost boot weirdness:
  - `src/boot/main.ts`
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

## Invariants to preserve

- gameplay truth comes from the restored Unreal project
- visual truth comes from `legacy/screenshots/*`
- menu mode and play mode stay split
- one active overlay at a time
- menu screenshot work must not silently rewrite play behavior
- do not claim 1:1 until the parity gaps are actually closed
