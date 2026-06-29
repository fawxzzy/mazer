# Architecture

This document tracks the repo-level structure that is currently truthful for the active lane.

Current lane:

- `legacy Unreal truth -> web app reset/port`

Primary cross-check:

- [`docs/current-truth.md`](./current-truth.md)
- [`docs/system-map.md`](./system-map.md)

## Active runtime

The active shipped/runtime path is a small Phaser shell with one boot scene and one owner scene:

- `src/boot/main.ts`
  - clears localhost service-worker/cache drift before boot
  - starts Phaser with the repo-owned config
- `src/boot/phaserConfig.ts`
  - wires only `BootScene` and `MenuScene`
- `src/scenes/BootScene.ts`
  - immediately routes to `MenuScene`
- `src/scenes/MenuScene.ts`
  - owns the front door, active play, HUD, overlays, reset flow, visual diagnostics, and menu demo

There is no separate active `GameScene` or `OptionsScene` in the reset lane. Those concerns now live inside `MenuScene` as mode/overlay state.

## Reset-lane ownership

The reset lane is intentionally split into small owner modules:

- `src/legacy-runtime/legacyDefaults.ts`
  - legacy settings defaults and front-door button truth
- `src/legacy-runtime/legacyMenuLayout.ts`
  - board/title/button placement across desktop and portrait
- `src/legacy-runtime/legacyOptionFields.ts`
  - menu/pause editable field parsing and application
- `src/legacy-runtime/legacyMenuSnapshot.ts`
  - fixed screenshot-shaped menu board blueprint for the front door
- `src/legacy-runtime/legacyMaze.ts`
  - generated active-play maze builder plus menu-snapshot adaptation
- `src/legacy-runtime/legacyDemoWalker.ts`
  - adapter from legacy maze snapshots into the repo-owned demo walker lane
- `src/domain/ai/demoWalker.ts`
  - deterministic attract/demo traversal behavior

## Runtime split that must stay stable

The current repo truth depends on this boundary:

- menu mode uses the fixed legacy snapshot lane
- play mode uses the generated solvable maze lane
- overlays are single-owner and single-active
- menu screenshot parity work must not silently mutate play behavior

## Verification

The reset lane closes against:

- `npm run legacy:extract`
- `npm run verify`

Supporting proof surfaces still matter for diagnosis and visual comparison:

- `npm run visual:matrix -- --preset core --skip-build true`
- `npm run edge:live`

## Parked and support lanes

These folders exist in the repo but are not current reset-lane shipping truth:

- `src/future-runtime/**`
  - parked future/planet and future Phaser experiments
- `src/mazer-core/**`
  - bounded research/runtime-core lane
- `src/visual-proof/**`
  - proof-only environment and rendering lane
- `src/topology-proof/**`
  - topology/readability proof surfaces
- `src/watch-pass-*`
  - separate watch-pass/product experiments

They remain important support material, but they are not the source of truth for the current menu/play port lane.
